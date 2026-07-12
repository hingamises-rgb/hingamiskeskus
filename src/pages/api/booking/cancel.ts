// Broneeringu tühistamine meililingi tokeniga (kuni 1h enne algust).
export const prerender = false;

import type { APIRoute } from 'astro';
import { cancelByToken, getBookingByToken, hhmm, dateStr } from '../../../lib/booking';
import { sendCancelled, humanDate } from '../../../lib/booking-emails';

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
  const token = String(b.token || '').trim();
  if (!token || token.length < 20) return json({ error: 'invalid' }, 400);

  try {
    const rows = await getBookingByToken(token);
    const result = await cancelByToken(token);
    if (!result.ok) return json(result, result.error === 'not_found' ? 404 : 400);

    // kinnitusmeil tühistamise kohta
    try {
      const first = rows[0];
      if (first) {
        await sendCancelled({
          to: first.email, name: first.client_name || '', locale: first.locale || 'et',
          serviceName: first.session_name || (first.type === 'float' ? 'floating' : first.room_name),
          type: first.type, roomName: first.room_name,
          dateHuman: humanDate(dateStr(first.date), first.locale || 'et'),
          timeRange: hhmm(first.start_time),
          token,
        });
      }
    } catch (e) {
      console.error('cancel email failed', e);
    }

    return json(result);
  } catch (e) {
    console.error('cancel error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
