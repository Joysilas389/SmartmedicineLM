/*
 * Local-first storage (IndexedDB). Every device keeps a full copy of the learner's data,
 * so the app works offline and without an account. When accounts are enabled, each write
 * to a synced store is also recorded in an "outbox" in the same transaction, and sync.js
 * pushes those changes to the server (last write wins on the `_u` timestamp).
 */
const DB_NAME = 'smartmedicinelm';
const VERSION = 3;
let dbPromise;

export const STORES = ['chats', 'messages', 'documents', 'files', 'chunks', 'flashcards', 'questions', 'blocks', 'attempts', 'mastery', 'graph', 'reviews', 'vectors', 'boards', 'outbox', 'meta'];
/** Stores mirrored to the server. Raw files and embedding vectors stay on the device. */
export const SYNCED = new Set(['chats', 'messages', 'documents', 'chunks', 'flashcards', 'questions', 'blocks', 'attempts', 'mastery', 'graph', 'reviews', 'boards']);

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const old = e.oldVersion;
      if (old < 1) {
        db.createObjectStore('chats', { keyPath: 'id' });
        db.createObjectStore('messages', { keyPath: 'id' }).createIndex('chatId', 'chatId');
        db.createObjectStore('documents', { keyPath: 'id' });
        db.createObjectStore('files', { keyPath: 'id' });
        db.createObjectStore('chunks', { keyPath: 'id' }).createIndex('docId', 'docId');
        db.createObjectStore('flashcards', { keyPath: 'id' });
      }
      if (old < 2) {
        // Phase 2: question engine, learner model, knowledge graph, review log.
        db.createObjectStore('questions', { keyPath: 'id' });
        db.createObjectStore('blocks', { keyPath: 'id' });
        db.createObjectStore('attempts', { keyPath: 'id' }).createIndex('questionId', 'questionId');
        db.createObjectStore('mastery', { keyPath: 'id' });
        db.createObjectStore('graph', { keyPath: 'id' });
        db.createObjectStore('reviews', { keyPath: 'id' });
      }
      if (old < 3) {
        // Semantic search vectors, whiteboards, sync outbox, small key-value metadata.
        db.createObjectStore('vectors', { keyPath: 'id' }).createIndex('docId', 'docId');
        db.createObjectStore('boards', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'key' });
        db.createObjectStore('meta', { keyPath: 'id' });
      }
    };
    req.onblocked = () => console.warn('Database upgrade waiting for other tabs to close.');
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close(); // let a newer tab upgrade the schema
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Runs fn(stores) in one transaction over one or more stores. */
async function run(names, mode, fn) {
  const db = await open();
  const list = Array.isArray(names) ? names : [names];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(list, mode);
    const stores = list.map((n) => tx.objectStore(n));
    const r = fn(...stores);
    tx.oncomplete = () => resolve(r instanceof IDBRequest ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}

let changeTimer = null;
function changed(store) {
  if (!SYNCED.has(store)) return;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => document.dispatchEvent(new CustomEvent('db:changed')), 50);
}

const outboxEntry = (store, id, deleted, at) => ({ key: `${store}:${id}`, store, id, deleted, at });

/** Writes values, stamping `_u` and queueing them for sync when the store is synced. */
function write(store, values) {
  const at = Date.now();
  const stamped = values.map((v) => ({ ...v, _u: at }));
  if (!SYNCED.has(store)) return run(store, 'readwrite', (s) => stamped.forEach((v) => s.put(v)));
  return run([store, 'outbox'], 'readwrite', (s, o) => {
    for (const v of stamped) {
      s.put(v);
      o.put(outboxEntry(store, v.id, false, at));
    }
  }).then(() => changed(store));
}

function remove(store, ids) {
  const at = Date.now();
  if (!SYNCED.has(store)) return run(store, 'readwrite', (s) => ids.forEach((id) => s.delete(id)));
  return run([store, 'outbox'], 'readwrite', (s, o) => {
    for (const id of ids) {
      s.delete(id);
      o.put(outboxEntry(store, id, true, at));
    }
  }).then(() => changed(store));
}

export const db = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  byIndex: (store, index, value) => run(store, 'readonly', (s) => s.index(index).getAll(value)),
  keysByIndex: (store, index, value) => run(store, 'readonly', (s) => s.index(index).getAllKeys(value)),
  count: (store) => run(store, 'readonly', (s) => s.count()),
  put: (store, value) => write(store, [value]),
  putMany: (store, values) => (values.length ? write(store, values) : Promise.resolve()),
  del: (store, key) => remove(store, [key]),
  async delByIndex(store, index, value) {
    const keys = await db.keysByIndex(store, index, value);
    if (keys.length) await remove(store, keys);
  },
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  async wipe() {
    for (const s of STORES) await db.clear(s);
  },

  /* ---- used by sync.js only: apply server data without re-queueing it ---- */
  async applyRemote(store, changes) {
    return run(store, 'readwrite', (s) => {
      for (const c of changes) {
        if (c.deleted) {
          s.delete(c.id);
          continue;
        }
        const req = s.get(c.id);
        req.onsuccess = () => {
          const local = req.result;
          if (!local || (local._u || 0) < c.updatedAt) s.put({ ...c.data, id: c.id, _u: c.updatedAt });
        };
      }
    });
  },
  /** Writes records exactly as given (restoring an Excel workbook), keeping their timestamps. */
  async restore(store, records) {
    const at = Date.now();
    const list = records.map((r) => ({ ...r, _u: r._u || at }));
    const names = SYNCED.has(store) ? [store, 'outbox'] : [store];
    await run(names, 'readwrite', (s, o) => {
      for (const r of list) {
        s.put(r);
        if (o) o.put(outboxEntry(store, r.id, false, r._u));
      }
    });
    changed(store);
  },

  /** Removes outbox entries whose timestamp still matches what was pushed. */
  async ackOutbox(entries) {
    return run('outbox', 'readwrite', (o) => {
      for (const e of entries) {
        const req = o.get(e.key);
        req.onsuccess = () => {
          if (req.result && req.result.at === e.at) o.delete(e.key);
        };
      }
    });
  },
  /** Queues every record of every synced store (first sign-in on a device with data). */
  async queueAll() {
    const at = Date.now();
    for (const store of SYNCED) {
      const keys = await run(store, 'readonly', (s) => s.getAllKeys());
      if (keys.length) await run('outbox', 'readwrite', (o) => keys.forEach((id) => o.put(outboxEntry(store, id, false, at))));
    }
    changed('chats');
  },
  async hasUserData() {
    for (const s of ['chats', 'documents', 'flashcards', 'questions', 'mastery']) if ((await db.count(s)) > 0) return true;
    return false;
  },
};

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* optional */ }
}
