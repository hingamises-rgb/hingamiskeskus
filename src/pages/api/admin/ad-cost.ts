export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

const CHANNELS = new Set(['google', 'meta', 'muu']);

export const POST: APIRoute = async ({ request }) => {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  const month = String(b.month || ''); // formaat YYYY-MM
  const channel = String(b.channel || '');
  const amount = Number(b.amount);

  if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: 'Vigane kuu' }, 400);
  if (!CHANNELS.has(channel)) return json({ error: 'Vigane kanal' }, 400);
  if (!Number.isFinite(amount) || amount < 0) return json({ error: 'Vigane summa' }, 400);

  const sql = requireDb();
  try {
    await sql`
      INSERT INTO ad_costs (month, channel, amount)
      VALUES (${month + '-01'}, ${channel}, ${amount})
      ON CONFLICT (month, channel) DO UPDATE SET amount = ${amount}
    `;
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('ad-cost error:', e);
    return json({ error: 'Serveri viga' }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
