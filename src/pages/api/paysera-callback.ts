export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';
import { sql } from '../../lib/db';
import { grantShopPackages } from '../../lib/booking';

const SIGN_PASSWORD = import.meta.env.PAYSERA_SIGN_PASSWORD;
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

function shippingLabel(val: string) {
  if (val === 'pickup') return 'Tule ise järgi (Sõle 14C, Tallinn)';
  if (val === 'dpd') return 'DPD pakiautomaat';
  if (val === 'omniva') return 'Omniva pakiautomaat';
  return val;
}

// Make.com parser (kinkekaardi automaatika) loeb kirjast telefoni regexiga \+\d…
function normPhone(p: string) {
  const t = (p || '').replace(/[\s-]+/g, '');
  if (!t || t.startsWith('+')) return t;
  if (/^372\d{7,8}$/.test(t)) return '+' + t;
  if (/^\d{7,8}$/.test(t)) return '+372' + t;
  return t;
}

// "Kinkekaart 40€ x2, Epsomi sool 250g x1" -> [{cartName, qty}]
// NB: tootenimi võib ISE sisaldada koma (nt venekeelsed täisnimed) — iga kirje
// lõpeb " xN"-iga, seega liidame koma-tükke kokku, kuni jõuame xN lõpuni.
function parseItems(items: string) {
  const out: { cartName: string; qty: number }[] = [];
  let buf = '';
  for (const seg of items.split(',')) {
    buf = buf ? buf + ',' + seg : seg;
    const m = buf.trim().match(/^(.*?)\s*x(\d+)$/i);
    if (m) {
      out.push({ cartName: m[1].trim(), qty: Math.max(1, parseInt(m[2], 10)) });
      buf = '';
    }
  }
  if (buf.trim()) out.push({ cartName: buf.trim(), qty: 1 });
  return out;
}

type EmailLine = { title: string; qty: number; unit: number };

