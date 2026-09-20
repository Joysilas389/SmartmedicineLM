-- Phase 2: knowledge graph provenance, FSRS spaced repetition, question blocks,
-- spec §27 error taxonomy, and the full spec §28 learner model.
-- Mirrors the browser's IndexedDB v2 stores (questions, blocks, attempts, mastery, graph, reviews).
BEGIN;

-- knowledge graph: seed vs learned concepts, relation provenance
ALTER TABLE concepts      ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed','learned'));
ALTER TABLE concepts      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE; -- NULL = shared seed
ALTER TABLE concept_edges ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'seed';
ALTER TABLE concept_edges ADD COLUMN IF NOT EXISTS target_text text;  -- free-text targets ("Proteinuria over 3.5 g/day")
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'concept_edges' AND column_name = 'id') THEN
    ALTER TABLE concept_edges DROP CONSTRAINT IF EXISTS concept_edges_pkey;
    ALTER TABLE concept_edges ALTER COLUMN target_id DROP NOT NULL;
    ALTER TABLE concept_edges ADD COLUMN id bigserial PRIMARY KEY;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS concept_edges_uniq ON concept_edges (source_id, relation, COALESCE(target_id::text, target_text));

-- FSRS state (spec §38): difficulty, stability, retrievability is derived from them
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS difficulty  real;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS stability   real;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS state       text NOT NULL DEFAULT 'new' CHECK (state IN ('new','learning','review','relearning'));
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS last_review timestamptz;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS successes   int NOT NULL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS failures    int NOT NULL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'lesson'; -- lesson | question | page
ALTER TABLE reviews    DROP CONSTRAINT IF EXISTS reviews_grade_check;
ALTER TABLE reviews    ADD CONSTRAINT reviews_grade_check CHECK (grade BETWEEN 1 AND 4); -- again/hard/good/easy
ALTER TABLE reviews    ADD COLUMN IF NOT EXISTS interval_days real;
ALTER TABLE reviews    ADD COLUMN IF NOT EXISTS stability real;

-- question engine
ALTER TABLE questions ADD COLUMN IF NOT EXISTS user_id     uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS concept     text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS clues       jsonb NOT NULL DEFAULT '[]';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS mechanism   text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS high_yield  text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS prerequisites text[] NOT NULL DEFAULT '{}';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS flashcard   jsonb;
ALTER TABLE questions ALTER COLUMN explanation DROP NOT NULL; -- explanations now live per option

CREATE TABLE IF NOT EXISTS question_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         text NOT NULL,
  source        text NOT NULL CHECK (source IN ('topics','weak','library','bank')),
  mode          text NOT NULL CHECK (mode IN ('tutor','exam')),
  question_ids  uuid[] NOT NULL,
  answers       jsonb NOT NULL DEFAULT '{}',   -- {questionId: {chosen, confidence, marked, eliminated, errorType}}
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  score         real,
  ends_at       timestamptz,                   -- timed exam deadline
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

ALTER TABLE attempts ADD COLUMN IF NOT EXISTS block_id   uuid REFERENCES question_blocks(id) ON DELETE SET NULL;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IN ('sure','unsure','guess'));
ALTER TABLE attempts ALTER COLUMN chosen DROP NOT NULL;
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_error_type_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_error_type_check CHECK (error_type IN
  ('knowledge_gap','mechanism_gap','recognition_failure','misread_clue','differential_confusion','calculation_error','distractor_trap','recall_failure'));

-- learner model (spec §28): nullable scores (NULL = no evidence yet) plus the remaining fields
ALTER TABLE mastery ALTER COLUMN understanding DROP NOT NULL, ALTER COLUMN understanding DROP DEFAULT;
ALTER TABLE mastery ALTER COLUMN recall        DROP NOT NULL, ALTER COLUMN recall        DROP DEFAULT;
ALTER TABLE mastery ALTER COLUMN application   DROP NOT NULL, ALTER COLUMN application   DROP DEFAULT;
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS evidence      jsonb NOT NULL DEFAULT '{"understanding":0,"recall":0,"application":0}';
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS confidence    real;   -- calibration 0..1
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS attempts      int NOT NULL DEFAULT 0;
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS correct       int NOT NULL DEFAULT 0;
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS errors        int NOT NULL DEFAULT 0;
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS error_types   jsonb NOT NULL DEFAULT '{}';
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS last_reviewed timestamptz;
ALTER TABLE mastery ADD COLUMN IF NOT EXISTS next_review   timestamptz;

ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS exam        text NOT NULL DEFAULT 'USMLE Step 1';
ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS target_date date;

COMMIT;
