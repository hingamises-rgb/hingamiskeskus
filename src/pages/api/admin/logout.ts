export const prerender = false;

import type { APIRoute } from 'astro';
import { clearSessionCookieHeader } from '../../../lib/auth';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookieHeader(),
    },
  });
};
