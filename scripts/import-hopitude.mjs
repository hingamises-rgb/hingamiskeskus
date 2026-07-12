// Hopitude klientide ja pakettide import broneerimissüsteemi.
//
// Kasutamine:
//   node scripts/import-hopitude.mjs kliendid.csv            # ainult kliendid
//   node scripts/import-hopitude.mjs kliendid.csv paketid.csv # kliendid + paketid
//   Lisa --dry-run et näha, mida tehtaks, ilma andmebaasi kirjutamata.
//
// CSV veergude nimed tuvastatakse päisereast paindlikult (Hopitude ekspordi täpne
// formaat selgub failist — kui mõni veerg jääb tuvastamata, skript ütleb selle välja
// ja siis tuleb allpool COLUMN_ALIASES nimekirja õige päis lisada).
//
// Idempotentne: sama e-postiga klienti ei duplitseerita (olemasoleva andmeid EI
// kirjutata üle); paketti ei lisata teist korda, kui samal kliendil on juba sama
// nime ja kehtivusega import-pakett.

import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Kasutamine: node scripts/import-hopitude.mjs kliendid.csv [paketid.csv] [--dry-run]');
  process.exit(1);
}

if (!process.env.DATABASE_URL && existsSync('.env')) {
  const env = await readFile('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const sql = neon(process.env.DATABASE_URL);

// --- CSV parser (toetab jutumärke, semikoolonit ja koma eraldajana) ---
function parseCSV(text) {
  const firstLine = text.slice(0, text.indexOf('\n'));
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

// Veerunimede vasted (väiketähtedega, osaline sobivus). Täienda vajadusel Hopitude
// tegeliku ekspordi päiste järgi!
const COLUMN_ALIASES = {
  email: ['email', 'e-mail', 'e-post', 'epost', 'mail'],
  name: ['nimi', 'name', 'eesnimi', 'klient', 'client', 'täisnimi', 'full name'],
  lastname: ['perekonnanimi', 'last name', 'surname', 'perenimi'],
  phone: ['telefon', 'phone', 'tel', 'mobiil', 'number'],
  visits: ['total classes', 'külastus', 'visits', 'treeningud'],
  pkgname: ['pakett', 'package', 'paketi nimi', 'toode', 'nimetus'],
  total: ['kordi', 'kordade arv', 'sessions', 'korrad', 'kogus', 'mahus'],
  used: ['kasutatud', 'used', 'tarbitud'],
  validuntil: ['kehtivus', 'kehtib kuni', 'valid until', 'aegub', 'expires', 'lõpp'],
};

function mapColumns(header) {
  const map = {};
  header.forEach((h, i) => {
    const low = h.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[key] === undefined && aliases.some((a) => low === a || low.includes(a))) map[key] = i;
    }
  });
  return map;
}

// Kuupäev "DD.MM.YYYY" või "YYYY-MM-DD" → "YYYY-MM-DD"
function toISO(d) {
  const s = String(d || '').trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return null;
}

// --- 1. fail: kliendid ---
const clientRows = parseCSV(await readFile(files[0], 'utf8'));
const cmap = mapColumns(clientRows[0]);
console.log('Klientide veerud tuvastatud:', JSON.stringify(cmap));
if (cmap.email === undefined) {
  console.error('E-posti veergu ei leitud! Päis oli:', clientRows[0].join(' | '));
  process.exit(1);
}

let added = 0, skipped = 0, invalid = 0;
for (const row of clientRows.slice(1)) {
  const email = String(row[cmap.email] || '').trim().toLowerCase();
  if (!email.includes('@')) { invalid++; continue; }
  const name = [row[cmap.name], row[cmap.lastname]].filter(Boolean).join(' ').trim();
  const phone = String(row[cmap.phone] || '').trim();
  const visits = cmap.visits !== undefined ? parseInt(row[cmap.visits], 10) || 0 : 0;
  if (DRY) { added++; continue; }
  const res = await sql`
    INSERT INTO bk_clients (email, name, phone, visits)
    VALUES (${email}, ${name || null}, ${phone || null}, ${visits})
    ON CONFLICT (email) DO UPDATE SET visits = GREATEST(bk_clients.visits, ${visits})
    RETURNING (xmax = 0) AS inserted
  `;
  if (res[0]?.inserted) added++; else skipped++;
}
console.log(`Kliendid: lisatud ${added}, juba olemas ${skipped}, vigase e-postiga ${invalid}${DRY ? ' (DRY RUN)' : ''}`);

// --- 2. fail: aktiivsed paketid ---
if (files[1]) {
  const pkgRows = parseCSV(await readFile(files[1], 'utf8'));
  const pmap = mapColumns(pkgRows[0]);
  console.log('Pakettide veerud tuvastatud:', JSON.stringify(pmap));
  for (const need of ['email', 'pkgname', 'total']) {
    if (pmap[need] === undefined) {
      console.error(`Pakettide failis puudub veerg: ${need}. Päis oli:`, pkgRows[0].join(' | '));
      process.exit(1);
    }
  }
  let padded = 0, pskip = 0, pinvalid = 0;
  for (const row of pkgRows.slice(1)) {
    const email = String(row[pmap.email] || '').trim().toLowerCase();
    const name = String(row[pmap.pkgname] || '').trim();
    const total = parseInt(row[pmap.total], 10);
    const used = pmap.used !== undefined ? parseInt(row[pmap.used] || '0', 10) || 0 : 0;
    const validUntil = toISO(row[pmap.validuntil]);
    if (!email.includes('@') || !name || !total || !validUntil) { pinvalid++; continue; }
    if (used >= total) { pskip++; continue; } // ammendunud pakette ei impordi
    if (DRY) { padded++; continue; }
    const client = (await sql`SELECT id FROM bk_clients WHERE email = ${email}`)[0];
    if (!client) { pinvalid++; continue; }
    const dup = await sql`
      SELECT 1 FROM bk_packages WHERE client_id = ${client.id} AND name = ${name}
        AND valid_until = ${validUntil} AND source = 'import' LIMIT 1
    `;
    if (dup.length) { pskip++; continue; }
    await sql`
      INSERT INTO bk_packages (client_id, name, total_sessions, used_sessions, valid_until, source)
      VALUES (${client.id}, ${name}, ${total}, ${used}, ${validUntil}, 'import')
    `;
    padded++;
  }
  console.log(`Paketid: lisatud ${padded}, vahele jäetud ${pskip}, vigased/ammendunud ${pinvalid}${DRY ? ' (DRY RUN)' : ''}`);
}

console.log('Valmis.');
