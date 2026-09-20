-- Migration 003: accounts, cross-device sync, semantic search dimensions.
-- The app runs these same statements automatically on first use (api/_db.js), so running
-- this file by hand is optional.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;          -- pbkdf2$iterations$salt$hash
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version int NOT NULL DEFAULT 1; -- bump = sign out everywhere

-- Local-first sync: the latest version of every record per user, last write wins.
CREATE SEQUENCE IF NOT EXISTS sync_seq;
CREATE TABLE IF NOT EXISTS sync_records (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store      text NOT NULL,
  id         text NOT NULL,
  data       jsonb,
  updated_at bigint NOT NULL,
  deleted    boolean NOT NULL DEFAULT false,
  seq        bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (user_id, store, id)
);
CREATE INDEX IF NOT EXISTS sync_records_seq_idx ON sync_records (user_id, seq);

-- Semantic search uses all-MiniLM-L6-v2 (384 dimensions) in the browser; match the server column.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chunks', 'concepts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = t::regclass AND attname = 'embedding'
                   AND format_type(atttypid, atttypmod) = 'vector(384)') THEN
      EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS embedding', t);  -- old 1536-d vectors cannot be converted
      EXECUTE format('ALTER TABLE %I ADD COLUMN embedding vector(384)', t);
    END IF;
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS match_chunks(vector, text, uuid, uuid[], int);
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(384), query_text text, p_user uuid,
  p_docs uuid[] DEFAULT NULL, p_k int DEFAULT 8)
RETURNS TABLE (chunk_id uuid, document_id uuid, page_start int, content text, score real)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.document_id, c.page_start, c.content,
         (0.7 * (1 - (c.embedding <=> query_embedding))
          + 0.3 * ts_rank(c.tsv, plainto_tsquery('english', query_text)))::real AS score
  FROM chunks c JOIN documents d ON d.id = c.document_id
  WHERE d.user_id = p_user AND d.status = 'ready'
    AND (p_docs IS NULL OR c.document_id = ANY(p_docs))
  ORDER BY score DESC
  LIMIT p_k;
$$;
COMMIT;
