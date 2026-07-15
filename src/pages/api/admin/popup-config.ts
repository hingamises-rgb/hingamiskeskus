export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  const heading = String(b.heading || '').trim().slice(0, 100);
  const description = String(b.description || '').trim().slice(0, 300);
  const headingRu = String(b.heading_ru || '').trim().slice(0, 100);
  const descriptionRu = String(b.description_ru || '').trim().slice(0, 300);
  const headingEn = String(b.heading_en || '').trim().slice(0, 100);
  const descriptionEn = String(b.description_en || '').trim().slice(0, 300);
  const code = String(b.code || '').trim().slice(0, 40);
  const timer = Number(b.timer_minutes);

  if (!heading || !code) return json({ error: 'Pealkiri ja kood on kohustuslikud' }, 400);

  const sql = requireDb();
  try {
    await sql`
      UPDATE popup_config SET
        active = ${!!b.active},
        heading = ${heading},
        description = ${description},
        heading_ru = ${headingRu || null},
        description_ru = ${descriptionRu || null},
        heading_en = ${headingEn || null},
        description_en = ${descriptionEn || null},
        code = ${code},
        timer_minutes = ${Number.isFinite(timer) && timer >= 1 && timer <= 60 ? timer : 3}
      WHERE id = 1
    `;
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('popup-config error:', e);
    return json({ error: 'Serveri viga' }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
