// Broneerimissüsteemi tuumloogika: vabad ajad, broneeringu loomine/tühistamine,
// paketid, ettemaks, e-posti kinnituskoodid.
//
// Ajad: kuupäev ja kellaaeg hoitakse DATE + TIME väljadena Tallinna ajas (mitte timestamptz)
// — vt runbooki lõks Date.toISOString nihke kohta. "Praegu" arvutatakse alati Tallinna TZ-s.

import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { requireDb } from './db';

const SECRET = import.meta.env.SESSION_SECRET || process.env.SESSION_SECRET || '';

// ---------- Aeg (Tallinn) ----------

const TZ = 'Europe/Tallinn';

/** Tallinna praegune hetk kujul { date: 'YYYY-MM-DD', time: 'HH:MM', minutes: päeva minutid } */
export function nowTallinn() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  // sv-SE annab "YYYY-MM-DD HH:MM"
  const [date, time] = parts.split(' ');
  const [h, m] = time.split(':').map(Number);
  return { date, time, minutes: h * 60 + m };
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z'); // keskpäev, et TZ-nihe päeva ei muudaks
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dowOf(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00Z').getUTCDay();
}

/** PG TIME tuleb draiverist kujul 'HH:MM:SS' — normaliseeri 'HH:MM' */
export function hhmm(t: string): string {
  return String(t).slice(0, 5);
}

/** PG DATE võib draiverist tulla Date-objektina — normaliseeri 'YYYY-MM-DD' (Tallinna TZ). */
export function dateStr(d: unknown): string {
  if (d instanceof Date) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
  }
  return String(d).slice(0, 10);
}

// ---------- Seaded ----------

export async function getSettings(): Promise<Record<string, string>> {
  const sql = requireDb();
  const rows = await sql`SELECT key, value FROM bk_settings`;
  return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
}

// ---------- Vabad ajad ----------

export type Slot = { time: string; roomId: number; roomSlug: string; roomName: string };

/**
 * Kas broneering/tühistamine on veel lubatud: hetk peab olema vähemalt cutoffMin
 * enne algust (sama päeva varasemad ja möödunud kuupäevad välistatakse).
 */
export function withinCutoff(date: string, time: string, cutoffMin: number): boolean {
  const now = nowTallinn();
  if (date < now.date) return false;
  if (date > now.date) return true;
  return timeToMin(time) - now.minutes >= cutoffMin;
}

/** Floatingu vabad ajad ühel kuupäeval (ainult aktiivsed ruumid, miinus broneeringud/blokid/cutoff). */
export async function floatAvailability(date: string) {
  const sql = requireDb();
  const s = await getSettings();
  const cutoff = Number(s.cutoff_min || 60);
  const horizon = Number(s.horizon_days || 92);
  const now = nowTallinn();
  if (date < now.date || date > addDays(now.date, horizon)) return { date, slots: [] as Slot[], taken: [] as string[] };

  const dow = dowOf(date);
  const templates = await sql`
    SELECT t.start_time, t.duration_min, r.id AS room_id, r.slug, r.name
    FROM bk_templates t JOIN bk_rooms r ON r.id = t.room_id
    WHERE t.dow = ${dow} AND r.active AND r.type = 'floating'
    ORDER BY t.start_time
  `;
  const bookings = await sql`
    SELECT room_id, start_time, duration_min FROM bk_bookings
    WHERE date = ${date} AND status IN ('active','pending')
  `;
  const blocks = await sql`
    SELECT room_id, start_time, duration_min FROM bk_blocks WHERE date = ${date}
  `;

  const slots: Slot[] = [];
  const taken: string[] = [];
  for (const t of templates) {
    const time = hhmm(t.start_time);
    const startMin = timeToMin(time);
    const endMin = startMin + t.duration_min;
    const overlaps = (rows: any[]) => rows.some((b: any) => {
      if (b.room_id !== null && b.room_id !== t.room_id) return false;
      if (b.start_time === null) return true; // terve päeva blokk
      const bs = timeToMin(hhmm(b.start_time));
      const be = bs + (b.duration_min || 24 * 60);
      return bs < endMin && startMin < be;
    });
    if (overlaps(bookings as any[]) || overlaps(blocks as any[])) { taken.push(time); continue; }
    if (!withinCutoff(date, time, cutoff)) { taken.push(time); continue; }
    slots.push({ time, roomId: t.room_id, roomSlug: t.slug, roomName: t.name });
  }
  return { date, slots, taken };
}

