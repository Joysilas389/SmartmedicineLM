/* Document viewer (spec §10): thumbnails, navigation, zoom, search, selectable text, page actions. */
import { examShort } from './exams.js';
import { state } from './state.js';
import { db } from './store.js';
import { $, $$, escapeHtml, toast, debounce } from './ui.js';
import { pageText, searchInDocument } from './retrieval.js';
import { imageForModel } from './ingestion.js';
import { composeAndSend } from './chat.js';

const cache = new Map(); // docId -> pdf proxy (keep at most 2 open)
const cur = { doc: null, pdf: null, page: 1, total: 1, zoom: 1, task: null, imgUrl: null, thumbObserver: null };

export function initViewer() {
  $('#viewerBack').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/library')));
  $('#pgPrev').addEventListener('click', () => go(cur.page - 1));
  $('#pgNext').addEventListener('click', () => go(cur.page + 1));
  $('#pgInput').addEventListener('change', (e) => go(Number(e.target.value)));
  $('#zoomIn').addEventListener('click', () => setZoom(cur.zoom * 1.2));
  $('#zoomOut').addEventListener('click', () => setZoom(cur.zoom / 1.2));
  $('#zoomFit').addEventListener('click', () => setZoom(1));
  $('#viewerSearchToggle').addEventListener('click', () => {
    const box = $('#viewerSearch');
    box.hidden = !box.hidden;
    if (!box.hidden) $('#viewerSearchInput').focus();
  });
  $('#viewerTextToggle').addEventListener('click', toggleText);
  $('#viewerSearchInput').addEventListener('input', debounce(runSearch, 220));
  $('#viewerResults').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (b) go(Number(b.dataset.page));
  });
  $('#thumbs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (b) go(Number(b.dataset.page));
  });
  $$('[data-page-action]').forEach((b) => b.addEventListener('click', () => pageAction(b.dataset.pageAction)));
  document.addEventListener('keydown', (e) => {
    if ($('#view-viewer').hidden || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(cur.page + 1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(cur.page - 1);
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => !$('#view-viewer').hidden && cur.pdf && renderPage(), 200);
  });
}

