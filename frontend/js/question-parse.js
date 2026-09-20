/*
 * Turns the model's question JSON into validated question records.
 * Tolerates code fences, leading text and truncated output (keeps every complete question),
 * rejects malformed items, and shuffles options so the answer position is unbiased.
 */
const TRAPS = new Set(['differential_confusion', 'distractor_trap', 'mechanism_gap', 'knowledge_gap', 'recognition_failure', 'misread_clue', 'calculation_error']);
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Extracts every complete top-level object inside the "questions" array, even if the JSON is cut off. */
export function extractQuestionObjects(raw = '') {
  const text = String(raw).replace(/```(?:json)?/gi, '');
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const obj = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(obj?.questions)) return obj.questions;
      if (Array.isArray(obj)) return obj;
    }
  } catch {
    /* fall through to the tolerant scan */
  }
  const arr = text.indexOf('[', Math.max(0, text.indexOf('"questions"')));
  if (arr < 0) return [];
  const out = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;
  for (let i = arr + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          /* skip a malformed item */
        }
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return out;
}

const str = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Validates one raw item. Returns a normalised question or null. */
export function normalizeQuestion(q, { rand = Math.random, uid = () => Math.random().toString(36).slice(2), validTags = null } = {}) {
  if (!q || typeof q !== 'object') return null;
  const stem = str(q.stem, 3000);
  const options = (Array.isArray(q.options) ? q.options : [])
    .map((o) => ({
      text: str(o?.text, 400),
      correct: o?.correct === true,
      explanation: str(o?.explanation, 1500),
      wouldBeRightIf: str(o?.would_be_right_if ?? o?.wouldBeRightIf, 400),
      trap: TRAPS.has(o?.trap) ? o.trap : null,
    }))
    .filter((o) => o.text);
  if (stem.length < 40 || options.length < 4 || options.length > 6) return null;
  if (options.filter((o) => o.correct).length !== 1) return null;
  const texts = new Set(options.map((o) => o.text.toLowerCase()));
  if (texts.size !== options.length) return null;
  if (/\b(all|none) of the above\b/i.test(options.map((o) => o.text).join(' '))) return null;

  const shuffled = shuffle(options, rand).map((o, i) => ({ ...o, id: LETTERS[i] }));
  const fc = q.flashcard && typeof q.flashcard === 'object' ? { q: str(q.flashcard.q, 300), a: str(q.flashcard.a, 600) } : null;
  return {
    id: `q_${uid()}`,
    concept: str(q.concept, 80) || 'General',
    system: str(q.system, 60),
    difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
    stem,
    options: shuffled,
    answer: shuffled.find((o) => o.correct).id,
    clues: (Array.isArray(q.clues) ? q.clues : []).map((c) => str(c, 240)).filter(Boolean).slice(0, 6),
    mechanism: str(q.mechanism, 800),
    highYield: str(q.high_yield ?? q.highYield, 400),
    prerequisites: (Array.isArray(q.prerequisites) ? q.prerequisites : []).map((p) => str(p, 80)).filter(Boolean).slice(0, 5),
    flashcard: fc?.q && fc?.a ? fc : null,
    sources: (Array.isArray(q.sources) ? q.sources : []).filter((t) => typeof t === 'string' && /^S\d{1,2}$/.test(t) && (!validTags || validTags.has(t))),
    createdAt: Date.now(),
  };
}

export function parseQuestions(raw, opts = {}) {
  return extractQuestionObjects(raw)
    .map((q) => normalizeQuestion(q, opts))
    .filter(Boolean);
}

/** Rough progress while streaming: how many question stems have started. */
export const countStems = (partial = '') => (String(partial).match(/"stem"\s*:/g) || []).length;