/** Grupiseansid horisondi piires koos vabade kohtadega. */
export async function upcomingSessions() {
  const sql = requireDb();
  const s = await getSettings();
  const now = nowTallinn();
  const to = addDays(now.date, Number(s.horizon_days || 92));
  const rows = await sql`
    SELECT s.id, s.date, s.start_time, s.duration_min, s.name, s.capacity, s.booked,
           s.price_cents, r.name AS room_name
    FROM bk_sessions s JOIN bk_rooms r ON r.id = s.room_id
    WHERE s.status = 'active' AND s.date >= ${now.date} AND s.date <= ${to}
    ORDER BY s.date, s.start_time
  `;
  const cutoff = Number(s.cutoff_min || 60);
  return rows
    .map((r: any) => ({
      id: r.id,
      date: dateStr(r.date),
      time: hhmm(r.start_time),
      durationMin: r.duration_min,
      name: r.name,
      roomName: r.room_name,
      free: Math.max(0, r.capacity - r.booked),
      priceCents: r.price_cents,
    }))
    .filter((r: any) => withinCutoff(r.date, r.time, cutoff));
}

/** Rendiruumi vabad täistunnid ühel kuupäeval. */
export async function rentAvailability(date: string, roomSlug: string) {
  const sql = requireDb();
  const s = await getSettings();
  const cutoff = Number(s.cutoff_min || 60);
  const horizon = Number(s.horizon_days || 92);
  const now = nowTallinn();
  if (date < now.date || date > addDays(now.date, horizon)) return { date, hours: [] as string[] };

  const room = (await sql`SELECT id FROM bk_rooms WHERE slug = ${roomSlug} AND active`)[0];
  if (!room) return { date, hours: [] as string[] };

  const dow = dowOf(date);
  const weekend = dow === 0 || dow === 6;
  const first = weekend ? 11 : 9, last = weekend ? 17 : 19; // viimane algustund

  const busy = await sql`
    SELECT start_time, duration_min FROM bk_bookings
    WHERE date = ${date} AND room_id = ${room.id} AND status IN ('active','pending')
    UNION ALL
    SELECT start_time, duration_min FROM bk_sessions
    WHERE date = ${date} AND room_id = ${room.id} AND status = 'active'
    UNION ALL
    SELECT start_time, duration_min FROM bk_blocks
    WHERE date = ${date} AND (room_id = ${room.id} OR room_id IS NULL)
  `;

  const hours: string[] = [];
  for (let h = first; h <= last; h++) {
    const time = minToTime(h * 60);
    const sMin = h * 60, eMin = sMin + 60;
    const clash = (busy as any[]).some((b: any) => {
      if (b.start_time === null) return true;
      const bs = timeToMin(hhmm(b.start_time));
      const be = bs + (b.duration_min || 24 * 60);
      return bs < eMin && sMin < be;
    });
    if (!clash && withinCutoff(date, time, cutoff)) hours.push(time);
  }
  return { date, hours, roomId: room.id };
}

// ---------- Kliendid ----------

export async function upsertClient(email: string, name: string, phone: string, locale: string) {
  const sql = requireDb();
  const em = email.trim().toLowerCase();
  const rows = await sql`
    INSERT INTO bk_clients (email, name, phone, locale)
    VALUES (${em}, ${name}, ${phone}, ${locale})
    ON CONFLICT (email) DO UPDATE SET name = ${name}, phone = ${phone}, locale = ${locale}
    RETURNING id, email, blocked, member_until, notes
  `;
  return rows[0];
}

/** Kliendi kokkuvõte broneerimisvoo jaoks — AINULT tõeväärtused, detailid alles pärast koodi. */
export async function clientFlags(email: string) {
  const sql = requireDb();
  const em = email.trim().toLowerCase();
  const now = nowTallinn();
  const rows = await sql`
    SELECT c.id, c.blocked,
      (c.member_until IS NOT NULL AND c.member_until >= ${now.date}::date) AS member,
      EXISTS (
        SELECT 1 FROM bk_packages p WHERE p.client_id = c.id
          AND p.used_sessions < p.total_sessions AND p.valid_until >= ${now.date}::date
      ) AS has_packages,
      COALESCE((SELECT SUM(amount_cents) FROM bk_credits cr WHERE cr.client_id = c.id), 0) > 0 AS has_credit
    FROM bk_clients c WHERE c.email = ${em}
  `;
  if (!rows[0]) return { exists: false, blocked: false, member: false, hasPackages: false, hasCredit: false };
  const r = rows[0];
  return { exists: true, blocked: r.blocked, member: r.member, hasPackages: r.has_packages, hasCredit: r.has_credit };
}

