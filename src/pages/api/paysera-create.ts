export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';

const PROJECT_ID = '253930';
const SIGN_PASSWORD = import.meta.env.PAYSERA_SIGN_PASSWORD;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { orderid, amount, email, description, payment, fullname, phone, address, city, postal, shipping, parcel } = body;

  if (!orderid || !amount || !email) {
    return new Response(JSON.stringify({ error: 'Puuduvad andmed' }), { status: 400 });
  }

  const origin = new URL(request.url).origin;

  const params: Record<string, string> = {
    projectid: PROJECT_ID,
    orderid: String(orderid),
    accepturl: `${origin}/makse-tehtud`,
    cancelurl: `${origin}/makse-ebaonnestus`,
    callbackurl: `${origin}/api/paysera-callback`,
    amount: String(Math.round(amount * 100)),
    currency: 'EUR',
    country: 'EE',
    paytext: description || `Hingamiskeskus tellimus ${orderid}`,
    p_email: email,
    p_firstname: fullname || '',
    p_phone: phone || '',
    p_address: [address, city, postal].filter(Boolean).join(', '),
    p_shipping: shipping || '',
    p_parcel: parcel || '',
    p_items: description || '',
    test: '0',
    version: '1.6',
  };

  const PAYMENT_MAP: Record<string, string> = {
    popular: 'card',
    swedbank: 'hanzabankas',
    seb: 'sebbankas',
    luminor: 'nordea',
    citadele: 'citadele_ee',
    coop: 'krediidipank',
    lhv: 'lhv',
    revolut: 'revolut',
    transfer: 'transfer',
  };
  if (payment && PAYMENT_MAP[payment]) {
    params.payment = PAYMENT_MAP[payment];
  }

  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const data = Buffer.from(query).toString('base64');
  const sign = createHash('md5').update(data + SIGN_PASSWORD).digest('hex');

  return new Response(
    JSON.stringify({
      url: 'https://www.paysera.com/pay/',
      data,
      sign,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
