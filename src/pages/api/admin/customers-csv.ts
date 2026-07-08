export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const GET: APIRoute = async () => {
  const sql = requireDb();
  const customers = await sql`
    SELECT email, MAX(name) AS name, COUNT(*) AS orders, SUM(amount) AS total, MAX(created_at) AS last_order
    FROM orders GROUP BY email ORDER BY SUM(amount) DESC
  `;

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Email,Nimi,Tellimusi,Kokku,Viimane tellimus'];
  for (const c of customers) {
    lines.push([
      esc(c.email), esc(c.name), c.orders,
      Number(c.total).toFixed(2),
      new Date(c.last_order).toISOString().slice(0, 10),
    ].join(','));
  }

  return new Response('﻿' + lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="kliendid.csv"',
    },
  });
};
