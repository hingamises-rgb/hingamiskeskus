// Broneeringu loomine (float / group / rent). Saadab kinnitus- või rendisoovi meili.
export const prerender = false;

import type { APIRoute } from 'astro';
import { createBooking, verifyDeviceToken, hhmm, minToTime, timeToMin } from '../../../lib/booking';
import { sendConfirmation, sendRentReceived, humanDate } from '../../../lib/booking-emails';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const POST: APIRoute = async ({ request, cookies }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }

  // honeypot robotite vastu (sama muster kui kontaktivormil)
  if (b.veebileht) return json({ ok: true });

  const type = String(b.type || '');
  if (!['float', 'group', 'rent'].includes(type)) return json({ error: 'invalid' }, 400);

  const name = String(b.name || '').trim().slice(0, 120);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const phone = String(b.phone || '').trim().slice(0, 40);
  const locale = ['et', 'ru', 'en'].includes(b.locale) ? b.locale : 'et';
  if (!name || !email.includes('@') || phone.replace(/\D/g, '').length < 7) {
    return json({ error: 'invalid_contact' }, 400);
  }

  const payment = ['paysera', 'cash', 'package', 'credit'].includes(b.payment) ? b.payment : 'cash';
  const emailVerified = verifyDeviceToken(cookies.get('hk_bk_dev')?.value, email);

  // sisendi valideerimine tüübi kaupa
  let slots, sessionId, seats, rentRoom, rentDate, rentHours;
  if (type === 'float') {
    slots = Array.isArray(b.slots) ? b.slots.slice(0, 6).map((s: any) => ({
      date: String(s.date || ''), time: String(s.time || ''),
    })) : [];
    if (!slots.length || slots.some((s: any) => !DATE_RE.test(s.date) || !TIME_RE.test(s.time))) {
      return json({ error: 'invalid' }, 400);
    }
  } else if (type === 'group') {
    sessionId = Number(b.sessionId);
    seats = Number(b.seats) || 1;
    if (!Number.isInteger(sessionId) || sessionId < 1) return json({ error: 'invalid' }, 400);
  } else {
    rentRoom = String(b.rentRoom || '');
    rentDate = String(b.rentDate || '');
    rentHours = Array.isArray(b.rentHours) ? b.rentHours.map(String).filter((t: string) => TIME_RE.test(t)).slice(0, 12) : [];
    if (!['suur-saal', 'vaike-tuba'].includes(rentRoom) || !DATE_RE.test(rentDate) || !rentHours.length) {
      return json({ error: 'invalid' }, 400);
    }
  }

  try {
    const result = await createBooking({
      type: type as any, slots, sessionId, seats, rentRoom, rentDate, rentHours,
      purpose: String(b.purpose || '').slice(0, 1000),
      name, email, phone, locale,
      payment, packageId: b.packageId ? Number(b.packageId) : undefined,
      promoCode: b.promoCode ? String(b.promoCode).slice(0, 40) : undefined,
      emailVerified,
    });

    if (!result.ok) {
      const status = result.error === 'conflict' || result.error === 'full' ? 409
        : result.error === 'blocked' ? 403
        : result.error === 'verification_required' ? 401 : 400;
      return json(result, status);
    }

    // Meilid (ebaõnnestumine ei nurja broneeringut — logime)
    try {
      if (type === 'rent') {
        const hours = rentHours!.sort().join(', ');
        const roomName = rentRoom === 'suur-saal' ? 'Suur saal' : 'Väike tuba';
        await sendRentReceived(email, locale, roomName, humanDate(rentDate!, locale), hours);
      } else {
        for (const bk of result.bookings) {
          const end = minToTime(timeToMin(bk.time) + (type === 'group' ? 120 : 60));
          await sendConfirmation({
            to: email, name, locale,
            serviceName: type === 'float'
              ? (locale === 'ru' ? 'флоатинг' : 'floating')
              : bk.roomName, // grupil kannab bookings[].roomName seansi nime
            type: type as any,
            roomName: bk.roomName,
            dateHuman: humanDate(bk.date, locale),
            timeRange: `${hhmm(bk.time)} - ${end}`,
            token: bk.token,
          });
        }
      }
    } catch (e) {
      console.error('confirmation email failed', e);
    }

    return json(result);
  } catch (e) {
    console.error('create booking error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
