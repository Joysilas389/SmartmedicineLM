/*
 * Semantic (vector) search, spec §71 "vector search": sentence embeddings computed in the
 * browser (embed-worker.js) and stored per chunk in IndexedDB, searched by cosine
 * similarity and fused with BM25 in retrieval.js. No API key or server needed; the
 * PostgreSQL schema has a matching vector(384) column for a future server index.
 */
import { db } from './store.js';
import { state } from './state.js';

export const EMBED_CONFIG = {
  libUrl: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js',
  model: 'Xenova/all-MiniLM-L6-v2',
  dim: 384,
  ...(globalThis.SM_EMBED_CONFIG || {}), // lets a self-hosted copy of the model be used
};

const BATCH = 16;
const status = { state: 'off', indexed: 0, total: 0, progress: 0, error: '' };
let worker = null;
let seq = 0;
const pending = new Map();
let cache = null; // Map chunkId -> { docId, v }
let indexing = null;

export const enabled = () => state.settings.semanticSearch !== false && typeof Worker !== 'undefined';

function emit() {
  document.dispatchEvent(new CustomEvent('semantic:status'));
  const el = document.getElementById('semStatus');
  if (el) el.textContent = semanticStatus();
}

export function semanticStatus() {
  if (!enabled()) return 'Off: search matches words only.';
  if (status.state === 'error') return `Unavailable (${status.error}). Word search still works.`;
  if (status.state === 'loading') return `Downloading the language model… ${Math.round(status.progress)}%`;
  if (status.total && status.indexed < status.total) return `Indexing your library by meaning: ${status.indexed} of ${status.total} passages.`;
  if (status.state === 'ready') return `On: ${status.total} passage${status.total === 1 ? '' : 's'} indexed by meaning.`;
  return 'On: the model loads the first time you add a document or search.';
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./embed-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      status.state = 'loading';
      if (/onnx/.test(m.file || '')) status.progress = m.progress || 0;
      return emit();
    }
    if (m.type === 'ready') {
      status.state = 'ready';
      return emit();
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.vecs);
  };
  worker.onerror = (e) => {
    status.state = 'error';
    status.error = e.message || 'worker failed';
    for (const p of pending.values()) p.reject(new Error(status.error));
    pending.clear();
    worker = null;
    emit();
  };
  return worker;
}

/** Embeds texts → Float32Array[] (unit length). */
export function embed(texts) {
  if (status.state === 'off') {
    status.state = 'loading';
    emit();
  }
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type: 'embed', texts, config: EMBED_CONFIG });
  }).then(
    (v) => {
      if (status.state !== 'ready') {
        status.state = 'ready';
        emit();
      }
      return v;
    },
    (err) => {
      status.state = 'error';
      status.error = err.message.slice(0, 120);
      emit();
      throw err;
    }
  );
}

export const passageText = (c) => `${c.section ? c.section + '. ' : ''}${c.text}`.slice(0, 1200);

/** Embeds every chunk that has no vector yet, in the background. */
export function scheduleIndexing() {
  if (!enabled() || indexing) return indexing;
  indexing = (async () => {
    try {
      const [chunkKeys, vecKeys] = await Promise.all([db.all('chunks').then((c) => c.map((x) => x.id)), db.all('vectors').then((v) => v.map((x) => x.id))]);
      const have = new Set(vecKeys);
      const missing = chunkKeys.filter((id) => !have.has(id));
      status.total = chunkKeys.length;
      status.indexed = chunkKeys.length - missing.length;
      emit();
      for (let i = 0; i < missing.length && enabled(); i += BATCH) {
        const chunks = (await Promise.all(missing.slice(i, i + BATCH).map((id) => db.get('chunks', id)))).filter(Boolean);
        if (!chunks.length) continue;
        const vecs = await embed(chunks.map(passageText));
        const rows = chunks.map((c, j) => ({ id: c.id, docId: c.docId, v: vecs[j] }));
        await db.putMany('vectors', rows);
        if (cache) for (const r of rows) cache.set(r.id, r);
        status.indexed += chunks.length;
        emit();
        await new Promise((r) => setTimeout(r, 0));
      }
    } catch (err) {
      console.warn('Semantic indexing stopped:', err.message);
    } finally {
      indexing = null;
    }
  })();
  return indexing;
}

export async function removeDocumentVectors(docId) {
  await db.delByIndex('vectors', 'docId', docId);
  if (cache) for (const [id, r] of cache) if (r.docId === docId) cache.delete(id);
}

export function invalidateVectors() {
  cache = null;
}

async function vectors() {
  if (!cache) cache = new Map((await db.all('vectors')).map((r) => [r.id, r]));
  return cache;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Nearest passages by meaning: [{ id, score }] best first, or null when semantic search
 * is off or the model is not ready within `waitMs` (callers then use BM25 alone).
 */
export async function vectorSearch(query, { docIds = null, k = 40, minScore = 0.3, waitMs = 4000 } = {}) {
  if (!enabled()) return null;
  const all = await vectors();
  if (!all.size) return null;
  let qv;
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('model not ready')), status.state === 'ready' ? 15000 : waitMs));
    [qv] = await Promise.race([embed([query.slice(0, 1000)]), timeout]);
  } catch {
    return null;
  }
  const allowed = docIds?.length ? new Set(docIds) : null;
  const scored = [];
  for (const [id, r] of all) {
    if (allowed && !allowed.has(r.docId)) continue;
    const s = dot(qv, r.v);
    if (s >= minScore) scored.push({ id, score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

if (typeof document !== 'undefined')
  document.addEventListener('semantic:toggle', () => {
    if (enabled()) scheduleIndexing();
    emit();
  });
