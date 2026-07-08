// Andmebaasi seadistus: loob tabelid ja admin kasutajad.
// Kasutamine:
//   DATABASE_URL="postgres://..." node scripts/init-db.mjs
// Loeb DATABASE_URL ka .env failist kui olemas.

import { neon } from '@neondatabase/serverless';
import { scryptSync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// .env laadimine kui DATABASE_URL pole keskkonnas
if (!process.env.DATABASE_URL && existsSync('.env')) {
  const env = await readFile('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL puudub. Käivita: DATABASE_URL="postgres://..." node scripts/init-db.mjs');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function generatePassword() {
  // 16 tähemärki, loetav (ilma segadust tekitavate märkideta)
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(16)).map(b => chars[b % chars.length]).join('');
}

console.log('Loon tabelid...');

await sql`
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    orderid TEXT UNIQUE NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid',
    fulfillment TEXT NOT NULL DEFAULT 'unfulfilled',
    name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    shipping TEXT,
    parcel TEXT,
    items TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (email)`;
await sql`CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at)`;

await sql`
  CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

console.log('Tabelid olemas.');

const existing = await sql`SELECT username FROM admin_users`;
if (existing.length > 0) {
  console.log('Admin kasutajad juba olemas:', existing.map(u => u.username).join(', '));
  console.log('Parooli vahetamiseks kustuta kasutaja ja käivita skript uuesti.');
} else {
  const users = [
    { username: 'alarih' },
    { username: 'tootaja' },
  ];
  console.log('\n=== ADMIN KASUTAJAD (salvesta paroolid kohe!) ===\n');
  for (const u of users) {
    const password = generatePassword();
    await sql`INSERT INTO admin_users (username, password_hash) VALUES (${u.username}, ${hashPassword(password)})`;
    console.log(`  kasutaja: ${u.username}`);
    console.log(`  parool:   ${password}\n`);
  }
  console.log('Neid paroole rohkem ei kuvata — hoia turvalises kohas (nt parooliholdur).');
}

console.log('\nValmis. Admin paneel: /admin/login');
