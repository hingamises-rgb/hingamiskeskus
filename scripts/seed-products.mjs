// Loob products tabeli ja täidab selle e-poe praeguste toodetega (idempotentne).
// Kasutamine: node scripts/seed-products.mjs

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

await sql`
  CREATE TABLE IF NOT EXISTS products (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    cart_name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    old_price NUMERIC(10,2),
    price_prefix TEXT,
    category TEXT NOT NULL,
    sold_out BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

// Täpselt praeguse e-poe lehe andmed
const products = [
  // Kinkekaardid
  { slug: 'kinkekaart-40', title: 'Hingamiskeskuse kinkekaart 40 € floating ja hingamisteraapia Tallinnas', image: '/images/kinkekaart-40.png', cart_name: 'Kinkekaart 40€', price: 40, category: 'kinkekaardid', sort: 1 },
  { slug: 'kinkekaart-80', title: 'Hingamiskeskuse kinkekaart 80 € floating ja hingamisteraapia Tallinnas', image: '/images/kinkekaart-80.png', cart_name: 'Kinkekaart 80€', price: 80, category: 'kinkekaardid', sort: 2 },
  { slug: 'kinkekaart-120', title: 'Hingamiskeskuse kinkekaart 120 € floating ja hingamisteraapia Tallinnas', image: '/images/kinkekaart-120.png', cart_name: 'Kinkekaart 120€', price: 120, category: 'kinkekaardid', sort: 3 },
  // Paketid
  { slug: '3-korra-kaart', title: '3 korra kaart', image: '/images/pakett-3korda.png', cart_name: '3 korra kaart', price: 107, old_price: 120, category: 'paketid', sort: 1 },
  { slug: '5-korra-kaart', title: '5 korra kaart', image: '/images/pakett-5korda.png', cart_name: '5 korra kaart', price: 168, old_price: 200, category: 'paketid', sort: 2 },
  { slug: '10-korra-kaart', title: '10 korra kaart', image: '/images/pakett-10korda.png', cart_name: '10 korra kaart', price: 300, old_price: 400, category: 'paketid', sort: 3 },
  { slug: 'proovipakett', title: 'Keha ja meele 3x proovipakett', image: '/images/pakett-proovipakett.png', cart_name: 'Keha ja meele 3x proovipakett', price: 75, old_price: 120, category: 'paketid', sort: 4 },
  { slug: 'syvaloogastus', title: 'Süvalõõgastuspakett', image: '/images/pakett-syvaloogastus.png', cart_name: 'Süvalõõgastuspakett', price: 150, price_prefix: 'Al.', category: 'paketid', sort: 5 },
  { slug: 'heaolu', title: 'Heaolu pakett', image: '/images/pakett-heaolu.png', cart_name: 'Heaolu pakett', price: 300, category: 'paketid', sort: 6 },
  { slug: 'energialaeng', title: 'Sinu hommikune energialaeng', image: '/images/pakett-energialaeng.png', cart_name: 'Sinu hommikune energialaeng', price: 125, old_price: 200, category: 'paketid', sort: 7 },
  // Vitamiinid
  { slug: 'vitamiin-nac', title: 'Liposoomne C-vitamiin | NAC 260ml', image: '/images/vitamiin-nac.jpg', cart_name: 'Liposoomne C-vitamiin NAC 260ml', price: 17, category: 'vitamiinid', sort: 1 },
  { slug: 'vitamiin-original', title: 'Liposoomne C-vitamiin | Original 500ml', image: '/images/vitamiin-original.jpg', cart_name: 'Liposoomne C-vitamiin Original 500ml', price: 25, category: 'vitamiinid', sold_out: true, sort: 2 },
  { slug: 'vitamiin-c', title: 'Liposoomne C-vitamiin | C 500ml', image: '/images/vitamiin-c.jpg', cart_name: 'Liposoomne C-vitamiin C 500ml', price: 25, category: 'vitamiinid', sold_out: true, sort: 3 },
  { slug: 'vitamiin-red', title: 'Liposoomne C-vitamiin | Red 500ml', image: '/images/vitamiin-red.jpg', cart_name: 'Liposoomne C-vitamiin Red 500ml', price: 25, category: 'vitamiinid', sold_out: true, sort: 4 },
  { slug: 'vitamiin-blue', title: 'Liposoomne C-vitamiin | Blue 500ml', image: '/images/vitamiin-blue.jpg', cart_name: 'Liposoomne C-vitamiin Blue 500ml', price: 25, category: 'vitamiinid', sold_out: true, sort: 5 },
  { slug: 'vitamiin-green', title: 'Liposoomne C-vitamiin | Green 500ml', image: '/images/vitamiin-green.jpg', cart_name: 'Liposoomne C-vitamiin Green 500ml', price: 25, category: 'vitamiinid', sold_out: true, sort: 6 },
  // Epsomi sool
  { slug: 'epsomi-250g', title: 'Epsomi sool 250g', image: '/images/epsomi-250g.png', cart_name: 'Epsomi sool 250g', price: 3, category: 'epsomi-sool', sort: 1 },
  { slug: 'epsomi-750g', title: 'Epsomi sool 750g', image: '/images/epsomi-750g.png', cart_name: 'Epsomi sool 750g', price: 7, category: 'epsomi-sool', sort: 2 },
  { slug: 'epsomi-apelsin', title: 'Epsomi sool apelsini eeterliku õliga 250g', image: '/images/epsomi-apelsin.png', cart_name: 'Epsomi sool apelsini õliga 250g', price: 4, category: 'epsomi-sool', sort: 3 },
  { slug: 'epsomi-lavendel', title: 'Epsomi sool lavendli eeterliku õliga 250g', image: '/images/epsomi-lavendel.png', cart_name: 'Epsomi sool lavendli õliga 250g', price: 4, category: 'epsomi-sool', sort: 4 },
  { slug: 'epsomi-sidrunhein', title: 'Epsomi sool sidrunheina eeterliku õliga 250g', image: '/images/epsomi-sidrunhein.png', cart_name: 'Epsomi sool sidrunheina õliga 250g', price: 4, category: 'epsomi-sool', sort: 5 },
];

let inserted = 0, skipped = 0;
for (const p of products) {
  const res = await sql`
    INSERT INTO products (slug, title, alt, image, cart_name, price, old_price, price_prefix, category, sold_out, sort)
    VALUES (${p.slug}, ${p.title}, ${p.title}, ${p.image}, ${p.cart_name}, ${p.price},
            ${p.old_price ?? null}, ${p.price_prefix ?? null}, ${p.category}, ${p.sold_out ?? false}, ${p.sort})
    ON CONFLICT (slug) DO NOTHING
    RETURNING slug
  `;
  if (res.length > 0) inserted++; else skipped++;
}

console.log(`Valmis. Lisatud: ${inserted}, juba olemas: ${skipped}`);
