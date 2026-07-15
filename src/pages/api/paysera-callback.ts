export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';
import { sql } from '../../lib/db';
import { grantShopPackages } from '../../lib/booking';

const SIGN_PASSWORD = import.meta.env.PAYSERA_SIGN_PASSWORD;
const EMAIL_USER = import.meta.env.EMAIL_USER || 'info@hingamiskeskus.ee';
const EMAIL_PASS = import.meta.env.EMAIL_PASS || '';
const NOTIFY_EMAIL = 'info@hingamiskeskus.ee';

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  connectionTimeout: 8000,
});

function shippingLabel(val: string) {
  if (val === 'pickup') return 'Tule ise järgi (Sõle 14C, Tallinn)';
  if (val === 'dpd') return 'DPD pakiautomaat';
  if (val === 'omniva') return 'Omniva pakiautomaat';
  return val;
}

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
  const amount = parseInt(params.get('amount') || '0', 10) / 100;
  const email = params.get('p_email') || '';
  const name = params.get('p_firstname') || '';
  const phone = params.get('p_phone') || '';
  const address = params.get('p_address') || '';
  const shipping = params.get('p_shipping') || '';
  const parcel = params.get('p_parcel') || '';
  const items = params.get('p_items') || '';

  if (status === '1') {
    // Salvesta tellimus andmebaasi (idempotentne — sama orderid ei duplitseeru)
    if (sql) {
      try {
        await sql`
          INSERT INTO orders (orderid, amount, name, email, phone, address, shipping, parcel, items)
          VALUES (${orderid}, ${amount}, ${name}, ${email}, ${phone}, ${address}, ${shipping}, ${parcel}, ${items})
          ON CONFLICT (orderid) DO NOTHING
        `;
      } catch (err) {
        console.error('Tellimuse salvestamine ebaõnnestus:', err);
      }

      // Paketiost → broneeritavad korrad automaatselt (idempotentne orderid järgi)
      try {
        const g = await grantShopPackages(email, name, items, orderid);
        if (g.granted) console.log(`Tellimus ${orderid}: loodud ${g.granted} paketti broneerimissüsteemi`);
      } catch (err) {
        console.error('Paketi loomine ebaõnnestus:', err);
      }
    }

    const shippingText = shippingLabel(shipping);
    const parcelText = parcel ? `<br/>Pakiautomaat: ${parcel}` : '';

    const shippingPrice = shipping === 'dpd' ? 3.10 : shipping === 'omniva' ? 3.46 : 0;
    const subtotal = amount - shippingPrice;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="font-size: 24px;">New Order ${orderid}</h1>
        <p style="color: #666;">${new Date().toLocaleDateString('et-EE')} | ${new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}</p>
        <p>Hingamises OÜ received a new order from ${name}.</p>

        <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 24px; margin: 20px 0;">
          <h2 style="font-size: 18px; margin-top: 0;">Order ${orderid} summary</h2>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p>${items}</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <table style="width: 100%; font-size: 14px;">
            <tr><td>Subtotal</td><td style="text-align: right;">€${subtotal.toFixed(2)}</td></tr>
            <tr><td>Shipping</td><td style="text-align: right;">€${shippingPrice.toFixed(2)}</td></tr>
            <tr><td><strong>Total</strong></td><td style="text-align: right;"><strong>€${amount.toFixed(2)}</strong></td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 14px;">Payment method: <strong>Paysera</strong></p>
        </div>

        <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 24px; margin: 20px 0;">
          <h2 style="font-size: 18px; margin-top: 0;">Customer information</h2>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p>${name}<br/>
          <a href="mailto:${email}">${email}</a><br/>
          ${phone}</p>
          <p><strong>Saatmine:</strong> ${shippingText}${parcelText}</p>
          ${address ? `<p><strong>Aadress:</strong> ${address}</p>` : ''}
        </div>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `"Hingamiskeskus" <info@hingamiskeskus.ee>`,
        to: NOTIFY_EMAIL,
        subject: `New Order ${orderid}`,
        html,
      });
    } catch (err) {
      console.error('Email sending failed:', err);
    }
  }

  return new Response('OK');
};
