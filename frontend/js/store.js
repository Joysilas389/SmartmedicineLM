/*
 * Local-first storage (IndexedDB). Phase 1 keeps the learner's chats, documents,
 * extracted chunks and flashcards in the browser so the app runs on Vercel with
 * no database. The PostgreSQL + pgvector schema in /database mirrors these stores
 * for the server-side phase.
 */
const DB_NAME = 'smartmedicinelm';
const VERSION = 1;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('chats', { keyPath: 'id' });
      db.createObjectStore('messages', { keyPath: 'id' }).createIndex('chatId', 'chatId');
      db.createObjectStore('documents', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: 'id' });
      db.createObjectStore('chunks', { keyPath: 'id' }).createIndex('docId', 'docId');
      db.createObjectStore('flashcards', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const r = fn(store);
    tx.oncomplete = () => resolve(r instanceof IDBRequest ? r.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}

export const db = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  byIndex: (store, index, value) => run(store, 'readonly', (s) => s.index(index).getAll(value)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  putMany: (store, values) => run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); }),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  delByIndex: (store, index, value) =>
    run(store, 'readwrite', (s) => {
      const req = s.index(index).openKeyCursor(IDBKeyRange.only(value));
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          s.delete(c.primaryKey);
          c.continue();
        }
      };
    }),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),
  async wipe() {
    for (const s of ['chats', 'messages', 'documents', 'files', 'chunks', 'flashcards']) await db.clear(s);
  },
};

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* optional */ }
}
