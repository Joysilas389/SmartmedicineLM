/*
 * Accounts + sync against a real PostgreSQL. Runs when TEST_DATABASE_URL is set, e.g.
 *   TEST_DATABASE_URL=postgres://postgres:pw@localhost/smtest npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signSession, readSession } from '../api/_auth.js';

test('password hashing and session tokens', async () => {
  const h = await hashPassword('correct horse');
  assert.match(h, /^pbkdf2\$100000\$/);
  assert.ok(await verifyPassword('correct horse', h));
  assert.ok(!(await verifyPassword('wrong horse', h)));
  const t = await signSession({ id: 'u1', session_version: 3 });
  assert.equal((await readSession(t)).uid, 'u1');
  const [p, s] = t.split('.');
  assert.equal(await readSession(`${p}x.${s}`), null, 'tampered payload rejected');
  assert.equal(await readSession(t, Date.now() + 31 * 86400000), null, 'expired token rejected');
});

const URL_ = process.env.TEST_DATABASE_URL;
let pool;
let setTestDb, auth, sync, chat;

before(async () => {
  if (!URL_) return;
  const pg = (await import('pg')).default;
  pool = new pg.Pool({ connectionString: URL_ });
  await pool.query('DROP TABLE IF EXISTS sync_records, users CASCADE');
  ({ setTestDb } = await import('../api/_db.js'));
  setTestDb({ query: (text, params) => pool.query(text, params).then((r) => r.rows) });
  auth = (await import('../api/auth.js')).default;
  sync = (await import('../api/sync.js')).default;
  chat = (await import('../api/chat.js')).default;
});
after(async () => pool?.end());

const HOST = 'https://sm.test';
const post = (path, body, cookie = '', origin = HOST) =>
  new Request(HOST + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

test('sign up, sign in, lockout, logout-all and delete', { skip: !URL_ && 'TEST_DATABASE_URL not set' }, async () => {
  let res = await auth(post('/api/auth', { action: 'signup', email: 'Ama@Example.com', password: 'short' }));
  assert.equal(res.status, 400);
  res = await auth(post('/api/auth', { action: 'signup', email: 'Ama@Example.com', password: 'nephron-2026', name: 'Ama' }));
  assert.equal(res.status, 200);
  const c1 = cookieOf(res);
  assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
  assert.equal((await res.json()).user.email, 'ama@example.com');
  assert.equal((await auth(post('/api/auth', { action: 'signup', email: 'ama@example.com', password: 'nephron-2026' }))).status, 409);
  assert.equal((await auth(post('/api/auth', { action: 'signup', email: 'x@y.co', password: 'nephron-2026' }, '', 'https://evil.test'))).status, 403, 'cross-origin refused');

  const me = await (await auth(new Request(HOST + '/api/auth', { headers: { cookie: c1 } }))).json();
  assert.equal(me.user.name, 'Ama');

  assert.equal((await auth(post('/api/auth', { action: 'login', email: 'ama@example.com', password: 'wrong-pass' }))).status, 401);
  assert.equal((await auth(post('/api/auth', { action: 'login', email: 'nobody@example.com', password: 'whatever1' }))).status, 401);
  res = await auth(post('/api/auth', { action: 'login', email: 'AMA@example.com', password: 'nephron-2026' }));
  assert.equal(res.status, 200);
  const c2 = cookieOf(res);

  for (let i = 0; i < 8; i++) await auth(post('/api/auth', { action: 'login', email: 'ama@example.com', password: 'bad-guess' }));
  assert.equal((await auth(post('/api/auth', { action: 'login', email: 'ama@example.com', password: 'nephron-2026' }))).status, 429, 'locked after 8 failures');
  await pool.query('UPDATE users SET locked_until = NULL');

  assert.equal((await auth(post('/api/auth', { action: 'logout_all' }, c2))).status, 200);
  const after = await (await auth(new Request(HOST + '/api/auth', { headers: { cookie: c1 } }))).json();
  assert.equal(after.user, null, 'all sessions revoked');

  res = await auth(post('/api/auth', { action: 'login', email: 'ama@example.com', password: 'nephron-2026' }));
  const c3 = cookieOf(res);
  assert.equal((await auth(post('/api/auth', { action: 'delete', password: 'nope-nope' }, c3))).status, 401);
  assert.equal((await auth(post('/api/auth', { action: 'delete', password: 'nephron-2026' }, c3))).status, 200);
  assert.equal((await pool.query("SELECT count(*)::int n FROM users WHERE email = 'ama@example.com'")).rows[0].n, 0);
});

test('sync: push, pull, last-write-wins, deletes, isolation between users, login gate', { skip: !URL_ && 'TEST_DATABASE_URL not set' }, async () => {
  const a = cookieOf(await auth(post('/api/auth', { action: 'signup', email: 'a@sm.test', password: 'password-a' })));
  const b = cookieOf(await auth(post('/api/auth', { action: 'signup', email: 'b@sm.test', password: 'password-b' })));
  assert.equal((await sync(post('/api/sync', { cursor: 0, changes: [] }))).status, 401);

  // Device 1 pushes
  let r = await (await sync(post('/api/sync', { cursor: 0, changes: [
    { store: 'chats', id: 'c1', data: { id: 'c1', title: 'Renal' }, updatedAt: 1000 },
    { store: 'flashcards', id: 'f1', data: { id: 'f1', q: 'Why?' }, updatedAt: 1000 },
    { store: 'files', id: 'x', data: {}, updatedAt: 1000 },
  ] }, a))).json();
  assert.equal(r.accepted, 2);
  assert.deepEqual(r.rejected, ['x'], 'raw files are not synced');
  // Device 2 pulls everything
  r = await (await sync(post('/api/sync', { cursor: 0, changes: [] }, a))).json();
  assert.equal(r.changes.length, 2);
  const cursor = r.cursor;
  // Stale write loses, newer write wins, delete propagates
  await sync(post('/api/sync', { cursor, changes: [{ store: 'chats', id: 'c1', data: { title: 'OLD' }, updatedAt: 500 }] }, a));
  await sync(post('/api/sync', { cursor, changes: [{ store: 'chats', id: 'c1', data: { title: 'Renal 2' }, updatedAt: 2000 }, { store: 'flashcards', id: 'f1', deleted: true, updatedAt: 2000 }] }, a));
  r = await (await sync(post('/api/sync', { cursor, changes: [] }, a))).json();
  const byId = Object.fromEntries(r.changes.map((c) => [c.id, c]));
  assert.equal(byId.c1.data.title, 'Renal 2');
  assert.equal(byId.f1.deleted, true);
  // User B sees nothing of A's
  r = await (await sync(post('/api/sync', { cursor: 0, changes: [] }, b))).json();
  assert.equal(r.changes.length, 0);

  // With accounts on, model endpoints require sign-in
  const res = await chat(new Request(HOST + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'LOGIN');
  const ok = await chat(new Request(HOST + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: a }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
  assert.equal(ok.status, 200);
});

test('sync paginates large histories', { skip: !URL_ && 'TEST_DATABASE_URL not set' }, async () => {
  const c = cookieOf(await auth(post('/api/auth', { action: 'signup', email: 'page@sm.test', password: 'password-p' })));
  const changes = Array.from({ length: 900 }, (_, i) => ({ store: 'chunks', id: `k${i}`, data: { text: 'x'.repeat(200) }, updatedAt: 1 + i }));
  assert.equal((await (await sync(post('/api/sync', { cursor: 0, changes }, c))).json()).accepted, 900);
  let cursor = 0;
  let total = 0;
  let pages = 0;
  for (;;) {
    const r = await (await sync(post('/api/sync', { cursor, changes: [] }, c))).json();
    total += r.changes.length;
    cursor = r.cursor;
    pages++;
    if (!r.more) break;
  }
  assert.equal(total, 900);
  assert.ok(pages >= 3);
});
