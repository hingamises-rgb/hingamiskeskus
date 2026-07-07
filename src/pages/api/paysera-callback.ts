export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';

const SIGN_PASSWORD = import.meta.env.PAYSERA_SIGN_PASSWORD;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const data = url.searchParams.get('data') || '';
  const ss1 = url.searchParams.get('ss1') || '';

  const expectedSign = createHash('md5').update(data + SIGN_PASSWORD).digest('hex');

  if (ss1 !== expectedSign) {
    return new Response('INVALID SIGN', { status: 400 });
  }

  const decoded = Buffer.from(data, 'base64').toString('utf-8');
  const params = new URLSearchParams(decoded);

  const status = params.get('status');
  const orderid = params.get('orderid');

  if (status === '1') {
    console.log(`Makse õnnestus: tellimus ${orderid}`);
  }

  return new Response('OK');
};
