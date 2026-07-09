export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

// Kerge esimese osapoole külastusloendur: üks rida päeva+külastaja kohta,
// views kasvab iga lehevaatamisega.
export const POST: APIRoute = async ({ request }) => {
  if (!sql) return new Response('{}', { status: 200 });
  try {
    const b = await request.json();
    const vid = String(b.vid || '').slice(0, 64);
    if (!vid) return new Response('{}', { status: 200 });
    await sql`
      INSERT INTO traffic (day, vid)
      VALUES ((now() AT TIME ZONE 'Europe/Tallinn')::date, ${vid})
      ON CONFLICT (day, vid) DO UPDATE SET views = traffic.views + 1
    `;
  } catch { /* loendur ei tohi kunagi lehte segada */ }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
