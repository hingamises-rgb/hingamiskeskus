export const prerender = false;

import type { APIRoute } from 'astro';

// Käivitab Verceli deploy hooki, et staatiline e-pood uute tooteandmetega uuesti ehitada.
// Vajab VERCEL_DEPLOY_HOOK_URL env muutujat (Vercel → Settings → Git → Deploy Hooks).
export const POST: APIRoute = async () => {
  const hookUrl = import.meta.env.VERCEL_DEPLOY_HOOK_URL || process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    return new Response(JSON.stringify({ error: 'Deploy hook on seadistamata' }), { status: 501 });
  }
  const res = await fetch(hookUrl, { method: 'POST' });
  return new Response(JSON.stringify({ ok: res.ok }), { status: res.ok ? 200 : 502 });
};
