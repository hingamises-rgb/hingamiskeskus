import { neon } from '@neondatabase/serverless';

const DATABASE_URL = import.meta.env.DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('DATABASE_URL puudub — admin paneel ei tööta ilma andmebaasita');
}

export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export function requireDb() {
  if (!sql) throw new Error('DATABASE_URL on seadistamata');
  return sql;
}
