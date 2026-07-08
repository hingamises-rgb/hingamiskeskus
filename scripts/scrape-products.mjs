// Kraabib vana saidi tootelehtede sisu (title, subtitle, description, ribbon).
// Kasutamine: node scripts/scrape-products.mjs

import { writeFile } from 'node:fs/promises';

const BASE = 'https://www.hingamiskeskus.ee';
const PATHS = [
  '/heaolu-pakett', '/5-korra-kaart', '/3-korra-kaart', '/10-korra-kaart',
  '/epsomi-sool-lavendli-oliga', '/epsomi-sool-apelsini-oliga',
  '/kinkekaart-80euro', '/kinkekaart-40euro', '/kinkekaart-120euro',
  '/suvaloogastuspakett', '/hommikune-energialaeng-0650', '/3x-floatingu-eripakett',
  '/epsomi-sool-750g', '/epsomi-sool-', '/epsomi-sool--0c26',
  '/lipovita-nac', '/lipovitac', '/lipovitac-green', '/lipovitac-plus',
  '/lipovitac-vitamin-c-drink', '/lipovitac-field-nutrition-drink',
];

function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

// Ekstrakti väli productData plokist: "field":[0,"value"] või [0,null]
function extractField(area, field) {
  const marker = `&quot;${field}&quot;:[0,`;
  const idx = area.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  if (area.startsWith('null', start)) return null;
  if (!area.startsWith('&quot;', start)) return null;
  const cStart = start + 6;
  let end = cStart;
  while (end < area.length) {
    const nextQuote = area.indexOf('&quot;', end);
    if (nextQuote === -1) return null;
    if (area[nextQuote - 1] === '\\') { end = nextQuote + 6; continue; }
    return decode(area.substring(cStart, nextQuote));
  }
  return null;
}

function cleanDescription(html) {
  if (!html) return '';
  return html
    .replace(/\starget="[^"]*"/g, '')
    .replace(/\srel="[^"]*"/g, '')
    .replace(/href="https:\/\/(?:www\.)?hingamiskeskus\.ee(\/[^"]*)"/g, 'href="$1"')
    .replace(/\s+/g, ' ')
    .trim();
}

const results = [];
for (const path of PATHS) {
  process.stdout.write(path.padEnd(40));
  try {
    const html = await fetch(BASE + path).then(r => r.text());
    const pdIdx = html.indexOf('&quot;productData&quot;');
    if (pdIdx === -1) { console.log('productData PUUDUB'); continue; }
    const area = html.substring(pdIdx, pdIdx + 60000);
    const title = extractField(area, 'title');
    const subtitle = extractField(area, 'subtitle');
    const ribbon = extractField(area, 'ribbon_text');
    const description = cleanDescription(extractField(area, 'description'));
    results.push({ path, title, subtitle, ribbon, description });
    console.log(`OK: ${title} (kirjeldus ${description.length}c, subtitle: ${subtitle ? 'jah' : '-'})`);
  } catch (e) {
    console.log('VIGA:', e.message);
  }
  await new Promise(r => setTimeout(r, 150));
}

await writeFile('scripts/scraped-products.json', JSON.stringify(results, null, 2));
console.log(`\n${results.length} toodet salvestatud scripts/scraped-products.json`);
