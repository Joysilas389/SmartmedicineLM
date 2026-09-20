/*
 * POST /api/auth  { action: 'signup' | 'login' | 'logout' | 'delete', email, password, name, signupCode }
 * GET  /api/auth  → { enabled, user }
 */
import { json } from './_http.js';
import { getDb, ensureSchema } from './_db.js';
import { authEnabled, loginRequired, hashPassword, verifyPassword, signSession, cookieFor, currentUser, sameOrigin } from './_auth.js';

export const config = { runtime: 'edge' };

const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.display_name || '', createdAt: u.created_at } : null);

function withCookie(body, cookie, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookie },
  });
}

export default async function handler(req) {
  if (!authEnabled()) return json({ enabled: false, user: null });
  const db = getDb();
  try {
    await ensureSchema(db);
  } catch (err) {
    return json({ error: `Could not reach the database: ${err.message}` }, 503);
  }

  if (req.method === 'GET') {
    const user = await currentUser(req).catch(() => null);
    return json({ enabled: true, loginRequired: loginRequired(), signupCode: Boolean(process.env.SIGNUP_CODE), user: publicUser(user) });
  }
  if (req.method !== 'POST') return json({ error: 'Use GET or POST.' }, 405);
  if (!sameOrigin(req)) return json({ error: 'Cross-site request refused.' }, 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  const action = body?.action;
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');

  if (action === 'logout') return withCookie({ ok: true }, cookieFor('', req, 0));

  if (action === 'signup') {
    if (process.env.SIGNUP_CODE && body.signupCode !== process.env.SIGNUP_CODE)
      return json({ error: 'That sign-up code is not right. Ask the owner of this site for it.', field: 'signupCode' }, 403);
    if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.', field: 'email' }, 400);
    if (password.length < 8) return json({ error: 'Use a password of at least 8 characters.', field: 'password' }, 400);
    if (password.length > 200) return json({ error: 'That password is too long.', field: 'password' }, 400);
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length) return json({ error: 'An account with this email already exists. Sign in instead.', field: 'email' }, 409);
    const name = String(body.name || '').trim().slice(0, 80) || null;
    const rows = await db.query(
      'INSERT INTO users (email, display_name, password_hash, last_login) VALUES ($1, $2, $3, now()) RETURNING id, email, display_name, session_version, created_at',
      [email, name, await hashPassword(password)]
    );
    return withCookie({ user: publicUser(rows[0]) }, cookieFor(await signSession(rows[0]), req));
  }

  if (action === 'login') {
    const rows = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const wrong = () => json({ error: 'Email or password is incorrect.' }, 401);
    if (!user || !user.password_hash) {
      await hashPassword(password); // same work either way, so timing doesn't reveal which emails exist
      return wrong();
    }
    if (user.locked_until && new Date(user.locked_until) > new Date())
      return json({ error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` }, 429);
    if (!(await verifyPassword(password, user.password_hash))) {
      const fails = (user.failed_logins || 0) + 1;
      const lock = fails >= MAX_FAILS;
      await db.query(
        `UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $3::boolean THEN now() + interval '${LOCK_MINUTES} minutes' ELSE NULL END WHERE id = $1`,
        [user.id, lock ? 0 : fails, lock]
      );
      return wrong();
    }
    await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = now() WHERE id = $1', [user.id]);
    return withCookie({ user: publicUser(user) }, cookieFor(await signSession(user), req));
  }

  if (action === 'logout_all' || action === 'delete') {
    const user = await currentUser(req).catch(() => null);
    if (!user) return json({ error: 'Please sign in first.', code: 'LOGIN' }, 401);
    if (action === 'logout_all') {
      await db.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [user.id]);
      return withCookie({ ok: true }, cookieFor('', req, 0));
    }
    const full = (await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]))[0];
    if (!(await verifyPassword(password, full?.password_hash))) return json({ error: 'Password is incorrect.', field: 'password' }, 401);
    await db.query('DELETE FROM users WHERE id = $1', [user.id]); // cascades to synced data
    return withCookie({ ok: true, deleted: true }, cookieFor('', req, 0));
  }

  return json({ error: 'Unknown action.' }, 400);
}
