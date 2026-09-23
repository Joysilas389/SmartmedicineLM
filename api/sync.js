/*
 * POST /api/sync  { cursor, changes: [{ store, id, data, updatedAt, deleted }] }
 *   → { cursor, changes: [...], more, accepted }
 * Local-first sync: every device keeps its full IndexedDB copy; this endpoint stores the
 * latest version of each record per user (last write wins on updatedAt) and returns what
 * changed since the device's cursor.
 */
import { json } from './_http.js';
import { getDb, ensureSchema } from './_db.js';
import { authEnabled, currentUser, sameOrigin } from './_auth.js';

export const config = { runtime: 'edge' };

export const SYNC_STORES = ['chats', 'messages', 'documents', 'chunks', 'flashcards', 'questions', 'blocks', 'attempts', 'mastery', 'graph', 'reviews', 'boards', 'highlights', 'settings'];
const MAX_CHANGES = 1000;
const MAX_RECORD_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 3_000_000;
const PAGE = 400;

export default async function handler(req) {
  if (!authEnabled()) return json({ error: 'Sync needs a database. See docs/DEPLOY.md.' }, 404);
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!sameOrigin(req)) return json({ error: 'Cross-site request refused.' }, 403);
  const user = await currentUser(req).catch(() => null);
  if (!user) return json({ error: 'Please sign in.', code: 'LOGIN' }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  const db = getDb();
  await ensureSchema(db);

  const incoming = Array.isArray(body?.changes) ? body.changes : [];
  if (incoming.length > MAX_CHANGES) return json({ error: `Send at most ${MAX_CHANGES} changes per request.` }, 413);
  const rows = [];
  const rejected = [];
  for (const c of incoming) {
    const ok =
      c && SYNC_STORES.includes(c.store) && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 200 && Number.isFinite(c.updatedAt) && c.updatedAt > 0;
    const size = ok && !c.deleted ? JSON.stringify(c.data ?? null).length : 0;
    if (!ok || size > MAX_RECORD_BYTES) {
      rejected.push(c?.id ?? null);
      continue;
    }
    rows.push({ store: c.store, id: c.id, data: c.deleted ? null : c.data, updated_at: Math.round(c.updatedAt), deleted: Boolean(c.deleted) });
  }
  if (rows.length) {
    await db.query(
      `INSERT INTO sync_records (user_id, store, id, data, updated_at, deleted, seq)
       SELECT $1, r.store, r.id, r.data, r.updated_at, r.deleted, nextval('sync_seq')
       FROM jsonb_to_recordset($2::jsonb) AS r(store text, id text, data jsonb, updated_at bigint, deleted boolean)
       ON CONFLICT (user_id, store, id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, seq = EXCLUDED.seq
         WHERE sync_records.updated_at < EXCLUDED.updated_at`,
      [user.id, JSON.stringify(rows)]
    );
  }

  const cursor = Math.max(0, Number(body?.cursor) || 0);
  const out = await db.query(
    'SELECT store, id, data, updated_at, deleted, seq FROM sync_records WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
    [user.id, cursor, PAGE]
  );
  const changes = [];
  let bytes = 0;
  let last = cursor;
  for (const r of out) {
    const item = { store: r.store, id: r.id, data: r.data, updatedAt: Number(r.updated_at), deleted: r.deleted };
    const size = JSON.stringify(item).length;
    if (changes.length && bytes + size > MAX_RESPONSE_BYTES) break;
    bytes += size;
    changes.push(item);
    last = Number(r.seq);
  }
  const more = changes.length < out.length || out.length === PAGE;
  return json({ cursor: last, changes, more, accepted: rows.length, rejected });
}
