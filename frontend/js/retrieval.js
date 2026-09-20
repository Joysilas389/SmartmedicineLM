/*
 * Retrieval: hybrid search over the learner's chunks, run in the browser.
 *   - lexical BM25 with light stemming and medical synonym expansion
 *   - semantic vector search (embeddings.js), when enabled and ready
 * fused with Reciprocal Rank Fusion. The interface (search(query, opts) → ranked chunks
 * with provenance) stays the same whichever signals are available.
 */
import { db } from './store.js';
import { vectorSearch } from './embeddings.js';

/** Reciprocal Rank Fusion: merges ranked id lists; items high in several lists win. */
export function rrf(lists, k = 60) {
  const score = new Map();
  for (const list of lists) list.forEach((id, rank) => score.set(id, (score.get(id) || 0) + 1 / (k + rank + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ id, score: s }));
}

const STOP = new Set(
  'a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our please should so tell than that the their them then there these they this to was we were what when where which while who why will with would you your about explain teach give show from zero absolute scratch review minute minutes quick test quiz know nothing understand simple simply like also more most very some any each other such only own same just now'.split(' ')
);

// Small, high-value synonym groups (layperson ↔ clinical ↔ abbreviation).
const SYNONYMS = [
  ['kidney', 'renal', 'nephron', 'nephro'],
  ['heart', 'cardiac', 'cardio', 'myocardial'],
  ['liver', 'hepatic', 'hepato'],
  ['lung', 'pulmonary', 'respiratory'],
  ['brain', 'cerebral', 'neuro'],
  ['blood', 'hematologic', 'haematologic', 'serum', 'plasma'],
  ['potassium', 'k', 'hypokalemia', 'hyperkalemia', 'kalemia'],
  ['sodium', 'na', 'hyponatremia', 'hypernatremia', 'natremia'],
  ['calcium', 'ca', 'hypocalcemia', 'hypercalcemia'],
  ['aki', 'acute kidney injury'],
  ['ckd', 'chronic kidney disease'],
  ['gfr', 'glomerular filtration'],
  ['raas', 'renin', 'angiotensin', 'aldosterone'],
  ['mi', 'myocardial infarction', 'infarct'],
  ['htn', 'hypertension'],
  ['dm', 'diabetes', 'diabetic'],
  ['ecg', 'ekg', 'electrocardiogram'],
  ['pth', 'parathyroid'],
  ['adh', 'vasopressin', 'antidiuretic'],
  ['edema', 'oedema', 'swelling'],
  ['anemia', 'anaemia'],
  ['proteinuria', 'protein urine', 'albuminuria'],
];

function stem(w) {
  if (w.length <= 4) return w;
  return w
    .replace(/(ies)$/, 'y')
    .replace(/(sses)$/, 'ss')
    .replace(/([^s])s$/, '$1')
    .replace(/(ing|edly|ed)$/, '')
    .replace(/(ation|ations)$/, 'ate');
}

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+\- ]+/g, ' ')
    .split(/[\s\-]+/)
    .filter((w) => w && (w.length > 1 || /\d/.test(w)) && !STOP.has(w))
    .map(stem);
}

function expand(tokens) {
  const set = new Set(tokens);
  for (const group of SYNONYMS) {
    const stems = group.flatMap((g) => tokenize(g));
    if (stems.some((s) => set.has(s))) stems.forEach((s) => set.add(s));
  }
  return [...set];
}

/* ---------------- index ---------------- */
let index = null; // { docs: Map(chunkId -> {chunk, tf, len}), df: Map, avgLen, n, key }

export function invalidateIndex() {
  index = null;
}

async function buildIndex() {
  const chunks = await db.all('chunks');
  const docs = new Map();
  const df = new Map();
  let total = 0;
  for (const c of chunks) {
    const toks = tokenize(`${c.section || ''} ${c.text}`);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.set(c.id, { chunk: c, tf, len: toks.length });
    total += toks.length;
  }
  index = { docs, df, n: docs.size, avgLen: total / Math.max(1, docs.size) };
  return index;
}

