// Impordib Hostingeri Exported_Orders.csv tellimused andmebaasi.
// Kasutamine: node scripts/import-orders-csv.mjs /tee/Exported_Orders.csv
// Idempotentne: sama orderid ei duplitseeru (ON CONFLICT DO NOTHING).

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

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Kasutamine: node scripts/import-orders-csv.mjs /tee/Exported_Orders.csv');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
      else field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = (await readFile(csvPath, 'utf8')).replace(/^﻿/, '');
const rows = parseCSV(raw);
const header = rows[0];
const col = (name) => header.indexOf(name);

const C = {
  order: col('Order Number'), email: col('Email'), name: col('Billing Name'),
  phone: col('Billing Phone'), orderStatus: col('Order Status'), created: col('Created'),
  product: col('Product Names'), qty: col('Quantity of Products'), total: col('Total'),
  street1: col('Street address 1'), street2: col('Street address 2'),
  city: col('City'), postal: col('Postal Code'),
  shippingMethod: col('Shipping Method'), payMethod: col('Payment Method'),
  payStatus: col('Payment Status'), notes: col('Notes'),
  discount: col('Discount Code'), discountAmt: col('Discount Amount'),
};

// Grupeeri tellimuse numbri järgi: esimene rida kannab tellimuse andmeid,
// jätkuread lisavad ainult tooteid
const orders = new Map();
let currentOrder = null;
for (const r of rows.slice(1)) {
  const num = r[C.order];
  if (num && num.trim()) {
    currentOrder = {
      orderid: num.replace(/^#/, ''),
      email: r[C.email], name: r[C.name], phone: r[C.phone],
      orderStatus: r[C.orderStatus], created: r[C.created],
      total: parseFloat(r[C.total] || '0'),
      address: [r[C.street1], r[C.street2], r[C.city], r[C.postal]].filter(Boolean).join(', '),
      shipping: r[C.shippingMethod] || '',
      payStatus: r[C.payStatus], payMethod: r[C.payMethod],
      notes: [r[C.notes], r[C.discount] ? `Sooduskood: ${r[C.discount]} (-€${r[C.discountAmt]})` : ''].filter(Boolean).join(' | '),
      products: [],
    };
    orders.set(currentOrder.orderid, currentOrder);
  }
  if (currentOrder && r[C.product] && r[C.product].trim()) {
    // Eemalda variandi sulud, nt "(250g - 16€/kg)"
    const name = r[C.product].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const qty = parseInt(r[C.qty] || '1', 10) || 1;
    currentOrder.products.push(`${name} x${qty}`);
  }
}

let imported = 0, skippedStatus = 0, skippedDupe = 0;
for (const o of orders.values()) {
  if (o.payStatus !== 'Paid') { skippedStatus++; continue; }
  const createdAt = new Date(o.created);
  if (isNaN(createdAt.getTime())) { console.warn('Vigane kuupäev:', o.orderid, o.created); continue; }
  const fulfillment = o.orderStatus === 'Fulfilled' ? 'fulfilled' : 'unfulfilled';
  const res = await sql`
    INSERT INTO orders (orderid, amount, status, fulfillment, name, email, phone, address, shipping, parcel, items, note, created_at)
    VALUES (${o.orderid}, ${o.total}, ${'paid'}, ${fulfillment}, ${o.name}, ${o.email}, ${o.phone},
            ${o.address}, ${o.shipping}, ${''}, ${o.products.join(', ')}, ${o.notes || null}, ${createdAt.toISOString()})
    ON CONFLICT (orderid) DO NOTHING
    RETURNING orderid
  `;
  if (res.length > 0) imported++; else skippedDupe++;
}

console.log(`\nValmis. Imporditud: ${imported}, vahele jäetud (pole Paid): ${skippedStatus}, juba olemas: ${skippedDupe}`);
const [stats] = await sql`SELECT COUNT(*) AS c, MIN(created_at) AS vanim, MAX(created_at) AS uusim, SUM(amount) AS summa FROM orders`;
console.log(`Andmebaasis kokku: ${stats.c} tellimust, ${new Date(stats.vanim).toLocaleDateString('et-EE')} – ${new Date(stats.uusim).toLocaleDateString('et-EE')}, käive €${Number(stats.summa).toFixed(2)}`);
