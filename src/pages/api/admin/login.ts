export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';
import { verifyPassword, createSession, sessionCookieHeader } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  let username = '', password = '';
  try {
    const body = await request.json();
    username = String(body.username || '').trim().toLowerCase();
    password = String(body.password || '');
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  if (!username || !password) {
    return json({ error: 'Kasutajanimi ja parool on kohustuslikud' }, 400);
  }

  try {
    const sql = requireDb();
    const rows = await sql`SELECT username, password_hash FROM admin_users WHERE username = ${username}`;
    if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
      return json({ error: 'Vale kasutajanimi või parool' }, 401);
    }

    const token = createSession(rows[0].username);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookieHeader(token),
      },
    });
  } catch (e) {
    console.error('Login error:', e);
    return json({ error: 'Serveri viga' }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
