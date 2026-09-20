/*
 * Document ingestion pipeline (spec §11), Phase 1 in the browser:
 *   upload → validation → text extraction (PDF.js / DOCX / text) → layout-aware line
 *   rebuilding → heading detection → semantic chunking (never blind N-character splits)
 *   → topic detection → stored chunks with provenance (doc, page, section).
 * OCR, concept/mechanism/relationship extraction and embeddings arrive in later phases;
 * the chunk records already carry the provenance fields those stages need.
 */
import { db } from './store.js';
import { uid } from './ui.js';

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const LIMITS = { pdf: 150 * 1024 * 1024, image: 15 * 1024 * 1024, text: 10 * 1024 * 1024, docx: 30 * 1024 * 1024 };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function classifyFile(file) {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/.test(name)) return 'image';
  if (name.endsWith('.docx')) return 'docx';
  if (/^text\//.test(file.type) || /\.(txt|md|markdown|csv)$/.test(name)) return 'text';
  return null;
}

export function validateFile(file) {
  const kind = classifyFile(file);
  if (!kind) return { ok: false, error: `${file.name}: this file type isn't supported. Use PDF, PNG, JPG, WEBP, TXT, Markdown, CSV or DOCX.` };
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` };
  if (file.size > LIMITS[kind]) return { ok: false, error: `${file.name} is larger than the ${Math.round(LIMITS[kind] / 1048576)} MB limit for this type.` };
  return { ok: true, kind };
}

/** Checks the first bytes so a renamed file can't pose as a PDF or image. */
async function sniff(file, kind) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('');
  if (kind === 'pdf') return hex.startsWith('25504446'); // %PDF
  if (kind === 'docx') return hex.startsWith('504b0304'); // zip
  if (kind === 'image')
    return hex.startsWith('89504e47') || hex.startsWith('ffd8ff') || (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250');
  return true;
}

/**
 * Ingests one file into the library. `onProgress(doc, fraction)` is called as pages are processed.
 * Returns the stored document record.
 */
export async function ingestFile(file, onProgress = () => {}) {
  const v = validateFile(file);
  if (!v.ok) throw new Error(v.error);
  if (!(await sniff(file, v.kind))) throw new Error(`${file.name} doesn't look like a valid ${v.kind.toUpperCase()} file.`);

  const doc = {
    id: uid('doc'),
    title: file.name.replace(/\.[^.]+$/, ''),
    fileName: file.name,
    fileType: v.kind,
    mime: file.type || (v.kind === 'pdf' ? 'application/pdf' : 'text/plain'),
    size: file.size,
    pageCount: 0,
    chunkCount: 0,
    status: 'processing',
    sourceType: 'user-owned',
    topics: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put('files', { id: doc.id, blob: file });
  await db.put('documents', doc);
  onProgress(doc, 0);

  try {
    let chunks = [];
    if (v.kind === 'pdf') chunks = await extractPdf(file, doc, onProgress);
    else if (v.kind === 'image') {
      doc.pageCount = 1;
      doc.thumb = await imageThumb(file, 96);
    } else if (v.kind === 'docx') chunks = chunkPlainText(await extractDocx(file), doc);
    else chunks = chunkPlainText(await file.text(), doc);

    if (chunks.length) await db.putMany('chunks', chunks);
    doc.chunkCount = chunks.length;
    doc.topics = detectTopics(chunks, doc.pageCount);
    const chars = chunks.reduce((n, c) => n + c.text.length, 0);
    doc.status = v.kind === 'image' ? 'ready' : chars < 40 * Math.max(1, doc.pageCount) ? 'needs-ocr' : 'ready';
  } catch (err) {
    console.error(err);
    doc.status = 'error';
    doc.error = err.message || String(err);
  }
  doc.updatedAt = Date.now();
  await db.put('documents', doc);
  onProgress(doc, 1);
  return doc;
}

/* ------------------------------ PDF ------------------------------ */
async function extractPdf(file, doc, onProgress) {
  if (!window.pdfjsLib) throw new Error('The PDF engine did not load. Check your connection and reload.');
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  doc.pageCount = pdf.numPages;
  await db.put('documents', doc);
  const chunks = [];
  const state = { section: '', order: 0 };
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = rebuildPageText(content.items);
    chunks.push(...chunkPage(text, p, state, doc.id));
    page.cleanup();
    if (p % 3 === 0 || p === pdf.numPages) onProgress(doc, p / pdf.numPages);
  }
  await pdf.destroy();
  return chunks;
}

