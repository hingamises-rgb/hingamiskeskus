// Lisab products tabelisse venekeelsed veerud ja täidab tõlked.
// Käivitamine: node scripts/add-ru-products.mjs
// NB: blogiviidetega lõigud on RU kirjeldustest välja jäetud (blogi ei tõlgita),
// sisemised lingid viivad /ru/ lehtedele, Hopitude lingid ru-lokaadile.
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sql = neon(process.env.DATABASE_URL);
const dir = dirname(fileURLToPath(import.meta.url));
const RU = JSON.parse(readFileSync(join(dir, 'products-ru.json'), 'utf8'));

await sql`ALTER TABLE products
  ADD COLUMN IF NOT EXISTS title_ru text,
  ADD COLUMN IF NOT EXISTS subtitle_ru text,
  ADD COLUMN IF NOT EXISTS ribbon_ru text,
  ADD COLUMN IF NOT EXISTS alt_ru text,
  ADD COLUMN IF NOT EXISTS description_ru text,
  ADD COLUMN IF NOT EXISTS meta_title_ru text,
  ADD COLUMN IF NOT EXISTS meta_description_ru text,
  ADD COLUMN IF NOT EXISTS page_slug_ru text`;

for (const p of RU) {
  const r = await sql`UPDATE products SET
    title_ru = ${p.title_ru},
    subtitle_ru = ${p.subtitle_ru},
    ribbon_ru = ${p.ribbon_ru},
    alt_ru = ${p.alt_ru ?? p.title_ru},
    description_ru = ${p.description_ru},
    meta_title_ru = ${p.meta_title_ru},
    meta_description_ru = ${p.meta_description_ru},
    page_slug_ru = ${p.page_slug_ru}
    WHERE slug = ${p.slug} RETURNING slug`;
  console.log(r.length ? 'OK' : 'PUUDUB!', p.slug);
}
console.log('Valmis.');
