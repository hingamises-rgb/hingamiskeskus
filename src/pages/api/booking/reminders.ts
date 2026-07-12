// Meeldetuletusmeilid: saadab homsetele aktiivsetele broneeringutele meeldetuletuse
// (~24h enne). Käivitab Vercel Cron kord päevas hommikul (vt vercel.json).
// Kaitse: Vercel saadab Authorization: Bearer CRON_SECRET; käsitsi saab ?key=CRON_SECRET.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';
import { nowTallinn, addDays, hhmm, dateStr, minToTime, timeToMin } from '../../../lib/booking';
import { sendReminder, humanDate } from '../../../lib/booking-emails';

const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET || '';

export const GET: APIRoute = async ({ request, url }) => {
  const auth = request.headers.get('authorization') || '';
  const key = url.searchParams.get('key') || '';
  if (!CRON_SECRET || (auth !== `Bearer ${CRON_SECRET}` && key !== CRON_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }

  const sql = requireDb();
  const tomorrow = addDays(nowTallinn().date, 1);
  const rows = await sql`
    SELECT b.*, c.email, c.name AS client_name, r.name AS room_name, s.name AS session_name
    FROM bk_bookings b
    JOIN bk_clients c ON c.id = b.client_id
    JOIN bk_rooms r ON r.id = b.room_id
    LEFT JOIN bk_sessions s ON s.id = b.session_id
    WHERE b.date = ${tomorrow} AND b.status = 'active' AND NOT b.reminder_sent
      AND b.type IN ('float','group')
    ORDER BY b.start_time
  `;

  let sent = 0, failed = 0;
  for (const b of rows) {
    try {
      const time = hhmm(b.start_time);
      await sendReminder({
        to: b.email, name: b.client_name || '', locale: b.locale || 'et',
        serviceName: b.session_name || (b.type === 'float' ? 'floating' : b.room_name),
        type: b.type, roomName: b.room_name,
        dateHuman: humanDate(dateStr(b.date), b.locale || 'et'),
        timeRange: `${time} - ${minToTime(timeToMin(time) + b.duration_min)}`,
        token: String(b.token).split('_')[0],
      });
      await sql`UPDATE bk_bookings SET reminder_sent = true WHERE id = ${b.id}`;
      sent++;
    } catch (e) {
      console.error('reminder failed for booking', b.id, e);
      failed++;
    }
  }
  return new Response(JSON.stringify({ ok: true, date: tomorrow, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
