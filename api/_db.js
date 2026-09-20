/*
 * Database access for accounts and sync (optional). Enabled when DATABASE_URL is set
 * (Vercel → Storage → Postgres/Neon adds it automatically). Uses Neon's HTTP driver,
 * which works in edge functions. Tables are created on first use, so no manual migration
 * is needed; database/migrations/003_accounts_sync.sql contains the same statements.
 */
import { neon } from '@neondatabase/serverless';

let testDb = null;
let cached = null;
let schemaReady = null;

/** Tests inject a { query(text, params) → rows } adapter backed by a real PostgreSQL. */
export function setTestDb(adapter) {
  testDb = adapter;
  schemaReady = null;
}

export const dbConfigured = () => Boolean(testDb || process.env.DATABASE_URL || process.env.POSTGRES_URL);

export function getDb() {
  if (testDb) return testDb;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!cached) {
    const sql = neon(url);
    cached = { query: (text, params = []) => sql.query(text, params) };
  }
  return cached;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    display_name text,
    exam_target text,
    exam_date date,
    settings jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login timestamptz`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version int NOT NULL DEFAULT 1`,
  `CREATE SEQUENCE IF NOT EXISTS sync_seq`,
  `CREATE TABLE IF NOT EXISTS sync_records (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store text NOT NULL,
    id text NOT NULL,
    data jsonb,
    updated_at bigint NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    seq bigint NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, store, id)
  )`,
  `CREATE INDEX IF NOT EXISTS sync_records_seq_idx ON sync_records (user_id, seq)`,
];

/** Creates the account/sync tables once per server instance. */
export function ensureSchema(db = getDb()) {
  schemaReady ||= (async () => {
    for (const stmt of SCHEMA) await db.query(stmt);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}
