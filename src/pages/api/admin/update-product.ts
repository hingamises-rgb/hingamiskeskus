export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

const CATEGORIES = new Set(['kinkekaardid', 'paketid', 'vitamiinid', 'epsomi-sool']);

export const POST: APIRoute = async ({ request }) => {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  const slug = String(b.slug || '');
  const title = String(b.title || '').trim();
  const cartName = String(b.cart_name || '').trim();
  const price = Number(b.price);
  const category = String(b.category || '');

  if (!slug || !title || !cartName) return json({ error: 'Kohustuslikud väljad puuduvad' }, 400);
  if (!Number.isFinite(price) || price < 0) return json({ error: 'Vigane hind' }, 400);
  if (!CATEGORIES.has(category)) return json({ error: 'Vigane kategooria' }, 400);

  const oldPrice = b.old_price != null && b.old_price !== '' ? Number(b.old_price) : null;
  if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < 0)) return json({ error: 'Vigane vana hind' }, 400);

  const sql = requireDb();
  try {
    const res = await sql`
      UPDATE products SET
        title = ${title},
        cart_name = ${cartName},
        subtitle = ${b.subtitle ? String(b.subtitle).trim() : null},
        ribbon = ${b.ribbon ? String(b.ribbon).trim() : null},
        description = ${b.description ? String(b.description).trim() : null},
        price = ${price},
        old_price = ${oldPrice},
        price_prefix = ${b.price_prefix ? String(b.price_prefix).trim() : null},
        category = ${category},
        image = ${String(b.image || '').trim()},
        alt = ${String(b.alt || '').trim()},
        sort = ${Number.isFinite(Number(b.sort)) ? Number(b.sort) : 0},
        sold_out = ${!!b.sold_out},
        active = ${!!b.active},
        updated_at = now()
      WHERE slug = ${slug}
      RETURNING slug
    `;
    if (res.length === 0) return json({ error: 'Toodet ei leitud' }, 404);
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('update-product error:', e);
    return json({ error: 'Serveri viga' }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
