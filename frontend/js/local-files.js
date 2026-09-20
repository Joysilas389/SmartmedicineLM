/*
 * Your data as a real file on your device (spec: local-first, no subscription).
 * The browser's IndexedDB is only a fast working copy; the Excel workbook is the record that
 * survives clearing browser data. Three ways to keep it:
 *   - download / restore a backup by hand (works everywhere, including the hosted site)
 *   - automatic saving into a folder you choose (Chrome/Edge on a computer)
 *   - automatic saving to phone storage when the app runs locally from Termux
 */
import { db, STORES } from './store.js';
import { state, saveSettings } from './state.js';
import { buildWorkbook, parseWorkbook, STORES_IN_WORKBOOK } from './workbook-core.js';

const XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const WORKBOOK_NAME = 'SmartMedicineLM.xlsx';
const AUTOSAVE_DELAY = 15000;

export const localFiles = { kind: 'none', label: '', lastSaved: null, saving: false, error: '', dirty: 0, folderName: '' };
let target = null; // { kind: 'folder', dir } | { kind: 'local' }
let saveTimer = null;
let savingPromise = null;

const emit = () => document.dispatchEvent(new CustomEvent('localfiles:status'));
const meta = async (id, fallback = null) => (await db.get('meta', id))?.value ?? fallback;
const setMeta = (id, value) => db.put('meta', { id, value });

/* ------------------------------ library ------------------------------ */
let xlsxPromise = null;
function loadXLSX() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  xlsxPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = globalThis.SM_XLSX_URL || (state.localStore ? '/vendor/xlsx.full.min.js' : XLSX_CDN);
    s.onload = () => resolve(globalThis.XLSX);
    s.onerror = () => {
      xlsxPromise = null;
      reject(new Error('Could not load the Excel library (are you offline?).'));
    };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

/* ------------------------------ export ------------------------------ */
const toBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function collect({ includeFiles }) {
  const stores = {};
  for (const s of STORES_IN_WORKBOOK) stores[s] = await db.all(s);
  const files = [];
  if (includeFiles)
    for (const f of await db.all('files')) {
      if (!f.blob) continue;
      files.push({ id: f.id, name: f.name || f.id, type: f.blob.type || 'application/octet-stream', base64: toBase64(await f.blob.arrayBuffer()) });
    }
  return { stores, files, settings: state.settings, exportedAt: Date.now(), app: '0.4.0' };
}

