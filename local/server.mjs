/*
 * SmartMedicineLM local mode: run the whole app from your own device (Termux on Android, or
 * any computer with Node). Your data is written to a real Excel file in your storage, not into
 * browser storage, so clearing the browser's cache cannot erase it.
 *
 *   npm install
 *   npm run local        → open http://localhost:3000
 *
 * Data goes to (first that exists):
 *   $SM_DATA_DIR, ~/storage/shared/SmartMedicineLM (Android: "Internal storage/SmartMedicineLM"),
 *   ~/Documents/SmartMedicineLM, or ./data
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const PORT = Number(process.env.PORT || 3000);
const WORKBOOK = 'SmartMedicineLM.xlsx';
const KEEP_BACKUPS = 10;
const BACKUP_EVERY = 60 * 60 * 1000; // keep an hourly history, not one per save

/* ---------- environment ---------- */
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env file is fine */ }
}

function pickDataDir() {
  if (process.env.SM_DATA_DIR) return process.env.SM_DATA_DIR;
  const shared = path.join(os.homedir(), 'storage', 'shared');
  if (fs.existsSync(shared)) return path.join(shared, 'SmartMedicineLM');
  const docs = path.join(os.homedir(), 'Documents');
  if (fs.existsSync(docs)) return path.join(docs, 'SmartMedicineLM');
  return path.join(ROOT, 'data');
}
const DATA_DIR = pickDataDir();
const FILES_DIR = path.join(DATA_DIR, 'files');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
process.env.SM_LOCAL_STORE = '1';
process.env.SM_DATA_DIR_LABEL = DATA_DIR.replace(path.join(os.homedir(), 'storage', 'shared'), 'Internal storage');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'cache-control': 'no-store', ...headers });
  res.end(body);
};
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'content-type': 'application/json' });
const body = (req) =>
  new Promise((resolve, reject) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
const safe = (name) => String(name).replace(/[^\w.\- ]+/g, '_').slice(0, 90);

/* ---------- the Excel store ---------- */
async function rotateBackup(target) {
  try {
    const stat = await fsp.stat(target);
    const newest = (await fsp.readdir(BACKUP_DIR)).sort().pop();
    const newestTime = newest ? Number(newest.match(/(\d+)\.xlsx$/)?.[1] || 0) : 0;
    if (Date.now() - newestTime < BACKUP_EVERY) return;
    await fsp.copyFile(target, path.join(BACKUP_DIR, `SmartMedicineLM-${new Date(stat.mtimeMs).toISOString().slice(0, 16).replace(/[:T]/g, '')}-${Date.now()}.xlsx`));
    const all = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.endsWith('.xlsx')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) await fsp.unlink(path.join(BACKUP_DIR, old));
  } catch { /* no previous file yet */ }
}

async function handleStore(req, res, url) {
  const fileId = url.searchParams.get('file');
  if (req.method === 'GET' && url.searchParams.get('list') === 'files') {
    const list = (await fsp.readdir(FILES_DIR)).map((f) => {
      const i = f.indexOf('__');
      return i > 0 ? { id: f.slice(0, i), name: f.slice(i + 2) } : null;
    });
    return json(res, 200, list.filter(Boolean));
  }
  if (req.method === 'GET') {
    if (fileId) {
      const match = (await fsp.readdir(FILES_DIR)).find((f) => f.startsWith(`${safe(fileId)}__`));
      if (!match) return json(res, 404, { error: 'Not saved yet.' });
      return send(res, 200, await fsp.readFile(path.join(FILES_DIR, match)), { 'content-type': 'application/octet-stream' });
    }
    const target = path.join(DATA_DIR, WORKBOOK);
    if (!fs.existsSync(target)) return json(res, 404, { error: 'No saved workbook yet.' });
    return send(res, 200, await fsp.readFile(target), { 'content-type': TYPES['.xlsx'] });
  }
  if (req.method === 'PUT') {
    const buf = await body(req);
    if (!buf.length) return json(res, 400, { error: 'Empty upload.' });
    if (fileId) {
      const name = safe(url.searchParams.get('name') || fileId);
      await fsp.writeFile(path.join(FILES_DIR, `${safe(fileId)}__${name}`), buf);
      return json(res, 200, { ok: true });
    }
    const target = path.join(DATA_DIR, WORKBOOK);
    await rotateBackup(target);
    const tmp = `${target}.tmp`;
    await fsp.writeFile(tmp, buf); // write then rename, so a crash cannot leave half a file
    await fsp.rename(tmp, target);
    return json(res, 200, { ok: true, bytes: buf.length, path: target });
  }
  return json(res, 405, { error: 'Use GET or PUT.' });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/local-store') return await handleStore(req, res, url);

    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^\w-]/g, '');
      const file = path.join(ROOT, 'api', `${name}.js`);
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Unknown endpoint.' });
      const mod = await import(`file://${file}`);
      const init = { method: req.method, headers: req.headers };
      if (!['GET', 'HEAD'].includes(req.method)) init.body = await body(req);
      const r = await mod.default(new Request(`http://localhost:${PORT}${req.url}`, init));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) for await (const chunk of r.body) res.write(chunk);
      return res.end();
    }

    // The Excel library, served locally so the app works without the internet.
    if (url.pathname === '/vendor/xlsx.full.min.js') {
      const lib = path.join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
      if (!fs.existsSync(lib)) return json(res, 404, { error: 'Run npm install first.' });
      return send(res, 200, await fsp.readFile(lib), { 'content-type': 'text/javascript' });
    }

    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(FRONTEND, rel);
    if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
    send(res, 200, await fsp.readFile(file), { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
});

// Bound to this device only: nothing else on the network can reach your notes.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  SmartMedicineLM is running on this device.\n`);
  console.log(`  Open:  http://localhost:${PORT}`);
  console.log(`  Data:  ${path.join(DATA_DIR, WORKBOOK)}`);
  console.log(`  Files: ${FILES_DIR}`);
  console.log(`  Backups kept: ${KEEP_BACKUPS} (hourly)\n`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) console.log('  No API key found in .env: the app runs in demo mode.\n');
});
