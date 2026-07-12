// Paysera callback BRONEERINGU maksetele (orderid kujul "BK<id>.<id>...").
// Sama allkirjakontroll kui e-poe callbackil; märgib broneeringud makstuks.
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { requireDb } from '../../../lib/db';

const SIGN_PASSWORD = import.meta.env.PAYSERA_SIGN_PASSWORD || process.env.PAYSERA_SIGN_PASSWORD;

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
  const orderid = params.get('orderid') || '';

  const m = orderid.match(/^BK([\d.]+)$/);
  if (status === '1' && m) {
    const ids = m[1].split('.').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length) {
      try {
        const sql = requireDb();
        await sql`UPDATE bk_bookings SET paid = true WHERE id = ANY(${ids}) AND payment = 'paysera'`;
      } catch (e) {
        console.error('booking paysera-callback error', e);
        return new Response('DB ERROR', { status: 500 }); // Paysera proovib uuesti
      }
    }
  }
  return new Response('OK');
};