/** The workbook as a Blob. */
export async function exportWorkbook({ includeFiles = true } = {}) {
  const XLSX = await loadXLSX();
  const wb = buildWorkbook(XLSX, await collect({ includeFiles }));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function downloadBackup({ includeFiles = true } = {}) {
  const blob = await exportWorkbook({ includeFiles });
  const name = `SmartMedicineLM-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  await markSaved();
  return name;
}

/* ------------------------------ import ------------------------------ */
/** Restores a workbook. mode 'merge' keeps whatever is newer; 'replace' wipes first. */
export async function importWorkbook(source, { mode = 'merge' } = {}) {
  const XLSX = await loadXLSX();
  const buf = source instanceof Blob ? await source.arrayBuffer() : source;
  const parsed = parseWorkbook(XLSX, XLSX.read(buf, { type: 'array' }));
  const summary = { ...parsed.stats, restored: 0, files: 0, mode };

  if (mode === 'replace') for (const s of [...STORES_IN_WORKBOOK, 'files', 'vectors']) await db.clear(s);

  for (const [store, records] of Object.entries(parsed.stores)) {
    if (!records.length) continue;
    const keep = [];
    for (const r of records) {
      if (mode === 'merge') {
        const local = await db.get(store, r.id);
        if (local && (local._u || 0) >= (r._u || 0)) continue;
      }
      keep.push(r);
    }
    if (keep.length) await db.restore(store, keep);
    summary.restored += keep.length;
  }

  for (const f of parsed.files) {
    if (mode === 'merge' && (await db.get('files', f.id))) continue;
    await db.put('files', { id: f.id, name: f.name, blob: new Blob([fromBase64(f.base64)], { type: f.type }) });
    summary.files++;
  }
  if (Object.keys(parsed.settings).length) saveSettings({ ...parsed.settings, accessCode: state.settings.accessCode });
  await markSaved();
  return summary;
}

/* ------------------------------ save targets ------------------------------ */
export const canPickFolder = () => typeof globalThis.showDirectoryPicker === 'function';

export async function chooseFolder() {
  const dir = await globalThis.showDirectoryPicker({ id: 'smartmedicinelm', mode: 'readwrite', startIn: 'documents' });
  await setMeta('folderHandle', dir);
  target = { kind: 'folder', dir };
  localFiles.kind = 'folder';
  localFiles.folderName = dir.name;
  emit();
  const existing = await readFolderWorkbook(dir);
  if (existing && !(await db.hasUserData())) {
    await importWorkbook(existing, { mode: 'merge' });
    await restoreOriginals();
  }
  await saveNow();
  return dir.name;
}

export async function stopFolder() {
  await db.del('meta', 'folderHandle');
  target = null;
  localFiles.kind = 'none';
  localFiles.folderName = '';
  emit();
}

async function readFolderWorkbook(dir) {
  try {
    return await (await dir.getFileHandle(WORKBOOK_NAME)).getFile();
  } catch {
    return null;
  }
}

async function writeFolder(dir, blob) {
  // Keep the previous copy, so a bad save can never lose everything.
  const prev = await readFolderWorkbook(dir);
  if (prev && prev.size > 0) {
    const bh = await dir.getFileHandle('SmartMedicineLM-previous.xlsx', { create: true });
    const bw = await bh.createWritable();
    await bw.write(await prev.arrayBuffer());
    await bw.close();
  }
  const fh = await dir.getFileHandle(WORKBOOK_NAME, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
  await saveFilesToFolder(dir);
}

/** Copies original PDFs/images into a `files` subfolder, once each. */
async function saveFilesToFolder(dir) {
  const saved = new Set(await meta('savedFiles', []));
  const files = await db.all('files');
  if (!files.length) return;
  const sub = await dir.getDirectoryHandle('files', { create: true });
  for (const f of files) {
    if (saved.has(f.id) || !f.blob) continue;
    const fh = await sub.getFileHandle(safeName(f), { create: true });
    const w = await fh.createWritable();
    await w.write(f.blob);
    await w.close();
    saved.add(f.id);
  }
  await setMeta('savedFiles', [...saved]);
}

const safeName = (f) => `${f.id}__${(f.name || f.id).replace(/[^\w.\- ]+/g, '_').slice(0, 80)}`;

async function writeLocalServer(blob) {
  const res = await fetch('/api/local-store', { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: blob });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Could not save (${res.status}).`);
  const saved = new Set(await meta('savedFiles', []));
  for (const f of await db.all('files')) {
    if (saved.has(f.id) || !f.blob) continue;
    await fetch(`/api/local-store?file=${encodeURIComponent(f.id)}&name=${encodeURIComponent(f.name || f.id)}`, { method: 'PUT', headers: { 'content-type': f.blob.type || 'application/octet-stream' }, body: f.blob });
    saved.add(f.id);
  }
  await setMeta('savedFiles', [...saved]);
}

