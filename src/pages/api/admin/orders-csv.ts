export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const GET: APIRoute = async () => {
  const sql = requireDb();
  const orders = await sql`
    SELECT orderid, amount, fulfillment, name, email, phone, address, shipping, parcel, items, note, created_at
    FROM orders ORDER BY created_at DESC
  `;

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Tellimus,Aeg,Nimi,Email,Telefon,Aadress,Saatmine,Pakiautomaat,Tooted,Summa,Staatus,Märkmed'];
  for (const o of orders) {
    lines.push([
      esc(o.orderid),
      new Date(o.created_at).toISOString().replace('T', ' ').slice(0, 16),
      esc(o.name), esc(o.email), esc(o.phone), esc(o.address),
      esc(o.shipping), esc(o.parcel), esc(o.items),
      Number(o.amount).toFixed(2),
      o.fulfillment === 'fulfilled' ? 'Täidetud' : 'Täitmata',
      esc(o.note),
    ].join(','));
  }

  return new Response('﻿' + lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tellimused.csv"',
    },
  });
};