/** Kliendi paketid ja ettemaks (kuvatakse alles pärast e-posti kinnitamist). */
export async function clientAssets(email: string) {
  const sql = requireDb();
  const em = email.trim().toLowerCase();
  const now = nowTallinn();
  const client = (await sql`SELECT id FROM bk_clients WHERE email = ${em}`)[0];
  if (!client) return { packages: [], creditCents: 0 };
  const packages = await sql`
    SELECT id, name, total_sessions, used_sessions, valid_until FROM bk_packages
    WHERE client_id = ${client.id} AND used_sessions < total_sessions
      AND valid_until >= ${now.date}::date
    ORDER BY valid_until
  `;
  const credit = await sql`
    SELECT COALESCE(SUM(amount_cents), 0) AS c FROM bk_credits WHERE client_id = ${client.id}
  `;
  return {
    packages: packages.map((p: any) => ({
      id: p.id, name: p.name,
      left: p.total_sessions - p.used_sessions,
      validUntil: dateStr(p.valid_until),
    })),
    creditCents: Number(credit[0].c),
  };
}

// ---------- E-posti kinnituskood + seadme küpsis ----------

export async function createEmailCode(email: string): Promise<string> {
  const sql = requireDb();
  const em = email.trim().toLowerCase();
  const code = String(randomInt(100000, 1000000));
  await sql`
    INSERT INTO bk_email_codes (email, code, expires_at)
    VALUES (${em}, ${code}, now() + interval '15 minutes')
  `;
  return code;
}

export async function checkEmailCode(email: string, code: string): Promise<boolean> {
  const sql = requireDb();
  const em = email.trim().toLowerCase();
  const rows = await sql`
    UPDATE bk_email_codes SET used = true
    WHERE id = (
      SELECT id FROM bk_email_codes
      WHERE email = ${em} AND code = ${code} AND NOT used AND expires_at > now()
      ORDER BY id DESC LIMIT 1
    )
    RETURNING id
  `;
  return rows.length > 0;
}

const DEVICE_DAYS = 90;

