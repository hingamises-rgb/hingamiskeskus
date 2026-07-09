export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const GET: APIRoute = async () => {
  const sql = requireDb();
  const leads = await sql`SELECT email, source, device, referrer, created_at FROM leads ORDER BY created_at DESC`;

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['Email,Allikas,Seade,Referrer,Aeg'];
  for (const l of leads) {
    lines.push([
      esc(l.email), esc(l.source), esc(l.device), esc(l.referrer),
      new Date(l.created_at).toISOString().replace('T', ' ').slice(0, 16),
    ].join(','));
  }

  return new Response('﻿' + lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leadid.csv"',
    },
  });
};
