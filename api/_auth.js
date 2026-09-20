/*
 * Authentication helpers (spec §63): PBKDF2 password hashing and signed, HttpOnly session
 * cookies, using only Web Crypto so they run in edge functions.
 */
import { getDb, dbConfigured, ensureSchema } from './_db.js';
import { json } from './_http.js';

const enc = new TextEncoder();
const COOKIE = 'sm_session';
const SESSION_DAYS = 30;
export const PBKDF2_ITERATIONS = 100_000;

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export const authEnabled = () => dbConfigured();
export const loginRequired = () => authEnabled() && process.env.REQUIRE_LOGIN !== 'false';

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64u(salt)}$${b64u(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2' || !hash) return false;
  const again = await hashPassword(password, unb64u(salt), Number(iter));
  return timingSafeEqual(unb64u(again.split('$')[3]), unb64u(hash));
}

async function hmacKey() {
  const secret = process.env.AUTH_SECRET || `smartmedicinelm-session:${process.env.DATABASE_URL || process.env.POSTGRES_URL || 'test'}`;
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(user, now = Date.now()) {
  const payload = b64u(enc.encode(JSON.stringify({ uid: user.id, v: user.session_version || 1, exp: now + SESSION_DAYS * 86400000 })));
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload)));
  return `${payload}.${sig}`;
}

export async function readSession(token, now = Date.now()) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), unb64u(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    return data.exp > now ? data : null;
  } catch {
    return null;
  }
}

export function cookieFor(token, req, maxAge = SESSION_DAYS * 86400) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function tokenFrom(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

/** Returns the signed-in user row, or null. */
export async function currentUser(req) {
  if (!authEnabled()) return null;
  const session = await readSession(tokenFrom(req));
  if (!session) return null;
  const db = getDb();
  await ensureSchema(db);
  const rows = await db.query('SELECT id, email, display_name, session_version, created_at FROM users WHERE id = $1', [session.uid]);
  const user = rows[0];
  return user && (user.session_version || 1) === session.v ? user : null;
}

/** Guard for model endpoints: when accounts are on, only signed-in users may spend API credit. */
export async function requireUser(req) {
  if (!loginRequired()) return { user: null };
  try {
    const user = await currentUser(req);
    if (user) return { user };
    return { denied: json({ error: 'Please sign in to use SmartMedicineLM.', code: 'LOGIN' }, 401) };
  } catch (err) {
    return { denied: json({ error: `Account service unavailable: ${err.message}` }, 503) };
  }
}

/** Blocks cross-site form posts: the Origin header, when present, must match this host. */
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
