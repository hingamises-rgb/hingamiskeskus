// Kliendi olekulipud e-posti järgi. TEADLIKULT ainult tõeväärtused —
// pakettide sisu näeb alles pärast e-posti kinnitamist (kood või seadmeküpsis).
export const prerender = false;

import type { APIRoute } from 'astro';
import { clientFlags, clientAssets, verifyDeviceToken } from '../../../lib/booking';

export const POST: APIRoute = async ({ request, cookies }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!email.includes('@')) return json({ error: 'invalid' }, 400);

  try {
    const flags = await clientFlags(email);
    const device = cookies.get('hk_bk_dev')?.value;
    const verified = verifyDeviceToken(device, email);
    const out: any = { ...flags, verified };
    if (verified) out.assets = await clientAssets(email);
    return json(out);
  } catch (e) {
    console.error('flags error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
