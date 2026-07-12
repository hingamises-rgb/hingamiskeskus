// Stripe webhook: Liikme paketi (59€/kuu) iga kuumakse lisab kliendile automaatselt
// 2 korda, mis kehtivad 12 KUUD (liikmelisuse tingimused: kasutamata korrad kehtivad
// 1 aasta!), ja pikendab liikmestaatust (member_until) — liikmehind 30€/kord rakendub
// broneerimisel automaatselt.
//
// Seadistus Stripe'is (teha koos kasutajaga deploy järel):
//   Dashboard → Developers → Webhooks → Add endpoint
//   URL: https://www.hingamiskeskus.ee/api/booking/stripe-webhook
//   Event: invoice.paid
//   Signing secret (whsec_...) → env STRIPE_WEBHOOK_SECRET (Vercel + .env)
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireDb } from '../../../lib/db';
import { upsertClient, addDays, nowTallinn } from '../../../lib/booking';

const WEBHOOK_SECRET = import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';

const MEMBER_SESSIONS = 2;
const MEMBER_VALID_DAYS = 365;   // tingimused: kasutamata korrad kehtivad 1 aasta
const MEMBER_STATUS_DAYS = 40;   // liikmestaatus kuumakse järel (kuu + varu)

function verifyStripeSignature(payload: string, header: string): boolean {
  // Stripe-Signature: t=<ts>,v1=<hmac>,...  — HMAC-SHA256(`${t}.${payload}`, secret)
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false; // 10 min tolerants
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  const a = Buffer.from(v1), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request }) => {
  if (!WEBHOOK_SECRET) return new Response('webhook not configured', { status: 503 });

  const payload = await request.text();
  const sig = request.headers.get('stripe-signature') || '';
  if (!verifyStripeSignature(payload, sig)) {
    return new Response('invalid signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(payload); } catch { return new Response('bad json', { status: 400 }); }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    const inv = event.data?.object || {};
    const email = String(inv.customer_email || '').trim().toLowerCase();
    const invoiceId = String(inv.id || '');
    const name = String(inv.customer_name || '');
    if (email.includes('@') && invoiceId) {
      try {
        const sql = requireDb();
        // idempotentne: sama arve ei anna kordi topelt (Stripe võib event'i korrata)
        const existing = await sql`SELECT 1 FROM bk_packages WHERE order_id = ${invoiceId} LIMIT 1`;
        if (!existing.length) {
          const client = await upsertClient(email, name, '', 'et');
          const now = nowTallinn();
          await sql`
            INSERT INTO bk_packages (client_id, name, total_sessions, valid_until, source, order_id)
            VALUES (${client.id}, 'Liikme pakett', ${MEMBER_SESSIONS},
              ${addDays(now.date, MEMBER_VALID_DAYS)}, 'stripe', ${invoiceId})
          `;
          await sql`
            UPDATE bk_clients SET member_until = ${addDays(now.date, MEMBER_STATUS_DAYS)}
            WHERE id = ${client.id}
          `;
          console.log(`Stripe: liikme korrad lisatud (${invoiceId})`);
        }
      } catch (e) {
        console.error('stripe webhook error', e);
        return new Response('db error', { status: 500 }); // Stripe kordab
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
