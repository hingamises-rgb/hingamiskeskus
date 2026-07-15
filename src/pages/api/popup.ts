export const prerender = false;

import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { sql } from '../../lib/db';

const EMAIL_USER = import.meta.env.EMAIL_USER || 'info@hingamiskeskus.ee';
const EMAIL_PASS = import.meta.env.EMAIL_PASS || '';

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  connectionTimeout: 8000,
});

// GET: popupi seadistus (kas näidata, tekstid)
export const GET: APIRoute = async () => {
  if (!sql) return json({ active: false }, 200);
  try {
    const [cfg] = await sql`SELECT active, heading, description, heading_ru, description_ru, heading_en, description_en, timer_minutes FROM popup_config WHERE id = 1`;
    return json(cfg || { active: false }, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch {
    return json({ active: false }, 200);
  }
};

// POST: näitamise loendus või leadi salvestus + koodi saatmine
export const POST: APIRoute = async ({ request }) => {
  if (!sql) return json({ error: 'pole seadistatud' }, 500);
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  if (b.action === 'show') {
    try {
      await sql`
        INSERT INTO popup_days (day, shows) VALUES ((now() AT TIME ZONE 'Europe/Tallinn')::date, 1)
        ON CONFLICT (day) DO UPDATE SET shows = popup_days.shows + 1
      `;
    } catch {}
    return json({ ok: true }, 200);
  }

  if (b.action === 'lead') {
    if (b.veebileht) return json({ ok: true }, 200); // honeypot
    const ru = b.lang === 'ru';
    const en = b.lang === 'en';

    const email = String(b.email || '').trim().slice(0, 200);
    if (!email || !email.includes('@')) return json({ error: ru ? 'Введите корректный адрес почты' : en ? 'Enter a valid email address' : 'Sisesta korrektne e-post' }, 400);

    const source = String(b.source || 'Otse').slice(0, 60);
    const device = String(b.device || '').slice(0, 20);
    const referrer = String(b.referrer || '').slice(0, 500);

    try {
      const [cfg] = await sql`SELECT code, heading FROM popup_config WHERE id = 1`;
      const code = cfg?.code || 'TERE15';

      await sql`INSERT INTO leads (email, source, device, referrer) VALUES (${email}, ${source}, ${device}, ${referrer})`;
      await sql`
        INSERT INTO popup_days (day, conversions) VALUES ((now() AT TIME ZONE 'Europe/Tallinn')::date, 1)
        ON CONFLICT (day) DO UPDATE SET conversions = popup_days.conversions + 1
      `;

      await transporter.sendMail({
        from: `"Hingamiskeskus" <info@hingamiskeskus.ee>`,
        to: email,
        subject: ru ? 'Твой промокод — Центр дыхания Hingamiskeskus' : en ? 'Your discount code — Hingamiskeskus' : 'Sinu sooduskood — Hingamiskeskus',
        html: ru
          ? `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #1f6d85;">Спасибо за интерес!</h2>
            <p>Твой промокод:</p>
            <p style="font-size: 28px; font-weight: bold; letter-spacing: 2px; background: #f3fcff; padding: 16px 24px; border-radius: 10px; display: inline-block;">${code}</p>
            <p>Промокод действует на одно посещение. Введи его в поле промокода при бронировании.</p>
            <p><a href="https://www.hingamiskeskus.ee/ru/zabronirovat-vremya" style="color: #1f6d85;">Забронировать время здесь</a></p>
            <p style="color: #888; font-size: 13px;">Центр дыхания Hingamiskeskus · Sõle 14c, Таллинн · info@hingamiskeskus.ee</p>
          </div>
        `
          : en
          ? `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #1f6d85;">Thank you for your interest!</h2>
            <p>Your discount code is:</p>
            <p style="font-size: 28px; font-weight: bold; letter-spacing: 2px; background: #f3fcff; padding: 16px 24px; border-radius: 10px; display: inline-block;">${code}</p>
            <p>The discount code is valid for a single visit. Enter it in the discount code field when booking.</p>
            <p><a href="https://www.hingamiskeskus.ee/en/book-a-session" style="color: #1f6d85;">Book a session here</a></p>
            <p style="color: #888; font-size: 13px;">Hingamiskeskus · Sõle 14c, Tallinn · info@hingamiskeskus.ee</p>
          </div>
        `
          : `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #1f6d85;">Aitäh huvi eest!</h2>
            <p>Sinu sooduskood on:</p>
            <p style="font-size: 28px; font-weight: bold; letter-spacing: 2px; background: #f3fcff; padding: 16px 24px; border-radius: 10px; display: inline-block;">${code}</p>
            <p>Sooduskood kehtib ühekordse külastuse puhul. Sisesta see broneerimisel sooduskoodi väljale.</p>
            <p><a href="https://www.hingamiskeskus.ee/broneeri-aeg" style="color: #1f6d85;">Broneeri aeg siin</a></p>
            <p style="color: #888; font-size: 13px;">Hingamiskeskus · Sõle 14c, Tallinn · info@hingamiskeskus.ee</p>
          </div>
        `,
      });

      return json({ ok: true }, 200);
    } catch (e) {
      console.error('Popup lead viga:', e);
      return json({ error: 'Midagi läks valesti, proovi hiljem uuesti' }, 500);
    }
  }

  return json({ error: 'Tundmatu action' }, 400);
};

function json(data: object, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