async function readLocalServer() {
  const res = await fetch('/api/local-store');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read the saved file (${res.status}).`);
  return res.blob();
}

/** Brings original PDFs/images back into the browser from the folder or local storage. */
async function restoreOriginals() {
  if (!target) return 0;
  let n = 0;
  const saved = new Set(await meta('savedFiles', []));
  if (target.kind === 'local') {
    const list = await fetch('/api/local-store?list=files').then((r) => (r.ok ? r.json() : []));
    for (const f of list) {
      if (await db.get('files', f.id)) continue;
      const blob = await fetch(`/api/local-store?file=${encodeURIComponent(f.id)}`).then((r) => (r.ok ? r.blob() : null));
      if (!blob) continue;
      await db.put('files', { id: f.id, name: f.name, blob });
      saved.add(f.id);
      n++;
    }
  } else {
    let sub;
    try {
      sub = await target.dir.getDirectoryHandle('files');
    } catch {
      return 0;
    }
    for await (const [name, handle] of sub.entries()) {
      const [id, ...rest] = name.split('__');
      if (!id || (await db.get('files', id))) continue;
      await db.put('files', { id, name: rest.join('__') || name, blob: await handle.getFile() });
      saved.add(id);
      n++;
    }
  }
  await setMeta('savedFiles', [...saved]);
  return n;
}

/** Writes the workbook to whichever target is set up. */
export async function saveNow() {
  if (!target) return false;
  if (savingPromise) return savingPromise;
  localFiles.saving = true;
  emit();
  savingPromise = (async () => {
    try {
      const blob = await exportWorkbook({ includeFiles: false }); // originals are copied separately
      if (target.kind === 'folder') await writeFolder(target.dir, blob);
      else await writeLocalServer(blob);
      await markSaved();
      localFiles.error = '';
      return true;
    } catch (err) {
      localFiles.error = err.message;
      return false;
    } finally {
      localFiles.saving = false;
      savingPromise = null;
      emit();
    }
  })();
  return savingPromise;
}

async function markSaved() {
  localFiles.lastSaved = Date.now();
  localFiles.dirty = 0;
  await setMeta('lastSaved', localFiles.lastSaved);
  emit();
}

function scheduleSave() {
  localFiles.dirty++;
  emit();
  if (!target) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, AUTOSAVE_DELAY);
}

/* ------------------------------ start-up ------------------------------ */
export async function initLocalFiles() {
  localFiles.lastSaved = await meta('lastSaved', null);
  try {
    const res = await fetch('/api/health');
    const h = await res.json();
    state.localStore = Boolean(h.localStore);
    if (h.localStore) {
      target = { kind: 'local' };
      localFiles.kind = 'local';
      localFiles.label = h.dataDir || 'this device';
    }
  } catch { /* offline or the hosted site: fall back to manual backups */ }

  if (!target) {
    const dir = await meta('folderHandle');
    if (dir) {
      const perm = await dir.queryPermission?.({ mode: 'readwrite' });
      if (perm === 'granted') {
        target = { kind: 'folder', dir };
        localFiles.kind = 'folder';
        localFiles.folderName = dir.name;
      } else {
        localFiles.kind = 'folder-paused';
        localFiles.folderName = dir.name;
      }
    }
  }

  // Nothing in this browser (new device, or browser data was cleared): load the saved file.
  if (target && !(await db.hasUserData())) {
    try {
      const blob = target.kind === 'local' ? await readLocalServer() : await readFolderWorkbook(target.dir);
      if (blob) {
        const s = await importWorkbook(blob, { mode: 'merge' });
        s.files += await restoreOriginals();
        if (s.restored) document.dispatchEvent(new CustomEvent('localfiles:restored', { detail: s }));
      }
    } catch (err) {
      localFiles.error = err.message;
    }
  }

  document.addEventListener('db:changed', scheduleSave);
  document.addEventListener('settings:changed', scheduleSave);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && localFiles.dirty && saveNow());
  emit();
}

/** Lets a paused folder be reconnected (needs a click, by browser rule). */
export async function resumeFolder() {
  const dir = await meta('folderHandle');
  if (!dir) return false;
  if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
  target = { kind: 'folder', dir };
  localFiles.kind = 'folder';
  await saveNow();
  return true;
}

export function backupStatus() {
  if (localFiles.kind === 'local') return { tone: 'ok', text: `Saving automatically to ${localFiles.label}` };
  if (localFiles.kind === 'folder') return { tone: 'ok', text: `Saving automatically to the folder “${localFiles.folderName}”` };
  if (localFiles.kind === 'folder-paused') return { tone: 'warn', text: `Reconnect the folder “${localFiles.folderName}” to keep saving` };
  const days = localFiles.lastSaved ? (Date.now() - localFiles.lastSaved) / 86400000 : Infinity;
  if (!localFiles.lastSaved) return { tone: 'warn', text: 'Not backed up yet: your work is only in this browser' };
  if (days > 3 || localFiles.dirty > 30) return { tone: 'warn', text: `Last backup ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago` };
  return { tone: 'ok', text: `Last backup ${new Date(localFiles.lastSaved).toLocaleDateString()}` };
}
