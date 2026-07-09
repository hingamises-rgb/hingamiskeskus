export const prerender = false;

import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';

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

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const POST: APIRoute = async ({ request }) => {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: 'Vigane päring' }, 400);
  }

  // Honeypot: robotid täidavad peidetud välja
  if (b.veebileht) return json({ ok: true }, 200);

  const nimi = String(b.nimi || '').trim().slice(0, 100);
  const perekonnanimi = String(b.perekonnanimi || '').trim().slice(0, 100);
  const telefon = String(b.telefon || '').trim().slice(0, 40);
  const email = String(b.email || '').trim().slice(0, 200);
  const sonum = String(b.sonum || '').trim().slice(0, 5000);
  const source = String(b.source || 'Veebileht').trim().slice(0, 100);

  if (!email || !email.includes('@') || !sonum) {
    return json({ error: 'E-post ja sõnum on kohustuslikud' }, 400);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Uus päring veebilehelt</h2>
      <p><strong>Leht:</strong> ${esc(source)}</p>
      <p><strong>Nimi:</strong> ${esc(nimi)} ${esc(perekonnanimi)}</p>
      <p><strong>E-post:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a></p>
      ${telefon ? `<p><strong>Telefon:</strong> ${esc(telefon)}</p>` : ''}
      <hr style="border:none; border-top:1px solid #eee;" />
      <p style="white-space: pre-wrap;">${esc(sonum)}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Hingamiskeskus veebileht" <info@hingamiskeskus.ee>`,
      to: NOTIFY_EMAIL,
      replyTo: email,
      subject: `Uus päring: ${source}${nimi ? ` — ${nimi}` : ''}`,
      html,
    });
    return json({ ok: true }, 200);
  } catch (e: any) {
    console.error('Kontaktivormi meil ebaõnnestus:', e);
    // Ajutine diagnostika (eemaldada peale seadistuse kontrolli):
    const diag = `${e?.code || ''} ${e?.responseCode || ''} smailyUser=${SMAILY_USER ? 'olemas' : 'PUUDU'}`.trim();
    return json({ error: 'Saatmine ebaõnnestus, proovi hiljem uuesti', diag }, 500);
  }
};

function json(data: object, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