// Tellimuse teavituskiri VANA Hostingeri kirja formaadis — Make.com kinkekaardi
// automaatika on treenitud täpselt selle struktuuri peale (teema "You have received
// a new order", "Order #<nr> summary", täispikk tootenimi + "1 × €40.00" rida,
// Customer information plokk). Formaadi muutmine lõhub Make'i parseri!
function orderHtml(opts: {
  orderNo: string; name: string; lines: EmailLine[];
  shippingPrice: number; shippingText: string; parcelText: string;
  email: string; phone: string; address: string; note?: string;
}) {
  const subtotal = opts.lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const total = subtotal + opts.shippingPrice;
  const itemsHtml = opts.lines.map((l) =>
    `<p>${l.title}<br/>${l.qty} × €${l.unit.toFixed(2)}</p>`).join('\n');
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="font-size: 24px;">New Order #${opts.orderNo}</h1>
        <p style="color: #666;">${new Date().toLocaleDateString('et-EE')} | ${new Date().toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}</p>
        <p>Hingamises OÜ received a new order from ${opts.name}.</p>
        ${opts.note ? `<p style="color: #666;">${opts.note}</p>` : ''}

        <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 24px; margin: 20px 0;">
          <h2 style="font-size: 18px; margin-top: 0;">Order #${opts.orderNo} summary</h2>
          <hr style="border: none; border-top: 1px solid #eee;" />
          ${itemsHtml}
          <hr style="border: none; border-top: 1px solid #eee;" />
          <table style="width: 100%; font-size: 14px;">
            <tr><td>Subtotal</td><td style="text-align: right;">€${subtotal.toFixed(2)}</td></tr>
            <tr><td>Shipping</td><td style="text-align: right;">€${opts.shippingPrice.toFixed(2)}</td></tr>
            <tr><td><strong>Total</strong></td><td style="text-align: right;"><strong>€${total.toFixed(2)}</strong></td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 14px;">Payment method: <strong>Paysera</strong></p>
        </div>

        <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 24px; margin: 20px 0;">
          <h2 style="font-size: 18px; margin-top: 0;">Customer information</h2>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p>${opts.name}<br/>
          <a href="mailto:${opts.email}">${opts.email}</a><br/>
          ${opts.phone}</p>
          <p><strong>Saatmine:</strong> ${opts.shippingText}${opts.parcelText}</p>
          ${opts.address ? `<p><strong>Aadress:</strong> ${opts.address}</p>` : ''}
        </div>
      </div>
    `;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const data = url.searchParams.get('data') || '';
  const ss1 = url.searchParams.get('ss1') || '';

  const expectedSign = createHash('md5').update(data + SIGN_PASSWORD).digest('hex');

  if (ss1 !== expectedSign) {
    return new Response('INVALID SIGN', { status: 400 });
  }

  const decoded = Buffer.from(data, 'base64').toString('utf-8');
  const params = new URLSearchParams(decoded);

  const status = params.get('status');
  const orderid = params.get('orderid') || '';
  const amount = parseInt(params.get('amount') || '0', 10) / 100;
  const email = params.get('p_email') || '';
  const name = params.get('p_firstname') || '';
  const phone = params.get('p_phone') || '';
  const address = params.get('p_address') || '';
  const shipping = params.get('p_shipping') || '';
  const parcel = params.get('p_parcel') || '';
  const items = params.get('p_items') || '';

  if (status === '1') {
    // Salvesta tellimus andmebaasi (idempotentne — sama orderid ei duplitseeru)
    if (sql) {
      try {
        await sql`
          INSERT INTO orders (orderid, amount, name, email, phone, address, shipping, parcel, items)
          VALUES (${orderid}, ${amount}, ${name}, ${email}, ${phone}, ${address}, ${shipping}, ${parcel}, ${items})
          ON CONFLICT (orderid) DO NOTHING
        `;
      } catch (err) {
        console.error('Tellimuse salvestamine ebaõnnestus:', err);
      }

      // Paketiost → broneeritavad korrad automaatselt (idempotentne orderid järgi)
      try {
        const g = await grantShopPackages(email, name, items, orderid);
        if (g.granted) console.log(`Tellimus ${orderid}: loodud ${g.granted} paketti broneerimissüsteemi`);
      } catch (err) {
        console.error('Paketi loomine ebaõnnestus:', err);
      }
    }

    const shippingText = shippingLabel(shipping);
    const parcelText = parcel ? `<br/>Pakiautomaat: ${parcel}` : '';
    const shippingPrice = shipping === 'dpd' ? 3.10 : shipping === 'omniva' ? 3.46 : 0;

    // Täispikad tootenimed + hinnad DB-st (Make'i parser vajab pealkirja
    // "Hingamiskeskuse kinkekaart 40 € ..." — ostukorvi lühinimest ei piisa)
    const orderNo = orderid.replace(/\D/g, '') || orderid;
    const phoneIntl = normPhone(phone);
    // Ostukorvis võib olla ET lühinimi (cart_name) VÕI RU/EN täisnimi (title_ru/title_en,
    // vene/inglise pood paneb korvi tõlgitud nime) — kõik viivad sama tooteni.
    // Kirjas kasutame ALATI eestikeelset täisnime (title), Make on selle peale treenitud.
    const norm = (s: string) => s.trim().toLowerCase();
    let prodByCart = new Map<string, any>();
    if (sql) {
      try {
        const rows = await sql`SELECT cart_name, title, title_ru, title_en, price, category FROM products`;
        for (const r of rows as any[]) {
          for (const key of [r.cart_name, r.title, r.title_ru, r.title_en]) {
            if (key) prodByCart.set(norm(key), r);
          }
        }
      } catch (err) {
        console.error('Toodete lugemine ebaõnnestus:', err);
      }
    }
    const parsed = parseItems(items).map((it) => {
      const p = prodByCart.get(norm(it.cartName));
      return {
        title: p?.title || it.cartName,
        qty: it.qty,
        unit: p ? Number(p.price) : 0,
        isGift: p?.category === 'kinkekaardid',
      };
    });
    // Kui hinda DB-st ei leitud (nt toode vahepeal kustutatud), jaga summa järgi
    const knownSum = parsed.reduce((s, l) => s + (l.unit ? l.qty * l.unit : 0), 0);
    const unknown = parsed.filter((l) => !l.unit);
    if (unknown.length) {
      const rest = Math.max(0, amount - shippingPrice - knownSum);
      const perUnit = rest / unknown.reduce((s, l) => s + l.qty, 0);
      unknown.forEach((l) => { l.unit = perUnit; });
    }

    const giftCards = parsed.filter((l) => l.isGift);
    const otherItems = parsed.filter((l) => !l.isGift);
    const giftUnits = giftCards.reduce((s, l) => s + l.qty, 0);

    const baseOpts = {
      orderNo, name, shippingText, parcelText, email, phone: phoneIntl, address,
    };
    const send = (subject: string, html: string) =>
      transporter.sendMail({ from: `"Hingamiskeskus" <info@hingamiskeskus.ee>`, to: NOTIFY_EMAIL, subject, html });

    try {
      // Iga kinkekaart ERALDI kirjaga — Make genereerib ühe kaardi kirja kohta.
      // (Vana süsteem saatis mitu kaarti ühes kirjas ja Make tegi ainult ühe kaardi.)
      let unitNo = 0;
      for (const card of giftCards) {
        for (let i = 0; i < card.qty; i++) {
          unitNo++;
          // Saatmiskulu (kui füüsilised kaardid postiga) viimase kaardi kirjale,
          // et kirjade summad annaksid kokku tellimuse kogusumma
          const lastCardEmail = unitNo === giftUnits && otherItems.length === 0;
          await send('You have received a new order', orderHtml({
            ...baseOpts,
            lines: [{ title: card.title, qty: 1, unit: card.unit }],
            shippingPrice: lastCardEmail ? shippingPrice : 0,
            note: giftUnits > 1 ? `Kaart ${unitNo}/${giftUnits} — tellimus #${orderNo}` : undefined,
          }));
        }
      }
      // Ülejäänud tooted (või kaartideta tellimus) — üks koondkiri.
      // Selles kirjas kinkekaarte pole, seega Make seda ei töötle.
      if (otherItems.length || giftCards.length === 0) {
        await send('You have received a new order', orderHtml({
          ...baseOpts,
          lines: otherItems.length ? otherItems : parsed,
          shippingPrice,
        }));
      }
    } catch (err) {
      console.error('Email sending failed:', err);
    }
  }

  return new Response('OK');
};
