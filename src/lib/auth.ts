import { createHmac, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_SECRET = import.meta.env.SESSION_SECRET || process.env.SESSION_SECRET || '';
const SESSION_DAYS = 7;
export const SESSION_COOKIE = 'hk_admin';

// --- Paroolid (scrypt) ---

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// --- Sessioon (HMAC-allkirjastatud küpsis) ---

function sign(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

export function createSession(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + SESSION_DAYS * 86400_000 })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): { username: string } | null {
  if (!token || !SESSION_SECRET) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.u !== 'string' || Date.now() > data.exp) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const maxAge = SESSION_DAYS * 86400;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
