// Saadab e-postile 6-kohalise kinnituskoodi (paketi/krediidi/liikmehinna kasutamiseks).
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';
import { createEmailCode } from '../../../lib/booking';
import { sendCode } from '../../../lib/booking-emails';

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const locale = ['et', 'ru', 'en'].includes(b.locale) ? b.locale : 'et';
  if (!email.includes('@')) return json({ error: 'invalid' }, 400);

  try {
    // lihtne kaitse: max 3 koodi 15 min jooksul sama e-posti kohta
    const sql = requireDb();
    const recent = await sql`
      SELECT count(*) AS n FROM bk_email_codes
      WHERE email = ${email} AND created_at > now() - interval '15 minutes'
    `;
    if (Number(recent[0].n) >= 3) return json({ error: 'rate_limit' }, 429);

    const code = await createEmailCode(email);
    await sendCode(email, code, locale);
    return json({ ok: true });
  } catch (e) {
    console.error('request-code error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
