// Kontrollib e-posti kinnituskoodi; õnnestumisel jätab seadme meelde (90 päeva küpsis)
// ja tagastab kliendi paketid + ettemaksu.
export const prerender = false;

import type { APIRoute } from 'astro';
import { checkEmailCode, deviceToken, clientAssets } from '../../../lib/booking';

export const POST: APIRoute = async ({ request, cookies }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  if (!email.includes('@') || !/^\d{6}$/.test(code)) return json({ error: 'invalid' }, 400);

  try {
    const ok = await checkEmailCode(email, code);
    if (!ok) return json({ error: 'wrong_code' }, 400);
    cookies.set('hk_bk_dev', deviceToken(email), {
      path: '/', httpOnly: true, sameSite: 'lax', secure: true,
      maxAge: 90 * 86400,
    });
    const assets = await clientAssets(email);
    return json({ ok: true, assets });
  } catch (e) {
    console.error('verify-code error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