/** Rebuilds reading-order lines and paragraph breaks from PDF.js text items (layout analysis, lite). */
export function rebuildPageText(items) {
  let out = '';
  let lastY = null;
  let lastXEnd = null;
  let lastH = 10;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform[5];
    const x = it.transform[4];
    const h = Math.abs(it.transform[3]) || it.height || lastH;
    if (lastY !== null && Math.abs(y - lastY) > h * 0.6) {
      const gap = Math.abs(y - lastY);
      if (!out.endsWith('\n')) out += '\n';
      if (gap > Math.max(h, lastH) * 1.9 && !out.endsWith('\n\n')) out += '\n';
      lastXEnd = null;
    } else if (lastXEnd !== null && x - lastXEnd > h * 0.18 && !out.endsWith(' ') && !it.str.startsWith(' ')) {
      out += ' ';
    }
    out += it.str;
    if (it.str.trim()) {
      lastY = y;
      lastH = h;
      lastXEnd = x + (it.width || 0);
    }
    if (it.hasEOL && !out.endsWith('\n')) out += '\n';
  }
  return out
    .replace(/(\w)-\n(\w)/g, '$1$2') // de-hyphenate line wraps
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------ DOCX ------------------------------ */
let mammothPromise;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  mammothPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => reject(new Error('Could not load the DOCX reader. Check your connection.'));
    document.head.appendChild(s);
  });
  return mammothPromise;
}
async function extractDocx(file) {
  const mammoth = await loadMammoth();
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

/* ------------------------------ Semantic chunking ------------------------------ */
const TARGET = 1100;
const HARD_MAX = 1700;

export function isHeading(line) {
  const s = line.trim();
  if (s.length < 3 || s.length > 90) return false;
  if (/^#{1,6}\s/.test(s)) return true; // Markdown heading
  if (/[.,;:]$/.test(s) || /^\d+$/.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length > 11) return false;
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upper = (s.match(/[A-Z]/g) || []).length / letters.length;
  const titled = words.filter((w) => /^[A-Z0-9(]/.test(w)).length / words.length;
  const numbered = /^(\d+(\.\d+)*|[IVX]+\.|[A-Z]\.)\s+\S/.test(s);
  return upper > 0.7 || (titled >= 0.75 && words.length <= 8) || (numbered && words.length <= 9);
}

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
}

/** Chunks one page. Chunks never cross pages, so every citation points at an exact page. */
export function chunkPage(text, page, state, docId) {
  const chunks = [];
  let buf = '';
  let bufSection = state.section;
  const flush = () => {
    const t = buf.trim();
    if (t.length > 25) chunks.push({ id: uid('chk'), docId, page, section: bufSection, order: state.order++, text: t });
    buf = '';
    bufSection = state.section;
  };

  for (const para of text.split(/\n{2,}/)) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    // A heading at the start of a paragraph opens a new semantic section.
    while (lines.length && isHeading(lines[0])) {
      const h = lines.shift().replace(/^#{1,6}\s*/, '');
      if (buf.length > 200) flush();
      state.section = h;
      if (!buf) bufSection = h;
      buf += (buf ? '\n' : '') + h + '\n';
    }
    if (!lines.length) continue;
    const body = lines.join(' ').replace(/\s+/g, ' ');
    if (buf.length + body.length > TARGET && buf.length > 300) flush();
    if (body.length > HARD_MAX) {
      for (const s of splitSentences(body)) {
        if (buf.length + s.length > TARGET && buf.length > 300) flush();
        buf += s;
      }
      buf += '\n';
    } else {
      buf += body + '\n';
    }
  }
  flush();
  return chunks;
}

/** Text files and DOCX have no pages; we create ~3,000-character "pages" at paragraph boundaries. */
export function chunkPlainText(text, doc) {
  const paras = String(text).replace(/\r/g, '').split(/\n{2,}/);
  const pages = [];
  let cur = '';
  for (const p of paras) {
    if (cur.length + p.length > 3000 && cur) {
      pages.push(cur);
      cur = '';
    }
    cur += p + '\n\n';
  }
  if (cur.trim()) pages.push(cur);
  doc.pageCount = Math.max(1, pages.length);
  const state = { section: '', order: 0 };
  return pages.flatMap((t, i) => chunkPage(t, i + 1, state, doc.id));
}

/** Topic detection from section headings, ignoring running headers that repeat on most pages. */
export function detectTopics(chunks, pageCount = 1) {
  const pagesBySection = new Map();
  for (const c of chunks) {
    if (!c.section) continue;
    const key = c.section.replace(/\s+/g, ' ').trim();
    if (!pagesBySection.has(key)) pagesBySection.set(key, new Set());
    pagesBySection.get(key).add(c.page);
  }
  const generic = /^(contents|table of contents|index|references|bibliography|chapter \d+|page \d+|preface|acknowledg)/i;
  return [...pagesBySection.entries()]
    .filter(([name, pages]) => !generic.test(name) && (pageCount < 6 || pages.size / pageCount < 0.3))
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 8)
    .map(([name]) => (name.length > 40 ? name.slice(0, 38) + '…' : name))
    .map((n) => (n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n));
}

/* ------------------------------ Images ------------------------------ */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be read.'));
    };
    img.src = url;
  });
}

async function drawScaled(blob, maxSide) {
  const img = await loadImage(blob);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

export async function imageThumb(blob, size = 96) {
  return (await drawScaled(blob, size)).toDataURL('image/jpeg', 0.7);
}

/** Prepares an image for a vision model: max 1568px side, JPEG, base64 without the data: prefix. */
export async function imageForModel(blob) {
  const canvas = await drawScaled(blob, 1568);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], preview: await imageThumb(blob, 240) };
}
