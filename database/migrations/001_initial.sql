-- Migration 001: initial schema (identical to database/schema.sql at v0.1.0).
-- SmartMedicineLM database schema (PostgreSQL 15+ with pgvector).
-- Phase 1 stores everything in the browser (IndexedDB). This schema mirrors those
-- stores and adds the server-side tables planned for Phase 2+ (spec §57–61).
-- Apply with:  psql "$DATABASE_URL" -f database/schema.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------------ users
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  display_name  text,
  exam_target   text,                         -- e.g. 'USMLE Step 1'
  exam_date     date,
  settings      jsonb NOT NULL DEFAULT '{}',  -- teaching policy toggles, theme, depth…
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ documents
CREATE TABLE IF NOT EXISTS documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('pdf','image','text','docx')),
  size_bytes    bigint NOT NULL,
  page_count    int,
  storage_key   text,                         -- object storage path
  sha256        text,
  source_type   text NOT NULL DEFAULT 'user-owned'
                CHECK (source_type IN ('user-owned','licensed','public-domain','open-access','restricted')),
  status        text NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing','ready','needs-ocr','error')),
  error         text,
  topics        text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS document_pages (
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page          int NOT NULL,
  text          text,
  has_text      boolean NOT NULL DEFAULT true,
  ocr_confidence real,
  PRIMARY KEY (document_id, page)
);

-- ------------------------------------------------------------------ chunks + embeddings
-- Semantic chunks (heading-aware), never fixed N-character splits.
CREATE TABLE IF NOT EXISTS chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_start    int,
  page_end      int,
  heading_path  text[] NOT NULL DEFAULT '{}',
  content       text NOT NULL,
  token_count   int,
  embedding     vector(1536),                 -- adjust to the embedding model's dimension
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks(document_id, page_start);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin(tsv);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);

-- ------------------------------------------------------------------ knowledge graph
CREATE TABLE IF NOT EXISTS concepts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  normalized    text NOT NULL UNIQUE,
  system        text,                         -- cardiovascular, renal…
  kind          text,                         -- disease, mechanism, drug, finding, test…
  synonyms      text[] NOT NULL DEFAULT '{}',
  embedding     vector(1536)
);
CREATE INDEX IF NOT EXISTS concepts_trgm_idx ON concepts USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS concept_edges (
  source_id     uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_id     uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relation      text NOT NULL,                -- causes, inhibits, presents_with, treated_by, prerequisite_of…
  weight        real NOT NULL DEFAULT 1,
  evidence_chunk uuid REFERENCES chunks(id) ON DELETE SET NULL,
  PRIMARY KEY (source_id, target_id, relation)
);

CREATE TABLE IF NOT EXISTS chunk_concepts (
  chunk_id      uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  concept_id    uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (chunk_id, concept_id)
);

-- ------------------------------------------------------------------ conversations
CREATE TABLE IF NOT EXISTS chats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT 'New chat',
  favorite      boolean NOT NULL DEFAULT false,
  archived      boolean NOT NULL DEFAULT false,
  doc_scope     uuid[],                       -- NULL = whole library
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chats_user_idx ON chats(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user','assistant')),
  content       text NOT NULL,
  mode          text,                         -- learn / review / recall / concise…
  depth         text,
  model         text,
  sources       jsonb NOT NULL DEFAULT '[]',  -- [{tag, chunkId, docId, page}]
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages(chat_id, created_at);

-- ------------------------------------------------------------------ flashcards + spaced repetition
CREATE TABLE IF NOT EXISTS flashcards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id       uuid REFERENCES chats(id) ON DELETE SET NULL,
  concept_id    uuid REFERENCES concepts(id) ON DELETE SET NULL,
  topic         text,
  front         text NOT NULL,
  back          text NOT NULL,
  ease          real NOT NULL DEFAULT 2.5,
  interval_days real NOT NULL DEFAULT 0,
  reps          int  NOT NULL DEFAULT 0,
  lapses        int  NOT NULL DEFAULT 0,
  due           timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flashcards_due_idx ON flashcards(user_id, due);

CREATE TABLE IF NOT EXISTS reviews (
  id            bigserial PRIMARY KEY,
  flashcard_id  uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  grade         smallint NOT NULL CHECK (grade BETWEEN 0 AND 5),
  elapsed_ms    int,
  reviewed_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ question bank (Phase 2)
CREATE TABLE IF NOT EXISTS questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stem          text NOT NULL,
  options       jsonb NOT NULL,               -- [{key:'A', text, why_wrong, would_be_right_if}]
  answer        text NOT NULL,
  explanation   text NOT NULL,
  system        text,
  discipline    text,
  difficulty    smallint,
  concept_ids   uuid[] NOT NULL DEFAULT '{}',
  source_chunks uuid[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attempts (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  chosen        text NOT NULL,
  correct       boolean NOT NULL,
  error_type    text CHECK (error_type IN
                ('knowledge_gap','mechanism_gap','misread_clue','distractor_trap','premature_closure','calculation','time_pressure')),
  seconds       int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ learner model
CREATE TABLE IF NOT EXISTS mastery (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id    uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  understanding real NOT NULL DEFAULT 0,      -- 0..1
  recall        real NOT NULL DEFAULT 0,
  application   real NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, concept_id)
);

CREATE TABLE IF NOT EXISTS study_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_date     date NOT NULL,
  hours_per_day real NOT NULL,
  plan          jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ audit (security §63)
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Hybrid retrieval helper: vector similarity blended with full-text rank.
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536), query_text text, p_user uuid,
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
