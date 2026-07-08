export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

const PAYMENTS = new Set(['sularaha', 'ulekanne', 'kaart', 'muu']);

export const POST: APIRoute = async ({ request }) => {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  const items = String(b.items || '').trim();
  const amount = Number(b.amount);
  const payment = String(b.payment || 'muu');

  if (!items) return json({ error: 'Tooted puuduvad' }, 400);
  if (!Number.isFinite(amount) || amount < 0) return json({ error: 'Vigane summa' }, 400);
  if (!PAYMENTS.has(payment)) return json({ error: 'Vigane makseviis' }, 400);

  // Kuupäev: YYYY-MM-DD (Tallinna päev), salvestame keskpäevana et vältida TZ nihkeid
  let createdAt = new Date();
  if (typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    createdAt = new Date(`${b.date}T12:00:00+03:00`);
  }

  // Genereeri unikaalne käsitsi tellimuse number: M-240708-1234
  const stamp = createdAt.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  const orderid = `M-${stamp}-${rand}`;

  const sql = requireDb();
  try {
    await sql`
      INSERT INTO orders (orderid, amount, status, fulfillment, name, email, phone, shipping, items, note, payment, created_at)
      VALUES (${orderid}, ${amount}, ${'paid'}, ${'fulfilled'}, ${String(b.name || '')}, ${String(b.email || '')},
              ${String(b.phone || '')}, ${'kohapeal'}, ${items}, ${String(b.note || '') || null}, ${payment}, ${createdAt.toISOString()})
    `;
    return json({ ok: true, orderid }, 200);
  } catch (e) {
    console.error('create-order error:', e);
    return json({ error: 'Serveri viga' }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
