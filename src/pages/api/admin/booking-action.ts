// Broneerimise admin-tegevused. Kaitstud middleware'iga (/api/admin/*).
// Üks otspunkt, action-väli valib tegevuse — sama muster nagu update-order.ts jt.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requireDb } from '../../../lib/db';
import {
  adminCancelBooking, rentDecision, giftDecision, adminManualBooking, generateSessions, cancelSession,
  hhmm, dateStr, nowTallinn, minToTime, timeToMin,
} from '../../../lib/booking';
import { sendCancelled, sendRentDecision, sendConfirmation, humanDate } from '../../../lib/booking-emails';

export const POST: APIRoute = async ({ request }) => {
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'invalid' }, 400); }
  const sql = requireDb();

  try {
    switch (b.action) {

      // --- broneeringud ---
      case 'cancel_booking': {
        const res = await adminCancelBooking(Number(b.id));
        if (!res.ok) return json(res, 404);
        try {
          const bk = res.booking;
          await sendCancelled({
            to: bk.email, name: bk.client_name || '', locale: bk.locale || 'et',
            serviceName: bk.session_name || (bk.type === 'float' ? 'floating' : bk.room_name),
            type: bk.type, roomName: bk.room_name,
            dateHuman: humanDate(dateStr(bk.date), bk.locale || 'et'),
            timeRange: hhmm(bk.start_time), token: bk.token,
          });
        } catch (e) { console.error('cancel email failed', e); }
        return json({ ok: true });
      }

      case 'manual_booking': {
        const res = await adminManualBooking({
          type: b.type === 'group' ? 'group' : 'float',
          roomSlug: b.roomSlug, date: b.date, time: b.time,
          sessionId: b.sessionId ? Number(b.sessionId) : undefined,
          seats: b.seats ? Number(b.seats) : 1,
          name: String(b.name || '').slice(0, 120),
          email: String(b.email || '').trim().toLowerCase().slice(0, 200),
          phone: String(b.phone || '').slice(0, 40),
          note: String(b.note || '').slice(0, 300),
        });
        return json(res, res.ok ? 200 : 400);
      }

      // --- rent ---
      case 'rent_decision': {
        const approve = !!b.approve;
        const res = await rentDecision(String(b.token || ''), approve);
        if (!res.ok) return json(res, 404);
        try {
          const first = res.rows[0];
          const hours = res.rows.map((r: any) => hhmm(r.start_time)).sort().join(', ');
          await sendRentDecision(
            first.email, first.locale || 'et', first.room_name,
            humanDate(dateStr(first.date), first.locale || 'et'), hours, approve,
          );
        } catch (e) { console.error('rent decision email failed', e); }
        return json({ ok: true });
      }

      // --- kinkekaart ---
      case 'gift_decision': {
        const approve = !!b.approve;
        const res = await giftDecision(String(b.token || ''), approve);
        if (!res.ok) return json(res, 404);
        // kinnitamisel saada tavaline kinnitusmeil (loomisel jäi saatmata)
        if (approve) {
          for (const bk of res.rows) {
            try {
              const time = hhmm(bk.start_time);
              const end = minToTime(timeToMin(time) + (bk.type === 'group' ? 120 : 60));
              await sendConfirmation({
                to: bk.email, name: bk.client_name || '', locale: bk.locale || 'et',
                serviceName: bk.session_name || (bk.type === 'float' ? 'floating' : bk.room_name),
                type: bk.type, roomName: bk.room_name,
                dateHuman: humanDate(dateStr(bk.date), bk.locale || 'et'),
                timeRange: `${time} - ${end}`, token: bk.token,
              });
            } catch (e) { console.error('gift confirm email failed', e); }
          }
        }
        return json({ ok: true });
      }

      // --- grupiseansid ---
      case 'session_create': {
        const room = (await sql`SELECT id FROM bk_rooms WHERE slug = 'suur-saal'`)[0];
        await sql`
          INSERT INTO bk_sessions (room_id, date, start_time, duration_min, name, capacity, price_cents)
          VALUES (${room.id}, ${b.date}, ${b.time}, ${Number(b.durationMin) || 120},
            ${String(b.name || 'Vabastav hingamine grupis').slice(0, 200)},
            ${Number(b.capacity) || 10}, ${Math.round(Number(b.priceEur || 40) * 100)})
          ON CONFLICT (room_id, date, start_time) DO NOTHING
        `;
        return json({ ok: true });
      }

      case 'session_generate': {
        const res = await generateSessions({
          dows: (Array.isArray(b.dows) ? b.dows : []).map(Number).filter((d: number) => d >= 0 && d <= 6),
          time: String(b.time || '18:00'),
          weeks: Math.min(16, Number(b.weeks) || 8),
          name: String(b.name || 'Vabastav hingamine grupis').slice(0, 200),
          capacity: Number(b.capacity) || 10,
          priceCents: Math.round(Number(b.priceEur || 40) * 100),
          durationMin: Number(b.durationMin) || 120,
        });
        return json(res);
      }

      case 'session_update': {
        await sql`
          UPDATE bk_sessions SET
            name = ${String(b.name).slice(0, 200)},
            capacity = GREATEST(booked, ${Number(b.capacity) || 10}),
            price_cents = ${Math.round(Number(b.priceEur || 40) * 100)}
          WHERE id = ${Number(b.id)}
        `;
        return json({ ok: true });
      }

      case 'session_cancel': {
        const res = await cancelSession(Number(b.id));
        if (!res.ok) return json(res, 404);
        // teavita osalejaid
        for (const bk of res.cancelledBookings) {
          try {
            await sendCancelled({
              to: bk.email, name: bk.client_name || '', locale: bk.locale || 'et',
              serviceName: bk.session_name || bk.room_name, type: 'group', roomName: bk.room_name,
              dateHuman: humanDate(dateStr(bk.date), bk.locale || 'et'),
              timeRange: hhmm(bk.start_time), token: bk.token,
            });
          } catch (e) { console.error('session cancel email failed', e); }
        }
        return json({ ok: true, notified: res.cancelledBookings.length });
      }

      // --- kliendid ---
      case 'client_update': {
        await sql`
          UPDATE bk_clients SET
            notes = ${String(b.notes ?? '').slice(0, 5000)},
            blocked = ${!!b.blocked}
          WHERE id = ${Number(b.id)}
        `;
        return json({ ok: true });
      }

      case 'package_add': {
        const client = (await sql`SELECT id FROM bk_clients WHERE id = ${Number(b.clientId)}`)[0];
        if (!client) return json({ error: 'not_found' }, 404);
        await sql`
          INSERT INTO bk_packages (client_id, name, total_sessions, valid_until, source)
          VALUES (${client.id}, ${String(b.name).slice(0, 200)}, ${Number(b.sessions) || 1},
            ${String(b.validUntil)}, 'admin')
        `;
        return json({ ok: true });
      }

      case 'package_use': {
        // Käsitsi korra kasutamine (+1) või tagastamine (−1): telefonibroneering,
        // "pane äsja käidud kord paketile" jne. Piirid 0..total.
        const delta = Number(b.delta) === -1 ? -1 : 1;
        await sql`
          UPDATE bk_packages
          SET used_sessions = LEAST(total_sessions, GREATEST(0, used_sessions + ${delta}))
          WHERE id = ${Number(b.id)}
        `;
        return json({ ok: true });
      }

      case 'package_delete': {
        await sql`DELETE FROM bk_package_uses WHERE package_id = ${Number(b.id)}`;
        await sql`DELETE FROM bk_packages WHERE id = ${Number(b.id)}`;
        return json({ ok: true });
      }

      case 'credit_adjust': {
        await sql`
          INSERT INTO bk_credits (client_id, amount_cents, note)
          VALUES (${Number(b.clientId)}, ${Math.round(Number(b.amountEur) * 100)},
            ${String(b.note || 'Admini korrigeerimine').slice(0, 300)})
        `;
        return json({ ok: true });
      }

      case 'client_create': {
        const email = String(b.email || '').trim().toLowerCase();
        if (!email.includes('@')) return json({ error: 'invalid' }, 400);
        const rows = await sql`
          INSERT INTO bk_clients (email, name, phone)
          VALUES (${email}, ${String(b.name || '').slice(0, 120)}, ${String(b.phone || '').slice(0, 40)})
          ON CONFLICT (email) DO UPDATE SET email = bk_clients.email
          RETURNING id
        `;
        return json({ ok: true, id: rows[0].id });
      }

      // --- seaded / ruumid / sooduskoodid / blokid ---
      case 'room_active': {
        await sql`UPDATE bk_rooms SET active = ${!!b.active} WHERE id = ${Number(b.id)}`;
        return json({ ok: true });
      }

      case 'setting_set': {
        const allowed = ['price_float_cents', 'price_member_cents', 'price_group_cents',
          'rent_suur_cents_h', 'rent_vaike_cents_h', 'cutoff_min', 'horizon_days'];
        if (!allowed.includes(b.key)) return json({ error: 'invalid' }, 400);
        await sql`
          INSERT INTO bk_settings (key, value) VALUES (${b.key}, ${String(Number(b.value))})
          ON CONFLICT (key) DO UPDATE SET value = ${String(Number(b.value))}
        `;
        return json({ ok: true });
      }

      case 'promo_add': {
        await sql`
          INSERT INTO bk_promos (code, pct, amount_cents, valid_until, max_uses)
          VALUES (${String(b.code).trim().toUpperCase().slice(0, 40)},
            ${b.pct ? Number(b.pct) : null},
            ${b.amountEur ? Math.round(Number(b.amountEur) * 100) : null},
            ${b.validUntil || null}, ${b.maxUses ? Number(b.maxUses) : null})
          ON CONFLICT (code) DO NOTHING
        `;
        return json({ ok: true });
      }

      case 'promo_toggle': {
        await sql`UPDATE bk_promos SET active = NOT active WHERE id = ${Number(b.id)}`;
        return json({ ok: true });
      }

      case 'block_add': {
        await sql`
          INSERT INTO bk_blocks (room_id, date, start_time, duration_min, reason)
          VALUES (${b.roomId ? Number(b.roomId) : null}, ${b.date},
            ${b.time || null}, ${b.time ? (Number(b.durationMin) || 60) : null},
            ${String(b.reason || '').slice(0, 300)})
        `;
        return json({ ok: true });
      }

      case 'block_delete': {
        await sql`DELETE FROM bk_blocks WHERE id = ${Number(b.id)}`;
        return json({ ok: true });
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('booking-action error', b?.action, e);
    return json({ error: 'server' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
