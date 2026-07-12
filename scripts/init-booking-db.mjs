// Broneerimissüsteemi andmebaas: loob bk_* tabelid ja algandmed (ruumid, ajamallid, seaded).
// Olemasolevaid tabeleid (orders, products, ...) EI puututa. Skripti võib jooksutada korduvalt.
// Kasutamine:
//   node scripts/init-booking-db.mjs
// Loeb DATABASE_URL .env failist kui keskkonnas pole.

import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  const env = await readFile('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL puudub.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

console.log('Loon broneerimise tabelid...');

// Ajavahemike kattumise välistuseks (room_id = ja tsrange &&)
await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;

// Ruumid
await sql`
  CREATE TABLE IF NOT EXISTS bk_rooms (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'floating' | 'saal' | 'tuba'
    active BOOLEAN NOT NULL DEFAULT true
  )
`;

// Fikseeritud algusajad ruumi ja nädalapäeva kaupa (floating: 1h seanss + 30 min puhastus
// on malli sammus juba sees — ajad ON puhastuspausidega graafik)
await sql`
  CREATE TABLE IF NOT EXISTS bk_templates (
    id SERIAL PRIMARY KEY,
    room_id INT NOT NULL REFERENCES bk_rooms(id),
    dow INT NOT NULL,                -- 0=P, 1=E ... 6=L (nagu JS getDay)
    start_time TIME NOT NULL,
    duration_min INT NOT NULL DEFAULT 60,
    UNIQUE(room_id, dow, start_time)
  )
`;

// Grupiseansid (Suur saal): igal korral oma nimi, maht ja hind
await sql`
  CREATE TABLE IF NOT EXISTS bk_sessions (
    id SERIAL PRIMARY KEY,
    room_id INT NOT NULL REFERENCES bk_rooms(id),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration_min INT NOT NULL DEFAULT 120,
    name TEXT NOT NULL DEFAULT 'Vabastav hingamine grupis',
    capacity INT NOT NULL DEFAULT 10,
    booked INT NOT NULL DEFAULT 0,   -- aatomne kohtade arvestus (UPDATE ... WHERE booked+n <= capacity)
    price_cents INT NOT NULL DEFAULT 4000,
    status TEXT NOT NULL DEFAULT 'active',  -- active | cancelled
    UNIQUE(room_id, date, start_time)
  )
`;

// Kliendid (paroolivaba: identiteet = e-post)
await sql`
  CREATE TABLE IF NOT EXISTS bk_clients (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    notes TEXT NOT NULL DEFAULT '',
    blocked BOOLEAN NOT NULL DEFAULT false,
    member_until DATE,               -- liikmelisus (Stripe): liikmehind kehtib kuni selle kuupäevani
    locale TEXT NOT NULL DEFAULT 'et',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

// Paketid (kordade kaardid, kinkekaardid, liikme kuukorrad, import Hopitudest)
await sql`
  CREATE TABLE IF NOT EXISTS bk_packages (
    id SERIAL PRIMARY KEY,
    client_id INT REFERENCES bk_clients(id),  -- NULL kinkekaardil, mis pole veel lunastatud
    name TEXT NOT NULL,
    total_sessions INT NOT NULL,
    used_sessions INT NOT NULL DEFAULT 0,
    valid_until DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'admin',     -- admin | import | shop | stripe | gift
    gift_code TEXT UNIQUE,                    -- kinkekaardi kood (lunastatakse broneerimisel)
    order_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

// Broneeringud. NB: kuupäev+kellaaeg hoitakse date+time väljadena (Tallinna aeg),
// timestamptz-i EI kasutata teadlikult — vt runbooki to_char lõks.
await sql`
  CREATE TABLE IF NOT EXISTS bk_bookings (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,              -- float | group | rent
    room_id INT NOT NULL REFERENCES bk_rooms(id),
    session_id INT REFERENCES bk_sessions(id),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration_min INT NOT NULL,
    seats INT NOT NULL DEFAULT 1,
    client_id INT NOT NULL REFERENCES bk_clients(id),
    status TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | pending (rent) | rejected
    payment TEXT NOT NULL,           -- paysera | cash | package | credit | gift | rent
    amount_cents INT NOT NULL DEFAULT 0,
    paid BOOLEAN NOT NULL DEFAULT false,
    package_id INT REFERENCES bk_packages(id),
    promo_code TEXT,
    token TEXT UNIQUE NOT NULL,      -- tühistamislingi salajane token
    purpose TEXT,                    -- rendi otstarve
    locale TEXT NOT NULL DEFAULT 'et',
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ
  )
`;

// Topeltbroneeringu välistus ANDMEBAASI tasemel: sama ruumi aktiivsed/ootel broneeringud
// ei tohi ajas kattuda. Grupibroneeringud on väljas (nad jagavad sama seanssi, mahtu
// kontrollib bk_sessions.booked aatomne uuendus).
await sql`
  DO $$ BEGIN
    ALTER TABLE bk_bookings ADD CONSTRAINT bk_no_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        tsrange(
          (date + start_time)::timestamp,
          (date + start_time + make_interval(mins => duration_min))::timestamp
        ) WITH &&
      ) WHERE (status IN ('active','pending') AND type <> 'group');
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END $$
`;

// Paketikordade kasutus (tühistamisel korra tagastamiseks)
await sql`
  CREATE TABLE IF NOT EXISTS bk_package_uses (
    id SERIAL PRIMARY KEY,
    package_id INT NOT NULL REFERENCES bk_packages(id),
    booking_id INT NOT NULL REFERENCES bk_bookings(id),
    sessions INT NOT NULL DEFAULT 1,
    returned BOOLEAN NOT NULL DEFAULT false
  )
`;

// Ettemaks (tühistatud rahamakse jääb kliendile krediidiks). Saldo = SUM(amount_cents).
await sql`
  CREATE TABLE IF NOT EXISTS bk_credits (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES bk_clients(id),
    amount_cents INT NOT NULL,       -- + lisandus, - kasutati
    booking_id INT REFERENCES bk_bookings(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

// Sooduskoodid
await sql`
  CREATE TABLE IF NOT EXISTS bk_promos (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    pct INT,                         -- protsent (nt 15)
    amount_cents INT,                -- VÕI fikseeritud summa
    valid_until DATE,
    max_uses INT,
    used INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true
  )
`;

// Admini lukustused (puhkus, remont, rendi eelbroneering enne kinnitust vms)
await sql`
  CREATE TABLE IF NOT EXISTS bk_blocks (
    id SERIAL PRIMARY KEY,
    room_id INT REFERENCES bk_rooms(id),  -- NULL = kõik ruumid
    date DATE NOT NULL,
    start_time TIME,                      -- NULL = terve päev
    duration_min INT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

// E-posti kinnituskoodid (paketi kasutamisel)
await sql`
  CREATE TABLE IF NOT EXISTS bk_email_codes (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

// Seaded (hinnad jm) — adminis muudetavad ilma deployta
await sql`
  CREATE TABLE IF NOT EXISTS bk_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

console.log('Tabelid loodud. Lisan algandmed...');

// Ruumid (Ecuador teadlikult välja lülitatud — vett pole sees)
await sql`
  INSERT INTO bk_rooms (slug, name, type, active) VALUES
    ('peruu', 'Peruu', 'floating', true),
    ('brasiilia', 'Brasiilia', 'floating', true),
    ('ecuador', 'Ecuador', 'floating', false),
    ('suur-saal', 'Suur saal', 'saal', true),
    ('vaike-tuba', 'Väike tuba', 'tuba', true)
  ON CONFLICT (slug) DO NOTHING
`;

// Floatingu graafik (kasutaja kinnitatud 10.07.2026):
// iga vann 1h seanss + 30 min puhastus; E-R kõik ajad, L-P ainult 10:30-16:30
const PERUU = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'];
const BRASIILIA = ['08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30'];
const WEEKEND_MIN = '10:30', WEEKEND_MAX = '16:30';

const rooms = await sql`SELECT id, slug FROM bk_rooms WHERE type = 'floating'`;
for (const room of rooms) {
  const starts = room.slug === 'peruu' ? PERUU : room.slug === 'brasiilia' ? BRASIILIA : PERUU;
  for (let dow = 0; dow <= 6; dow++) {
    const weekend = dow === 0 || dow === 6;
    for (const t of starts) {
      if (weekend && (t < WEEKEND_MIN || t > WEEKEND_MAX)) continue;
      await sql`
        INSERT INTO bk_templates (room_id, dow, start_time, duration_min)
        VALUES (${room.id}, ${dow}, ${t}, 60)
        ON CONFLICT (room_id, dow, start_time) DO NOTHING
      `;
    }
  }
}

// Seaded
const settings = [
  ['price_float_cents', '4000'],        // floating tavahind
  ['price_member_cents', '3000'],       // liikmehind (floating ja grupp)
  ['price_group_cents', '4000'],        // grupihingamise vaikehind
  ['rent_suur_cents_h', '2500'],        // Suur saal €/h (+km)
  ['rent_vaike_cents_h', '700'],        // Väike tuba €/h (+km)
  ['cutoff_min', '60'],                 // broneeri/tühista kuni X min enne algust
  ['horizon_days', '92'],               // ~3 kuud ette
  ['group_default_capacity', '10'],
  ['group_default_duration_min', '120'],
];
for (const [key, value] of settings) {
  await sql`INSERT INTO bk_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`;
}

const counts = await sql`
  SELECT
    (SELECT count(*) FROM bk_rooms) AS rooms,
    (SELECT count(*) FROM bk_templates) AS templates,
    (SELECT count(*) FROM bk_settings) AS settings
`;
console.log('Valmis:', counts[0]);
