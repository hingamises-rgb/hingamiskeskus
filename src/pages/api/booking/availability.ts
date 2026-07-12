// Vabad ajad: ?type=float&date=YYYY-MM-DD | ?type=rent&date=...&room=slug | ?type=group
export const prerender = false;

import type { APIRoute } from 'astro';
import { floatAvailability, rentAvailability, upcomingSessions } from '../../../lib/booking';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get('type') || 'float';
  try {
    if (type === 'group') {
      const sessions = await upcomingSessions();
      return json({ sessions });
    }
    const date = url.searchParams.get('date') || '';
    if (!DATE_RE.test(date)) return json({ error: 'invalid_date' }, 400);
    if (type === 'rent') {
      const room = url.searchParams.get('room') || '';
      if (!['suur-saal', 'vaike-tuba'].includes(room)) return json({ error: 'invalid_room' }, 400);
      return json(await rentAvailability(date, room));
    }
    const a = await floatAvailability(date);
    // klient ei vaja ruumi id-d — ainult ajad; ruum selgub broneerimisel
    return json({ date: a.date, slots: a.slots.map((s) => s.time), taken: a.taken });
  } catch (e) {
    console.error('availability error', e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
