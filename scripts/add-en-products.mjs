// Lisab products tabelisse ingliskeelsed veerud ja täidab tõlked.
// Käivitamine: node scripts/add-en-products.mjs
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sql = neon(process.env.DATABASE_URL);
const dir = dirname(fileURLToPath(import.meta.url));
const EN = JSON.parse(readFileSync(join(dir, 'products-en.json'), 'utf8'));

await sql`ALTER TABLE products
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS subtitle_en text,
  ADD COLUMN IF NOT EXISTS ribbon_en text,
  ADD COLUMN IF NOT EXISTS alt_en text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS meta_title_en text,
  ADD COLUMN IF NOT EXISTS meta_description_en text,
  ADD COLUMN IF NOT EXISTS page_slug_en text`;

for (const p of EN) {
  const r = await sql`UPDATE products SET
    title_en = ${p.title_en},
    subtitle_en = ${p.subtitle_en},
    ribbon_en = ${p.ribbon_en},
    alt_en = ${p.alt_en ?? p.title_en},
    description_en = ${p.description_en},
    meta_title_en = ${p.meta_title_en},
    meta_description_en = ${p.meta_description_en},
    page_slug_en = ${p.page_slug_en}
    WHERE slug = ${p.slug} RETURNING slug`;
  console.log(r.length ? 'OK' : 'PUUDUB!', p.slug);
}
console.log('Valmis.');
