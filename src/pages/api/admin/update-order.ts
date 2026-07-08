export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  const orderid = String(body.orderid || '');
  if (!orderid) return json({ error: 'orderid puudub' }, 400);

  const sql = requireDb();

  try {
    if (body.fulfillment === 'fulfilled' || body.fulfillment === 'unfulfilled') {
      await sql`UPDATE orders SET fulfillment = ${body.fulfillment} WHERE orderid = ${orderid}`;
    }
    if (typeof body.note === 'string') {
      await sql`UPDATE orders SET note = ${body.note} WHERE orderid = ${orderid}`;
    }
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('update-order error:', e);
    return json({ error: 'Serveri viga' }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