async function loadPdf(docId) {
  if (cache.has(docId)) return cache.get(docId);
  const rec = await db.get('files', docId);
  if (!rec) throw new Error('The original file is missing from this device.');
  const data = new Uint8Array(await rec.blob.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  cache.set(docId, pdf);
  if (cache.size > 2) {
    const [oldId, old] = cache.entries().next().value;
    if (oldId !== docId) {
      old.destroy();
      cache.delete(oldId);
    }
  }
  return pdf;
}

export async function openViewer(docId, page = 1) {
  const doc = state.documents.find((d) => d.id === docId);
  const stage = $('#stageInner');
  if (!doc) {
    stage.innerHTML = '<div class="empty-block"><i class="bi bi-file-earmark-x"></i><p class="mb-0">This document is no longer in your library.</p></div>';
    $('#viewerTitle').textContent = 'Document not found';
    $('#thumbs').innerHTML = '';
    return;
  }
  const sameDoc = cur.doc?.id === docId;
  cur.doc = doc;
  $('#viewerTitle').textContent = doc.title;
  $('#pageText').hidden = true;
  $('#viewerResults').innerHTML = '';
  $('#viewerSearchInput').value = '';
  const isImage = doc.fileType === 'image';
  $$('.viewer-controls .btn-icon').forEach((b) => (b.disabled = isImage && !['zoomIn', 'zoomOut', 'zoomFit'].includes(b.id)));
  $('#viewerActions [data-page-action="explain"]').innerHTML = `<i class="bi bi-lightbulb me-1"></i>${isImage ? 'Explain this image' : 'Explain this page'}`;

  if (isImage) {
    cur.pdf = null;
    cur.total = 1;
    cur.page = 1;
    if (cur.imgUrl) URL.revokeObjectURL(cur.imgUrl);
    const rec = await db.get('files', docId);
    if (!rec) {
      cur.imgUrl = null;
      stage.innerHTML = `<div class="empty-block"><i class="bi bi-phone"></i><p class="mb-1 fw-semibold">This image is on another device</p><p class="mb-0">It was uploaded on a different device and synced without the image file. Upload it again here to view it.</p></div>`;
      $('#thumbs').innerHTML = '';
      updatePager();
      return;
    }
    cur.imgUrl = URL.createObjectURL(rec.blob);
    stage.innerHTML = `<img src="${cur.imgUrl}" alt="${escapeHtml(doc.title)}">`;
    $('#thumbs').innerHTML = '';
    updatePager();
    return;
  }

  const missingOriginal = doc.fileType === 'pdf' && !(await db.get('files', docId));
  if (doc.fileType !== 'pdf' || missingOriginal) {
    // Text/DOCX documents (and PDFs synced from another device): show extracted text by page.
    cur.pdf = null;
    cur.total = doc.pageCount || 1;
    cur.page = clamp(page, 1, cur.total);
    $('#thumbs').innerHTML = '';
    await renderTextPage();
    if (missingOriginal)
      stage.insertAdjacentHTML('afterbegin', `<div class="note-box small mb-2"><i class="bi bi-phone me-1"></i>Showing the extracted text. The original PDF is on the device it was uploaded from; upload it here too to see the pages.</div>`);
    return;
  }

  try {
    stage.innerHTML = '<div class="empty-block"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 mb-0">Opening…</p></div>';
    cur.pdf = await loadPdf(docId);
    cur.total = cur.pdf.numPages;
    cur.page = clamp(page, 1, cur.total);
    if (!sameDoc) {
      cur.zoom = 1;
      buildThumbs();
    }
    await renderPage();
  } catch (err) {
    stage.innerHTML = `<div class="empty-block"><i class="bi bi-exclamation-triangle"></i><p class="mb-0">${escapeHtml(err.message || 'This PDF could not be opened.')}</p></div>`;
  }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

function go(n) {
  if (!cur.doc) return;
  const p = clamp(n, 1, cur.total);
  if (p === cur.page && cur.pdf) return;
  history.replaceState(null, '', `#/viewer/${cur.doc.id}/${p}`);
  cur.page = p;
  if (cur.pdf) renderPage();
  else if (cur.doc.fileType !== 'image') renderTextPage();
}

function setZoom(z) {
  cur.zoom = clamp(z, 0.5, 4);
  if (cur.pdf) renderPage();
  else {
    const img = $('#stageInner img');
    if (img) img.style.maxWidth = cur.zoom === 1 ? '100%' : `${cur.zoom * 100}%`;
  }
}

function updatePager() {
  $('#pgInput').value = cur.page;
  $('#pgInput').max = cur.total;
  $('#pgTotal').textContent = cur.total;
  $('#pgPrev').disabled = cur.page <= 1;
  $('#pgNext').disabled = cur.page >= cur.total;
  $$('#thumbs .thumb').forEach((t) => t.classList.toggle('active', Number(t.dataset.page) === cur.page));
  $(`#thumbs .thumb[data-page="${cur.page}"]`)?.scrollIntoView({ block: 'nearest' });
  if (!$('#pageText').hidden) fillText();
}

async function renderPage() {
  const pdf = cur.pdf;
  if (!pdf) return;
  if (cur.task) {
    try { cur.task.cancel(); } catch { /* ignore */ }
  }
  const page = await pdf.getPage(cur.page);
  const stage = $('#stage');
  const base = page.getViewport({ scale: 1 });
  const avail = Math.max(200, stage.clientWidth - 32);
  const scale = Math.min(avail / base.width, 2.2) * cur.zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const vp = page.getViewport({ scale: scale * dpr });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  canvas.setAttribute('aria-label', `Page ${cur.page} of ${cur.total}`);
  cur.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  try {
    await cur.task.promise;
    const inner = $('#stageInner');
    inner.innerHTML = '';
    inner.appendChild(canvas);
    stage.scrollTop = 0;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.warn(err);
  }
  updatePager();
}

async function renderTextPage() {
  const text = await pageText(cur.doc.id, cur.page);
  $('#stageInner').innerHTML = `<div class="page-text position-static w-100" style="max-width:720px">${escapeHtml(text || 'No text on this page.')}</div>`;
  updatePager();
}

function buildThumbs() {
  const box = $('#thumbs');
  cur.thumbObserver?.disconnect();
  box.innerHTML = Array.from({ length: cur.total }, (_, i) => `<button class="thumb" type="button" data-page="${i + 1}" aria-label="Go to page ${i + 1}"><canvas></canvas>${i + 1}</button>`).join('');
  const pdf = cur.pdf;
  cur.thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || e.target.dataset.done) continue;
        e.target.dataset.done = '1';
        cur.thumbObserver.unobserve(e.target);
        const n = Number(e.target.dataset.page);
        pdf.getPage(n).then((page) => {
          const canvas = e.target.querySelector('canvas');
          const vp = page.getViewport({ scale: 220 / page.getViewport({ scale: 1 }).width });
          canvas.width = vp.width;
          canvas.height = vp.height;
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }).catch(() => {});
      }
    },
    { root: box, rootMargin: '300px' }
  );
  box.querySelectorAll('.thumb').forEach((t) => cur.thumbObserver.observe(t));
}

