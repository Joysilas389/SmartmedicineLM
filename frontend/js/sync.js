/*
 * Cross-device sync for signed-in users. Local-first: IndexedDB stays the source the UI
 * reads; this module pushes the outbox and pulls other devices' changes with a cursor.
 */
import { db } from './store.js';
import { state, saveSettings } from './state.js';

const LOCAL_ONLY_SETTINGS = ['accessCode', 'sidebarCollapsed'];
const BATCH_BYTES = 2_500_000;
const BATCH_ITEMS = 800;

export const sync = { status: 'idle', lastSync: null, error: null, pending: 0 };
let running = null;
let applyingRemote = false;
let timer = null;

const emit = () => document.dispatchEvent(new CustomEvent('sync:status'));
const meta = async (id, fallback = null) => (await db.get('meta', id))?.value ?? fallback;
const setMeta = (id, value) => db.put('meta', { id, value });

function syncableSettings() {
  const s = { ...state.settings };
  for (const k of LOCAL_ONLY_SETTINGS) delete s[k];
  return s;
}

/** Strips fields that are device-specific or too heavy to sync. */
function forSync(store, rec) {
  const { _u, ...data } = rec;
  if (store === 'messages' && data.imageData) delete data.imageData; // full-size images stay local
  return data;
}

async function buildBatch(entries) {
  const changes = [];
  const sent = [];
  let bytes = 0;
  for (const e of entries) {
    let change;
    if (e.store === 'settings') change = { store: 'settings', id: 'settings', data: syncableSettings(), updatedAt: e.at };
    else if (e.deleted) change = { store: e.store, id: e.id, deleted: true, updatedAt: e.at };
    else {
      const rec = await db.get(e.store, e.id);
      change = rec ? { store: e.store, id: e.id, data: forSync(e.store, rec), updatedAt: rec._u || e.at } : { store: e.store, id: e.id, deleted: true, updatedAt: e.at };
    }
    const size = JSON.stringify(change).length;
    if (size > 950_000) {
      sent.push(e); // too large to sync (e.g. a huge board background); acknowledge and skip
      continue;
    }
    if (changes.length && (bytes + size > BATCH_BYTES || changes.length >= BATCH_ITEMS)) break;
    changes.push(change);
    sent.push(e);
    bytes += size;
  }
  return { changes, sent };
}

async function applyChanges(changes) {
  const byStore = new Map();
  for (const c of changes) {
    if (c.store === 'settings') {
      const localAt = await meta('settingsAt', 0);
      if (!c.deleted && c.updatedAt > localAt && c.data) {
        applyingRemote = true;
        try {
          const keep = Object.fromEntries(LOCAL_ONLY_SETTINGS.map((k) => [k, state.settings[k]]));
          saveSettings({ ...c.data, ...keep });
        } finally {
          applyingRemote = false;
        }
        await setMeta('settingsAt', c.updatedAt);
      }
      continue;
    }
    if (!byStore.has(c.store)) byStore.set(c.store, []);
    byStore.get(c.store).push(c);
  }
  for (const [store, list] of byStore) await db.applyRemote(store, list);
  return changes.length;
}

/** One full sync round: push everything queued, pull everything new. */
export function syncNow() {
  if (!state.account?.user) return Promise.resolve(false);
  if (running) return running;
  running = (async () => {
    sync.status = 'syncing';
    emit();
    let applied = 0;
    try {
      let cursor = await meta('cursor', 0);
      for (let round = 0; round < 200; round++) {
        const outbox = (await db.all('outbox')).sort((a, b) => a.at - b.at);
        const { changes, sent } = await buildBatch(outbox);
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cursor, changes }),
        });
        if (res.status === 401) {
          state.account.user = null;
          document.dispatchEvent(new CustomEvent('account:signedout'));
          throw new Error('Signed out');
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Sync failed (${res.status})`);
        const r = await res.json();
        applied += await applyChanges(r.changes || []);
        await db.ackOutbox(sent);
        cursor = r.cursor ?? cursor;
        await setMeta('cursor', cursor);
        if (!r.more && sent.length >= outbox.length) break;
      }
      sync.status = 'ok';
      sync.error = null;
      sync.lastSync = Date.now();
    } catch (err) {
      sync.status = navigator.onLine === false ? 'offline' : 'error';
      sync.error = err.message;
    } finally {
      sync.pending = await db.count('outbox');
      running = null;
      emit();
      if (applied) document.dispatchEvent(new CustomEvent('sync:applied'));
    }
    return sync.status === 'ok';
  })();
  return running;
}

/** Starts automatic sync: on changes (debounced), every minute, and when coming back online. */
export function startAutoSync() {
  if (timer) return;
  const soon = () => {
    clearTimeout(soon.t);
    soon.t = setTimeout(syncNow, 4000);
  };
  document.addEventListener('db:changed', soon);
  document.addEventListener('settings:changed', async () => {
    if (applyingRemote || !state.account?.user) return;
    const at = Date.now();
    await setMeta('settingsAt', at);
    await db.put('outbox', { key: 'settings:settings', store: 'settings', id: 'settings', deleted: false, at });
    soon();
  });
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  timer = setInterval(() => document.visibilityState === 'visible' && syncNow(), 60000);
  syncNow();
}

/**
 * Called after sign-in. Makes sure this device's data belongs to this account:
 *   - data from another account is removed from the device first;
 *   - data created before signing in is added to the account if the learner agrees.
 */
export async function adoptDevice(user, askToMerge) {
  const owner = await meta('owner');
  if (owner === user.id) return;
  const hasData = await db.hasUserData();
  if (owner && owner !== user.id) {
    await db.wipe();
  } else if (hasData) {
    if (await askToMerge()) await db.queueAll();
    else await db.wipe();
  } else {
    await db.clear('outbox');
  }
  await setMeta('owner', user.id);
  await setMeta('cursor', 0);
  await setMeta('settingsAt', 0);
}

export async function forgetDevice() {
  await db.wipe();
}
