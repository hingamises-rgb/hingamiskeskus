// Broneeringu Paysera-makse algatamine: leiab tokenite järgi maksmata broneeringud,
// koostab makse (orderid = "BK<id>.<id>..."), kliendi brauser POSTib data+sign Payserasse.
// NB: töötab ainult hingamiskeskus.ee domeenilt (Paysera projekt 253930 piirang).
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { requireDb } from '../../../lib/db';

const PROJECT_ID = '253930';
const SIGN_PASSWORD = import.meta.env.PAYSERA_SIGN_PASSWORD || process.env.PAYSERA_SIGN_PASSWORD;

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
  const tokens: string[] = Array.isArray(b.tokens) ? b.tokens.map(String).slice(0, 6) : [];
  if (!tokens.length || tokens.some((t) => t.length < 20)) return json({ error: 'invalid' }, 400);

  const sql = requireDb();
  try {
    const rows = await sql`
      SELECT b.id, b.amount_cents, b.token, c.email, c.name, c.phone
      FROM bk_bookings b JOIN bk_clients c ON c.id = b.client_id
      WHERE b.token = ANY(${tokens}) AND b.status = 'active'
        AND b.payment = 'paysera' AND NOT b.paid
    `;
    if (!rows.length) return json({ error: 'not_found' }, 404);

    const total = rows.reduce((a: number, r: any) => a + r.amount_cents, 0);
    if (total <= 0) return json({ error: 'nothing_to_pay' }, 400);
    const orderid = 'BK' + rows.map((r: any) => r.id).join('.');
    const origin = new URL(request.url).origin;
    const first = rows[0];

    const params: Record<string, string> = {
      projectid: PROJECT_ID,
      orderid,
      accepturl: `${origin}/broneering/${tokens[0]}?makse=ok`,
      cancelurl: `${origin}/broneering/${tokens[0]}?makse=katkes`,
      callbackurl: `${origin}/api/booking/paysera-callback`,
      amount: String(total),
      currency: 'EUR',
      country: 'EE',
      paytext: `Hingamiskeskus broneering ${orderid}`,
      p_email: first.email,
      p_firstname: first.name || '',
      p_phone: first.phone || '',
      test: '0',
      version: '1.6',
    };

    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const data = Buffer.from(query).toString('base64');
    const sign = createHash('md5').update(data + SIGN_PASSWORD).digest('hex');

    return json({ url: 'https://www.paysera.com/pay/', data, sign });
  } catch (e) {
    console.error('booking pay error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
