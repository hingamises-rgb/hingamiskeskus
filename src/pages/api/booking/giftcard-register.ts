// Make.com registreerib genereeritud kinkekaardi koodi (HTTP-moodul stsenaariumi lõpus).
// POST { code: "ABC123", amount: 40 }  — amount eurodes (40/80/120 → 1/2/3 seanssi)
// Header: x-giftcard-secret peab võrduma env GIFTCARD_SECRET väärtusega.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.GIFTCARD_SECRET || process.env.GIFTCARD_SECRET || '';
  if (!secret || request.headers.get('x-giftcard-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }

  const code = String(b.code || '').trim().toUpperCase().slice(0, 60);
  const amount = Number(b.amount) || 0;
  if (!code || code.length < 3) return json({ error: 'invalid_code' }, 400);

  // 40€ = 1 seanss, 80€ = 2, 120€ = 3; muu summa → vähemalt 1 seanss
  const sessions = Math.max(1, Math.min(10, Math.round(amount / 40)));

  const sql = requireDb();
  try {
    const rows = await sql`
      INSERT INTO bk_giftcards (code, sessions, amount_cents, source, note)
      VALUES (${code}, ${sessions}, ${Math.round(amount * 100) || null}, 'make', ${String(b.note || '').slice(0, 200) || null})
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    `;
    return json({ ok: true, created: rows.length > 0, sessions });
  } catch (e) {
    console.error('giftcard-register error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