/**
 * search(query, { docIds, k, pinned: {docId, page} }) → [{ chunk, score }]
 * `docIds` null/undefined = whole library.
 */
export async function search(query, { docIds = null, k = 6, pinned = null, minScore = 1.2 } = {}) {
  const idx = index || (await buildIndex());
  const allowed = docIds && docIds.length ? new Set(docIds) : null;
  const qTokens = expand(tokenize(query));
  const k1 = 1.4;
  const b = 0.72;
  const scored = [];

  for (const { chunk, tf, len } of idx.docs.values()) {
    if (allowed && !allowed.has(chunk.docId)) continue;
    let score = 0;
    let matched = 0;
    for (const q of qTokens) {
      const f = tf.get(q);
      if (!f) continue;
      matched++;
      const n = idx.df.get(q) || 0;
      const idf = Math.log(1 + (idx.n - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / idx.avgLen)));
    }
    // Bonus when the section heading itself matches the question.
    if (chunk.section && matched) {
      const sec = new Set(tokenize(chunk.section));
      if (qTokens.some((q) => sec.has(q))) score *= 1.25;
    }
    if (score >= minScore) scored.push({ chunk, score });
  }

  scored.sort((a, b2) => b2.score - a.score);

  // Semantic signal: fuse the BM25 ranking with the vector ranking.
  let ranked = scored;
  const semantic = await vectorSearch(query, { docIds, k: 40 }).catch(() => null);
  if (semantic?.length) {
    const byId = new Map(scored.map((r) => [r.chunk.id, r]));
    const fused = rrf([scored.slice(0, 40).map((r) => r.chunk.id), semantic.map((r) => r.id)]);
    ranked = fused
      .map(({ id, score }) => (byId.get(id) ? { ...byId.get(id), score } : idx.docs.get(id) ? { chunk: idx.docs.get(id).chunk, score } : null))
      .filter((r) => r && (!allowed || allowed.has(r.chunk.docId)));
  }

  // Diversity: at most 2 chunks per page so one page doesn't crowd out the rest.
  const perPage = new Map();
  const results = [];
  for (const r of ranked) {
    const key = `${r.chunk.docId}:${r.chunk.page}`;
    if ((perPage.get(key) || 0) >= 2) continue;
    perPage.set(key, (perPage.get(key) || 0) + 1);
    results.push(r);
    if (results.length >= k) break;
  }

  // A page the learner explicitly pinned ("Ask about this page") always comes first.
  if (pinned) {
    const pageChunks = [...idx.docs.values()]
      .map((d) => d.chunk)
      .filter((c) => c.docId === pinned.docId && c.page === pinned.page)
      .sort((a, b2) => a.order - b2.order)
      .map((chunk) => ({ chunk, score: Infinity }));
    const ids = new Set(pageChunks.map((p) => p.chunk.id));
    return [...pageChunks, ...results.filter((r) => !ids.has(r.chunk.id))].slice(0, Math.max(k, pageChunks.length + 2));
  }
  return results;
}

export async function pageText(docId, page) {
  const chunks = (await db.byIndex('chunks', 'docId', docId)).filter((c) => c.page === page).sort((a, b) => a.order - b.order);
  return chunks.map((c) => c.text).join('\n\n');
}

/** Full-text search inside one document (viewer search box). */
export async function searchInDocument(docId, term, limit = 40) {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  const chunks = (await db.byIndex('chunks', 'docId', docId)).sort((a, b) => a.page - b.page || a.order - b.order);
  const hits = [];
  for (const c of chunks) {
    const i = c.text.toLowerCase().indexOf(t);
    if (i < 0) continue;
    const start = Math.max(0, i - 60);
    hits.push({ page: c.page, before: c.text.slice(start, i), match: c.text.slice(i, i + t.length), after: c.text.slice(i + t.length, i + t.length + 80) });
    if (hits.length >= limit) break;
  }
  return hits;
}