/** Allkirjastatud "seade on selle e-posti jaoks kinnitatud" küpsise väärtus. */
export function deviceToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({
    e: email.trim().toLowerCase(),
    exp: Date.now() + DEVICE_DAYS * 86400_000,
  })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update('bkdev:' + payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyDeviceToken(token: string | undefined, email: string): boolean {
  if (!token || !SECRET) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = createHmac('sha256', SECRET).update('bkdev:' + payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.e === email.trim().toLowerCase() && Date.now() < data.exp;
  } catch {
    return false;
  }
}

// ---------- Hind ----------

export async function computePrice(opts: {
  type: 'float' | 'group';
  units: number;             // floatingul aegade arv, grupil kohtade arv
  sessionPriceCents?: number;
  member: boolean;
  promoCode?: string;
}) {
  const s = await getSettings();
  const base = opts.type === 'float'
    ? Number(s.price_float_cents || 4000)
    : (opts.sessionPriceCents ?? Number(s.price_group_cents || 4000));
  const unit = opts.member ? Math.min(base, Number(s.price_member_cents || 3000)) : base;
  let total = unit * opts.units;
  let promo: { code: string; pct?: number; amountCents?: number } | null = null;

  if (opts.promoCode && !opts.member) {
    const sql = requireDb();
    const now = nowTallinn();
    const rows = await sql`
      SELECT code, pct, amount_cents FROM bk_promos
      WHERE upper(code) = upper(${opts.promoCode}) AND active
        AND (valid_until IS NULL OR valid_until >= ${now.date}::date)
        AND (max_uses IS NULL OR used < max_uses)
    `;
    if (rows[0]) {
      const p = rows[0];
      if (p.pct) total = Math.round(total * (100 - p.pct) / 100);
      else if (p.amount_cents) total = Math.max(0, total - p.amount_cents);
      promo = { code: p.code, pct: p.pct, amountCents: p.amount_cents };
    }
  }
  return { totalCents: total, unitCents: unit, promo };
}

// ---------- Broneeringu loomine ----------

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export type CreateResult =
  | { ok: true; bookings: { id: number; token: string; date: string; time: string; roomName: string }[]; amountCents: number }
  | { ok: false; error: string; conflictTimes?: string[] };

/**
 * Loob broneeringu(d). Neoni HTTP-draiveril pole interaktiivseid transaktsioone,
 * seega tugineme: (1) DB EXCLUDE constraint topeltbroneeringu vastu, (2) aatomsed
 * UPDATE ... WHERE tingimusega read (kohad, paketikorrad), (3) kompensatsioon vea korral.
 */
export async function createBooking(input: {
  type: 'float' | 'group' | 'rent';
  slots?: { date: string; time: string }[];   // float
  sessionId?: number; seats?: number;          // group
  rentRoom?: string; rentDate?: string; rentHours?: string[]; purpose?: string; // rent
  name: string; email: string; phone: string; locale: string;
  payment: 'paysera' | 'cash' | 'package' | 'credit';
  packageId?: number;
  promoCode?: string;
  emailVerified: boolean;   // kood või seadmeküpsis kontrollitud (pakett/krediit/liikmehind)
}): Promise<CreateResult> {
  const sql = requireDb();
  const s = await getSettings();
  const cutoff = Number(s.cutoff_min || 60);

  const client = await upsertClient(input.email, input.name, input.phone, input.locale);
  if (client.blocked) {
    return { ok: false, error: 'blocked' };
  }
  const now = nowTallinn();
  const isMember = input.emailVerified && client.member_until && dateStr(client.member_until) >= now.date;

  // Pakett/krediit nõuab kinnitatud e-posti
  if ((input.payment === 'package' || input.payment === 'credit') && !input.emailVerified) {
    return { ok: false, error: 'verification_required' };
  }

  // --- RENT: ootel soov, tundide kaupa ühe tokeniga ---
  if (input.type === 'rent') {
    const { rentRoom, rentDate, rentHours } = input;
    if (!rentRoom || !rentDate || !rentHours?.length) return { ok: false, error: 'invalid' };
    const room = (await sql`SELECT id, name FROM bk_rooms WHERE slug = ${rentRoom} AND active`)[0];
    if (!room) return { ok: false, error: 'invalid' };
    const rate = rentRoom === 'suur-saal' ? Number(s.rent_suur_cents_h || 2500) : Number(s.rent_vaike_cents_h || 700);
    const token = newToken();
    const created: any[] = [];
    for (const time of rentHours) {
      if (!withinCutoff(rentDate, time, cutoff)) continue;
      try {
        const rows = await sql`
          INSERT INTO bk_bookings (type, room_id, date, start_time, duration_min, client_id,
            status, payment, amount_cents, token, purpose, locale)
          VALUES ('rent', ${room.id}, ${rentDate}, ${time}, 60, ${client.id},
            'pending', 'cash', ${rate}, ${token + '_' + time.replace(':', '')}, ${input.purpose || ''}, ${input.locale})
          RETURNING id
        `;
        created.push({ id: rows[0].id, token, date: rentDate, time, roomName: room.name });
      } catch { /* kattuvus — jätame tunni vahele */ }
    }
    if (!created.length) return { ok: false, error: 'conflict' };
    return { ok: true, bookings: created, amountCents: rate * created.length };
  }

  // --- GROUP: aatomne kohtade broneerimine ---
  if (input.type === 'group') {
    const seats = Math.max(1, Math.min(10, input.seats || 1));
    const sess = (await sql`
      SELECT s.*, r.name AS room_name FROM bk_sessions s JOIN bk_rooms r ON r.id = s.room_id
      WHERE s.id = ${input.sessionId} AND s.status = 'active'
    `)[0];
    if (!sess) return { ok: false, error: 'invalid' };
    const date = dateStr(sess.date);
    const time = hhmm(sess.start_time);
    if (!withinCutoff(date, time, cutoff)) return { ok: false, error: 'too_late' };

    const price = await computePrice({
      type: 'group', units: seats, sessionPriceCents: sess.price_cents,
      member: !!isMember, promoCode: input.promoCode,
    });

    // Kohad aatomiliselt
    const grabbed = await sql`
      UPDATE bk_sessions SET booked = booked + ${seats}
      WHERE id = ${sess.id} AND status = 'active' AND booked + ${seats} <= capacity
      RETURNING id
    `;
    if (!grabbed.length) return { ok: false, error: 'full' };

    const token = newToken();
    try {
      const pay = await settlePayment(sql, client.id, input, price.totalCents, seats);
      if (!pay.ok) throw new Error(pay.error);
      const rows = await sql`
        INSERT INTO bk_bookings (type, room_id, session_id, date, start_time, duration_min, seats,
          client_id, status, payment, amount_cents, paid, package_id, promo_code, token, locale)
        VALUES ('group', ${sess.room_id}, ${sess.id}, ${date}, ${time}, ${sess.duration_min}, ${seats},
          ${client.id}, 'active', ${input.payment}, ${price.totalCents}, ${pay.paid},
          ${pay.packageId}, ${price.promo?.code || null}, ${token}, ${input.locale})
        RETURNING id
      `;
      if (pay.packageId) {
        await sql`INSERT INTO bk_package_uses (package_id, booking_id, sessions) VALUES (${pay.packageId}, ${rows[0].id}, ${seats})`;
      }
      if (price.promo) await sql`UPDATE bk_promos SET used = used + 1 WHERE upper(code) = upper(${price.promo.code})`;
      return {
        ok: true, amountCents: price.totalCents,
        bookings: [{ id: rows[0].id, token, date, time, roomName: sess.name }],
      };
    } catch (e) {
      await sql`UPDATE bk_sessions SET booked = GREATEST(0, booked - ${seats}) WHERE id = ${sess.id}`;
      const msg = e instanceof Error ? e.message : 'error';
      return { ok: false, error: ['no_package', 'no_credit'].includes(msg) ? msg : 'error' };
    }
  }

  // --- FLOAT: iga valitud aeg omaette broneering (EXCLUDE constraint kaitseb) ---
  const slots = input.slots || [];
  if (!slots.length || slots.length > 6) return { ok: false, error: 'invalid' };

  const price = await computePrice({
    type: 'float', units: slots.length, member: !!isMember, promoCode: input.promoCode,
  });

  // Makse enne (pakett/krediit); paysera/cash puhul paid=false / kohapeal
  const pay = await settlePayment(sql, client.id, input, price.totalCents, slots.length);
  if (!pay.ok) return { ok: false, error: pay.error };

  const created: any[] = [];
  const conflicts: string[] = [];
  for (const slot of slots) {
    if (!withinCutoff(slot.date, slot.time, cutoff)) { conflicts.push(slot.time); continue; }
    // leia vaba floating-ruum sellel ajal (malli järgi õige ruum)
    const avail = await floatAvailability(slot.date);
    const match = avail.slots.find((x) => x.time === slot.time);
    if (!match) { conflicts.push(slot.time); continue; }
    const token = newToken();
    try {
      const rows = await sql`
        INSERT INTO bk_bookings (type, room_id, date, start_time, duration_min, client_id,
          status, payment, amount_cents, paid, package_id, promo_code, token, locale)
        VALUES ('float', ${match.roomId}, ${slot.date}, ${slot.time}, 60, ${client.id},
          'active', ${input.payment}, ${Math.round(price.totalCents / slots.length)}, ${pay.paid},
          ${pay.packageId}, ${price.promo?.code || null}, ${token}, ${input.locale})
        RETURNING id
      `;
      if (pay.packageId) {
        await sql`INSERT INTO bk_package_uses (package_id, booking_id, sessions) VALUES (${pay.packageId}, ${rows[0].id}, 1)`;
      }
      created.push({ id: rows[0].id, token, date: slot.date, time: slot.time, roomName: match.roomName });
    } catch {
      conflicts.push(slot.time); // keegi jõudis ette — constraint lõi tagasi
    }
  }

  if (!created.length) {
    // kõik ajad läksid vahepeal kinni — anna paketikorrad/krediit tagasi
    await rollbackPayment(sql, client.id, pay, slots.length);
    return { ok: false, error: 'conflict', conflictTimes: conflicts };
  }
  if (conflicts.length && pay.packageId) {
    // osa aegu ebaõnnestus: tagasta kasutamata paketikorrad
    await sql`UPDATE bk_packages SET used_sessions = GREATEST(0, used_sessions - ${conflicts.length}) WHERE id = ${pay.packageId}`;
  }
  if (price.promo) await sql`UPDATE bk_promos SET used = used + 1 WHERE upper(code) = upper(${price.promo.code})`;
  return { ok: true, bookings: created, amountCents: price.totalCents };
}

/** Paketi/krediidi "maksmine". paysera → paid=false (makse kinnitab callback), cash → kohapeal. */
async function settlePayment(sql: any, clientId: number, input: any, totalCents: number, units: number):
  Promise<{ ok: true; paid: boolean; packageId: number | null } | { ok: false; error: string }> {
  if (input.payment === 'package') {
    const now = nowTallinn();
    const rows = await sql`
      UPDATE bk_packages SET used_sessions = used_sessions + ${units}
      WHERE id = ${input.packageId} AND client_id = ${clientId}
        AND used_sessions + ${units} <= total_sessions AND valid_until >= ${now.date}::date
      RETURNING id
    `;
    if (!rows.length) return { ok: false, error: 'no_package' };
    return { ok: true, paid: true, packageId: rows[0].id };
  }
  if (input.payment === 'credit') {
    const bal = await sql`SELECT COALESCE(SUM(amount_cents),0) AS c FROM bk_credits WHERE client_id = ${clientId}`;
    if (Number(bal[0].c) < totalCents) return { ok: false, error: 'no_credit' };
    await sql`INSERT INTO bk_credits (client_id, amount_cents, note) VALUES (${clientId}, ${-totalCents}, 'Broneeringu eest')`;
    return { ok: true, paid: true, packageId: null };
  }
  // paysera: makse algatatakse eraldi sammuna; cash: kohapeal
  return { ok: true, paid: false, packageId: null };
}

async function rollbackPayment(sql: any, clientId: number, pay: any, units: number) {
  if (pay.packageId) {
    await sql`UPDATE bk_packages SET used_sessions = GREATEST(0, used_sessions - ${units}) WHERE id = ${pay.packageId}`;
  } else {
    // krediidi tagastus: leia viimane negatiivne rida ja kompenseeri
    const last = await sql`
      SELECT id, amount_cents FROM bk_credits
      WHERE client_id = ${clientId} AND amount_cents < 0 ORDER BY id DESC LIMIT 1
    `;
    if (last[0]) {
      await sql`INSERT INTO bk_credits (client_id, amount_cents, note) VALUES (${clientId}, ${-last[0].amount_cents}, 'Tagastus: ajad läksid kinni')`;
    }
  }
}

// ---------- Tühistamine ----------

export async function getBookingByToken(token: string) {
  const sql = requireDb();
  // rendil on token kujul <token>_<HHMM>; otsime prefiksi järgi kõik read
  const rows = await sql`
    SELECT b.*, r.name AS room_name, c.email, c.name AS client_name,
           s.name AS session_name
    FROM bk_bookings b
    JOIN bk_rooms r ON r.id = b.room_id
    JOIN bk_clients c ON c.id = b.client_id
    LEFT JOIN bk_sessions s ON s.id = b.session_id
    WHERE b.token = ${token} OR b.token LIKE ${token + '\\_%'}
    ORDER BY b.date, b.start_time
  `;
  return rows;
}

export async function cancelByToken(token: string):
  Promise<{ ok: boolean; error?: string; cancelled?: number }> {
  const sql = requireDb();
  const s = await getSettings();
  const cutoff = Number(s.cutoff_min || 60);
  const rows = await getBookingByToken(token);
  if (!rows.length) return { ok: false, error: 'not_found' };

  let cancelled = 0;
  for (const b of rows) {
    if (b.status !== 'active' && b.status !== 'pending') continue;
    const date = dateStr(b.date);
    const time = hhmm(b.start_time);
    if (!withinCutoff(date, time, cutoff)) continue; // liiga hilja — jääb alles

    await sql`UPDATE bk_bookings SET status = 'cancelled', cancelled_at = now() WHERE id = ${b.id}`;
    cancelled++;

    // grupikohad tagasi
    if (b.type === 'group' && b.session_id) {
      await sql`UPDATE bk_sessions SET booked = GREATEST(0, booked - ${b.seats}) WHERE id = ${b.session_id}`;
    }
    // paketikord tagasi
    if (b.package_id) {
      const uses = await sql`
        UPDATE bk_package_uses SET returned = true
        WHERE booking_id = ${b.id} AND NOT returned RETURNING sessions
      `;
      const n = uses.reduce((a: number, u: any) => a + u.sessions, 0);
      if (n) await sql`UPDATE bk_packages SET used_sessions = GREATEST(0, used_sessions - ${n}) WHERE id = ${b.package_id}`;
    }
    // makstud raha → ettemaks (kasutaja otsus 10.07: variant a)
    if (b.paid && (b.payment === 'paysera' || b.payment === 'credit') && b.amount_cents > 0) {
      await sql`
        INSERT INTO bk_credits (client_id, amount_cents, booking_id, note)
        VALUES (${b.client_id}, ${b.amount_cents}, ${b.id}, 'Tühistatud broneeringu ettemaks')
      `;
    }
  }
  if (!cancelled) return { ok: false, error: 'too_late' };
  return { ok: true, cancelled };
}

// ---------- E-poe paketiost → broneeritavad korrad ----------

/** E-poe toodete nimed → paketi parameetrid (kordi, kehtivus päevades).
 *  Kinkekaardid on teadlikult VÄLJAS (kasutaja otsus 10.07: 3 eri allikat, ei ehita). */
const SHOP_PACKAGES: [RegExp, { name: string; sessions: number; days: number }][] = [
  [/keha ja meele 3x proovipakett/i, { name: 'Keha ja meele 3x proovipakett', sessions: 3, days: 30 }],
  [/10 korra kaart/i, { name: '10 korra kaart', sessions: 10, days: 305 }],
  [/5 korra kaart/i, { name: '5 korra kaart', sessions: 5, days: 153 }],
  [/3 korra kaart/i, { name: '3 korra kaart', sessions: 3, days: 92 }],
  [/hommikune energialaeng/i, { name: 'Sinu hommikune energialaeng', sessions: 5, days: 183 }],
];

/**
 * Loob e-poe tellimuse põhjal automaatselt broneeritavad paketid (Paysera callbackist).
 * Idempotentne order_id järgi — Paysera võib callbacki mitu korda kutsuda.
 */
export async function grantShopPackages(email: string, name: string, itemsText: string, orderid: string) {
  const sql = requireDb();
  if (!email.includes('@') || !itemsText) return { granted: 0 };
  const existing = await sql`SELECT 1 FROM bk_packages WHERE order_id = ${orderid} LIMIT 1`;
  if (existing.length) return { granted: 0 };

  const grants: { name: string; sessions: number; days: number }[] = [];
  for (const part of itemsText.split(',')) {
    for (const [re, def] of SHOP_PACKAGES) {
      if (re.test(part)) {
        const qty = Math.min(10, Number((part.match(/x\s*(\d+)\s*$/) || [])[1] || 1));
        for (let i = 0; i < qty; i++) grants.push(def);
        break;
      }
    }
  }
  if (!grants.length) return { granted: 0 };

  const client = await upsertClient(email, name || '', '', 'et');
  const now = nowTallinn();
  for (const g of grants) {
    await sql`
      INSERT INTO bk_packages (client_id, name, total_sessions, valid_until, source, order_id)
      VALUES (${client.id}, ${g.name}, ${g.sessions}, ${addDays(now.date, g.days)}, 'shop', ${orderid})
    `;
  }
  return { granted: grants.length };
}

/**
 * Kas e-post tohib osta "Keha ja meele 3x proovipaketti" (ainult UUTELE klientidele).
 * Blokeeritud, kui: (a) sama e-post on e-poest proovipaketi juba ostnud, VÕI
 * (b) e-post on broneerimissüsteemis olemasoleva broneeringu või paketiga
 * (pärast Hopitude importi = kõik senised kliendid).
 * NB: uue e-postiga saab reeglist ikka mööda — see püüab kinni praeguse "kavaldamise"
 * (sama inimene ostab sama meiliga korduvalt).
 */
export async function trialAllowed(email: string): Promise<boolean> {
  const sql = requireDb();
  const em = email.trim().toLowerCase();
  const rows = await sql`
    SELECT
      EXISTS (SELECT 1 FROM orders WHERE lower(email) = ${em} AND items ILIKE '%proovipakett%') AS bought_before,
      EXISTS (
        SELECT 1 FROM bk_clients c
        WHERE c.email = ${em} AND (
          c.visits > 0   -- Hopitudest imporditud külastuste ajalugu
          OR EXISTS (SELECT 1 FROM bk_bookings b WHERE b.client_id = c.id)
          OR EXISTS (SELECT 1 FROM bk_packages p WHERE p.client_id = c.id)
        )
      ) AS existing_client
  `;
  return !rows[0].bought_before && !rows[0].existing_client;
}

// ---------- Admin ----------

/** Admin tühistab broneeringu id järgi — cutoff ei kehti; tagastused samad mis kliendil. */
export async function adminCancelBooking(bookingId: number) {
  const sql = requireDb();
  const rows = await sql`
    SELECT b.*, c.email, c.name AS client_name, r.name AS room_name, s.name AS session_name
    FROM bk_bookings b
    JOIN bk_clients c ON c.id = b.client_id
    JOIN bk_rooms r ON r.id = b.room_id
    LEFT JOIN bk_sessions s ON s.id = b.session_id
    WHERE b.id = ${bookingId} AND b.status IN ('active','pending')
  `;
  const b = rows[0];
  if (!b) return { ok: false as const, error: 'not_found' };

  await sql`UPDATE bk_bookings SET status = 'cancelled', cancelled_at = now() WHERE id = ${b.id}`;
  if (b.type === 'group' && b.session_id) {
    await sql`UPDATE bk_sessions SET booked = GREATEST(0, booked - ${b.seats}) WHERE id = ${b.session_id}`;
  }
  if (b.package_id) {
    const uses = await sql`
      UPDATE bk_package_uses SET returned = true WHERE booking_id = ${b.id} AND NOT returned RETURNING sessions
    `;
    const n = uses.reduce((a: number, u: any) => a + u.sessions, 0);
    if (n) await sql`UPDATE bk_packages SET used_sessions = GREATEST(0, used_sessions - ${n}) WHERE id = ${b.package_id}`;
  }
  if (b.paid && (b.payment === 'paysera' || b.payment === 'credit') && b.amount_cents > 0) {
    await sql`
      INSERT INTO bk_credits (client_id, amount_cents, booking_id, note)
      VALUES (${b.client_id}, ${b.amount_cents}, ${b.id}, 'Admini tühistatud broneeringu ettemaks')
    `;
  }
  return { ok: true as const, booking: b };
}

/** Rendisoovi otsus: kinnita (pending→active) või lükka tagasi (pending→rejected). */
export async function rentDecision(token: string, approve: boolean) {
  const sql = requireDb();
  const rows = await getBookingByToken(token);
  const pend = rows.filter((r: any) => r.status === 'pending' && r.type === 'rent');
  if (!pend.length) return { ok: false as const, error: 'not_found' };
  for (const b of pend) {
    await sql`UPDATE bk_bookings SET status = ${approve ? 'active' : 'rejected'} WHERE id = ${b.id}`;
  }
  return { ok: true as const, rows: pend };
}

/** Admin loob broneeringu käsitsi (telefoni teel / migratsioon Hopitudest). Cutoff ei kehti. */
export async function adminManualBooking(input: {
  type: 'float' | 'group';
  roomSlug?: string; date?: string; time?: string;   // float
  sessionId?: number; seats?: number;                 // group
  name: string; email: string; phone: string;
  note?: string;
}) {
  const sql = requireDb();
  const client = await upsertClient(input.email, input.name, input.phone || '', 'et');
  const token = newToken();

  if (input.type === 'group') {
    const seats = Math.max(1, input.seats || 1);
    const sess = (await sql`SELECT * FROM bk_sessions WHERE id = ${input.sessionId} AND status = 'active'`)[0];
    if (!sess) return { ok: false as const, error: 'not_found' };
    const grabbed = await sql`
      UPDATE bk_sessions SET booked = booked + ${seats}
      WHERE id = ${sess.id} AND booked + ${seats} <= capacity RETURNING id
    `;
    if (!grabbed.length) return { ok: false as const, error: 'full' };
    await sql`
      INSERT INTO bk_bookings (type, room_id, session_id, date, start_time, duration_min, seats,
        client_id, status, payment, amount_cents, paid, token, purpose)
      VALUES ('group', ${sess.room_id}, ${sess.id}, ${dateStr(sess.date)}, ${hhmm(sess.start_time)},
        ${sess.duration_min}, ${seats}, ${client.id}, 'active', 'cash', 0, true, ${token}, ${input.note || 'Admin sisestatud'})
    `;
    return { ok: true as const, token };
  }

  const room = (await sql`SELECT id FROM bk_rooms WHERE slug = ${input.roomSlug}`)[0];
  if (!room || !input.date || !input.time) return { ok: false as const, error: 'invalid' };
  try {
    await sql`
      INSERT INTO bk_bookings (type, room_id, date, start_time, duration_min, client_id,
        status, payment, amount_cents, paid, token, purpose)
      VALUES ('float', ${room.id}, ${input.date}, ${input.time}, 60, ${client.id},
        'active', 'cash', 0, true, ${token}, ${input.note || 'Admin sisestatud'})
    `;
  } catch {
    return { ok: false as const, error: 'conflict' };
  }
  return { ok: true as const, token };
}

/** Genereeri grupiseansid korduva mustri järgi (nt T/N 18:00, N nädalat ette). */
export async function generateSessions(input: {
  dows: number[]; time: string; weeks: number;
  name: string; capacity: number; priceCents: number; durationMin: number;
}) {
  const sql = requireDb();
  const room = (await sql`SELECT id FROM bk_rooms WHERE slug = 'suur-saal'`)[0];
  const now = nowTallinn();
  let created = 0;
  const days = Math.min(input.weeks, 16) * 7;
  for (let i = 1; i <= days; i++) {
    const date = addDays(now.date, i);
    if (!input.dows.includes(dowOf(date))) continue;
    const rows = await sql`
      INSERT INTO bk_sessions (room_id, date, start_time, duration_min, name, capacity, price_cents)
      VALUES (${room.id}, ${date}, ${input.time}, ${input.durationMin}, ${input.name}, ${input.capacity}, ${input.priceCents})
      ON CONFLICT (room_id, date, start_time) DO NOTHING
      RETURNING id
    `;
    created += rows.length;
  }
  return { ok: true as const, created };
}

/** Tühista grupiseanss: seanss + kõik selle broneeringud (tagastustega). Tagastab osalejad meilideks. */
export async function cancelSession(sessionId: number) {
  const sql = requireDb();
  const sess = (await sql`SELECT * FROM bk_sessions WHERE id = ${sessionId} AND status = 'active'`)[0];
  if (!sess) return { ok: false as const, error: 'not_found' };
  const bookings = await sql`
    SELECT id FROM bk_bookings WHERE session_id = ${sessionId} AND status = 'active'
  `;
  const notified: any[] = [];
  for (const b of bookings) {
    const res = await adminCancelBooking(b.id);
    if (res.ok) notified.push(res.booking);
  }
  await sql`UPDATE bk_sessions SET status = 'cancelled' WHERE id = ${sessionId}`;
  return { ok: true as const, session: sess, cancelledBookings: notified };
}