async function fillText() {
  const t = await pageText(cur.doc.id, cur.page);
  $('#pageText').textContent = t || (cur.doc.status === 'needs-ocr' ? 'This page has no text layer (it is probably scanned). OCR support is planned for a later phase; meanwhile "Explain this page" sends the page as an image.' : 'No text on this page.');
}

function toggleText() {
  if (!cur.pdf) return;
  const box = $('#pageText');
  box.hidden = !box.hidden;
  if (!box.hidden) fillText();
}

async function runSearch() {
  const term = $('#viewerSearchInput').value;
  const out = $('#viewerResults');
  if (!cur.doc || term.trim().length < 2) {
    out.innerHTML = '';
    return;
  }
  const hits = await searchInDocument(cur.doc.id, term);
  out.innerHTML = hits.length
    ? hits.map((h) => `<button type="button" data-page="${h.page}"><strong>p. ${h.page}</strong> · …${escapeHtml(h.before)}<mark>${escapeHtml(h.match)}</mark>${escapeHtml(h.after)}…</button>`).join('')
    : '<div class="small text-body-secondary px-2">No matches.</div>';
}

/** Renders the current PDF page to an image, for scanned pages with no text layer. */
async function currentPageAsImage() {
  const page = await cur.pdf.getPage(cur.page);
  const vp = page.getViewport({ scale: 1568 / Math.max(page.getViewport({ scale: 1 }).width, page.getViewport({ scale: 1 }).height) });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  return { ...(await imageForModel(blob)), name: `${cur.doc.title} p. ${cur.page}` };
}

export async function imageFromLibrary(doc) {
  const rec = await db.get('files', doc.id);
  return { ...(await imageForModel(rec.blob)), name: doc.title };
}

const PROMPTS = {
  explain: 'Explain this page to me from first principles.',
  teach: 'Teach me the topic on this page from absolute zero.',
  get questions() { return `Write 3 USMLE ${examShort()}-style questions based on this page. Give each as a clinical vignette with options A–E. Do not reveal the answers until I reply with mine.`; },
  flashcards: 'Create 6–8 mechanism-based flashcards from this page.',
};
const IMAGE_PROMPTS = {
  explain: 'Explain this image from absolute zero.',
  teach: 'Teach me the concept shown in this image from absolute zero.',
  get questions() { return `Write 3 USMLE ${examShort()}-style questions based on this image. Do not reveal the answers until I reply with mine.`; },
  flashcards: 'Create 6–8 mechanism-based flashcards from this image.',
};

async function pageAction(action) {
  const doc = cur.doc;
  if (!doc) return;
  try {
    if (doc.fileType === 'image') {
      composeAndSend(IMAGE_PROMPTS[action], { images: [await imageFromLibrary(doc)] });
      return;
    }
    const pinned = { docId: doc.id, page: cur.page, title: doc.title };
    if (doc.status === 'needs-ocr' && cur.pdf) {
      toast('This page has no text layer, so I’m sending it as an image.', 'dark');
      composeAndSend(PROMPTS[action], { pinned, images: [await currentPageAsImage()] });
      return;
    }
    composeAndSend(PROMPTS[action], { pinned, docIds: [doc.id] });
  } catch (err) {
    toast(err.message || 'That action failed.', 'danger');
  }
}
