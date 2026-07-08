// Lisab kraabitud tootekirjeldused andmebaasi (subtitle, description, ribbon, page_slug).
import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  const env = await readFile('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS subtitle TEXT`;
await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT`;
await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS ribbon TEXT`;
await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS page_slug TEXT`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS products_page_slug_idx ON products (page_slug) WHERE page_slug IS NOT NULL`;

// Vana lehe URL → meie toote slug
const MAP = {
  '/heaolu-pakett': 'heaolu',
  '/5-korra-kaart': '5-korra-kaart',
  '/3-korra-kaart': '3-korra-kaart',
  '/10-korra-kaart': '10-korra-kaart',
  '/epsomi-sool-lavendli-oliga': 'epsomi-lavendel',
  '/epsomi-sool-apelsini-oliga': 'epsomi-apelsin',
  '/kinkekaart-80euro': 'kinkekaart-80',
  '/kinkekaart-40euro': 'kinkekaart-40',
  '/kinkekaart-120euro': 'kinkekaart-120',
  '/suvaloogastuspakett': 'syvaloogastus',
  '/hommikune-energialaeng-0650': 'energialaeng',
  '/3x-floatingu-eripakett': 'proovipakett',
  '/epsomi-sool-750g': 'epsomi-750g',
  '/epsomi-sool-': 'epsomi-250g',
  '/epsomi-sool--0c26': 'epsomi-sidrunhein',
  '/lipovita-nac': 'vitamiin-nac',
  '/lipovitac': 'vitamiin-original',
  '/lipovitac-green': 'vitamiin-green',
  '/lipovitac-plus': 'vitamiin-blue',
  '/lipovitac-vitamin-c-drink': 'vitamiin-c',
  '/lipovitac-field-nutrition-drink': 'vitamiin-red',
};

const scraped = JSON.parse(await readFile('scripts/scraped-products.json', 'utf8'));
let updated = 0;
for (const p of scraped) {
  const slug = MAP[p.path];
  if (!slug) { console.warn('Mappimata:', p.path); continue; }
  const pageSlug = p.path.replace(/^\//, '');
  const res = await sql`
    UPDATE products SET
      subtitle = ${p.subtitle || null},
      description = ${p.description || null},
      ribbon = ${p.ribbon || null},
      page_slug = ${pageSlug}
    WHERE slug = ${slug}
    RETURNING slug
  `;
  if (res.length > 0) { updated++; console.log(`${slug} <- ${p.path}`); }
  else console.warn('Toodet ei leitud DB-s:', slug);
}
console.log(`\nUuendatud: ${updated}/21`);
