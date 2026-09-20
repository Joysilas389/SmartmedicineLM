/* Document library (spec §9) and source provenance page (spec §32, §44). */
import { state } from './state.js';
import { db } from './store.js';
import { $, $$, escapeHtml, formatBytes, formatDate, toast, confirmDialog, promptDialog, uid } from './ui.js';
import { ingestFile, validateFile } from './ingestion.js';
import { invalidateIndex } from './retrieval.js';
import { scheduleIndexing, removeDocumentVectors } from './embeddings.js';
import { composeAndSend, startNewChat, prefill } from './chat.js';

let filter = 'all';
const progress = new Map(); // docId -> fraction

export const SOURCE_TYPES = {
  'user-owned': 'My own material',
  licensed: 'Licensed to me',
  'public-domain': 'Public domain',
  'open-access': 'Open access',
  restricted: 'Restricted',
};

const STATUS = {
  ready: ['status-ready', 'Ready'],
  processing: ['status-processing', 'Processing'],
  'needs-ocr': ['status-warn', 'No text layer'],
  error: ['status-error', 'Failed'],
};

export async function loadDocuments() {
  state.documents = (await db.all('documents')).sort((a, b) => b.createdAt - a.createdAt);
  // Anything still "processing" after a reload was interrupted.
  for (const d of state.documents)
    if (d.status === 'processing') {
      d.status = 'error';
      d.error = 'Processing was interrupted. Delete and upload the file again.';
      await db.put('documents', d);
    }
}

export function initLibrary() {
  const input = $('#fileLibrary');
  $('#libraryUploadBtn').addEventListener('click', () => input.click());
  const dz = $('#libraryDropzone');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('over');
    uploadFiles(Array.from(e.dataTransfer.files));
  });
  input.addEventListener('change', () => {
    uploadFiles(Array.from(input.files));
    input.value = '';
  });
  $('#librarySearch').addEventListener('input', renderLibrary);
  $$('#libraryFilter [data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#libraryFilter .nav-link').forEach((x) => x.classList.toggle('active', x === b));
      filter = b.dataset.filter;
      renderLibrary();
    })
  );
  $('#libraryList').addEventListener('click', onListClick);
  $('#libraryList').addEventListener('change', onSourceTypeChange);
}

/**
 * Validates and ingests files one at a time (keeps memory low on phones).
 * `onProgress(doc, fraction, tempId)` lets the chat composer show progress chips.
 */
export async function uploadFiles(files, { onProgress } = {}) {
  const done = [];
  for (const file of files) {
    const v = validateFile(file);
    if (!v.ok) {
      toast(v.error, 'danger', 6000);
      continue;
    }
    const tempId = uid('up');
    try {
      const doc = await ingestFile(file, (d, p) => {
        progress.set(d.id, p);
        if (!state.documents.find((x) => x.id === d.id)) state.documents.unshift(d);
        else Object.assign(state.documents.find((x) => x.id === d.id), d);
        onProgress?.(d, p, tempId);
        renderLibrary();
      });
      progress.delete(doc.id);
      Object.assign(state.documents.find((x) => x.id === doc.id) || {}, doc);
      invalidateIndex();
      scheduleIndexing();
      done.push(doc);
      if (doc.status === 'needs-ocr')
        toast(`${doc.title} has no selectable text (probably a scan). You can view it, but text search needs OCR, which is coming in a later phase.`, 'warning', 8000);
      else if (doc.status === 'error') toast(`${doc.title}: ${doc.error}`, 'danger', 8000);
    } catch (err) {
      onProgress?.({ title: file.name }, 1, tempId);
      toast(err.message, 'danger', 6000);
    }
    renderLibrary();
  }
  return done;
}

function kindOf(d) {
  return d.fileType === 'pdf' ? 'pdf' : d.fileType === 'image' ? 'image' : 'text';
}

export function renderLibrary() {
  const list = $('#libraryList');
  if (!list) return;
  const q = $('#librarySearch').value.trim().toLowerCase();
  const docs = state.documents
    .filter((d) => filter === 'all' || kindOf(d) === filter)
    .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.topics || []).some((t) => t.toLowerCase().includes(q)));

  if (!state.documents.length) {
    list.innerHTML = `<div class="empty-block"><i class="bi bi-journal-medical"></i><p class="mb-1 fw-semibold">Your library is empty</p><p class="mb-0">Upload lecture notes, textbooks you're licensed to use, or images. I'll teach from them and cite the exact page.</p></div>`;
    return;
  }
  if (!docs.length) {
    list.innerHTML = `<div class="empty-block"><p class="mb-0">No documents match your search.</p></div>`;
    return;
  }

  list.innerHTML = docs
    .map((d) => {
      const [cls, label] = STATUS[d.status] || STATUS.error;
      const p = progress.get(d.id);
      const icon = d.thumb
        ? `<img src="${d.thumb}" alt="">`
        : `<i class="bi ${d.fileType === 'pdf' ? 'bi-file-earmark-pdf' : d.fileType === 'image' ? 'bi-image' : 'bi-file-earmark-text'}"></i>`;
      return `<div class="doc-row" data-id="${d.id}">
        <div class="doc-icon ${kindOf(d)}">${icon}</div>
        <div class="doc-main">
          <button class="doc-name" type="button" data-doc-act="open" title="${escapeHtml(d.fileName)}">${escapeHtml(d.title)}</button>
          <div class="doc-meta">
            <span>${d.fileType.toUpperCase()}</span><span>${formatBytes(d.size)}</span>
            ${d.pageCount ? `<span>${d.pageCount} page${d.pageCount > 1 ? 's' : ''}</span>` : ''}
            <span>${formatDate(d.createdAt)}</span>
            <span class="status ${cls}">${label}${d.status === 'processing' && p != null ? ` ${Math.round(p * 100)}%` : ''}</span>
          </div>
          ${d.status === 'processing' ? `<div class="progress doc-progress" role="progressbar" aria-valuenow="${Math.round((p || 0) * 100)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${Math.round((p || 0) * 100)}%"></div></div>` : ''}
          ${d.topics?.length ? `<div class="doc-topics">${d.topics.map((t) => `<span class="topic">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          ${d.status === 'error' && d.error ? `<div class="small text-danger mt-1">${escapeHtml(d.error)}</div>` : ''}
        </div>
        <div class="dropdown">
          <button class="btn btn-icon" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Actions for ${escapeHtml(d.title)}"><i class="bi bi-three-dots-vertical"></i></button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button class="dropdown-item" data-doc-act="open"><i class="bi bi-eye me-2"></i>Open</button></li>
            ${d.status === 'ready' ? `<li><button class="dropdown-item" data-doc-act="ask"><i class="bi bi-chat-left-text me-2"></i>${d.fileType === 'image' ? 'Explain this image' : 'Chat about this document'}</button></li>` : ''}
            <li><button class="dropdown-item" data-doc-act="rename"><i class="bi bi-pencil me-2"></i>Rename</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger" data-doc-act="delete"><i class="bi bi-trash me-2"></i>Delete</button></li>
          </ul>
        </div>
      </div>`;
    })
    .join('');
}

async function onListClick(e) {
  const btn = e.target.closest('[data-doc-act]');
  if (!btn) return;
  const id = btn.closest('.doc-row').dataset.id;
  const doc = state.documents.find((d) => d.id === id);
  if (!doc) return;
  const act = btn.dataset.docAct;
  if (act === 'open') location.hash = `#/viewer/${id}/1`;
  else if (act === 'ask') {
    if (doc.fileType === 'image') {
      const { imageFromLibrary } = await import('./viewer.js');
      const img = await imageFromLibrary(doc);
      composeAndSend('Explain this image from absolute zero.', { images: [img] });
    } else {
      location.hash = '#/chat';
      startNewChat({ focus: false });
      state.pendingScope = [doc.id];
      prefill(`Teach me the main topic of "${doc.title}" from absolute zero.`);
    }
  } else if (act === 'rename') {
    const name = await promptDialog('Rename document', doc.title, 'Document name');
    if (name) {
      doc.title = name;
      doc.updatedAt = Date.now();
      await db.put('documents', doc);
      renderLibrary();
    }
  } else if (act === 'delete') {
    if (!(await confirmDialog('Delete document?', `"${doc.title}" and its extracted text will be removed from this device. Chats that cited it keep their text but the source links will stop working.`))) return;
    await deleteDocument(doc.id);
    toast('Document deleted.');
  }
}

export async function deleteDocument(id) {
  await db.delByIndex('chunks', 'docId', id);
  await removeDocumentVectors(id);
  await db.del('files', id);
  await db.del('documents', id);
  state.documents = state.documents.filter((d) => d.id !== id);
  invalidateIndex();
  renderLibrary();
  renderSourcesPage();
}

async function onSourceTypeChange(e) {
  const sel = e.target.closest('[data-source-type]');
  if (!sel) return;
  const doc = state.documents.find((d) => d.id === sel.dataset.sourceType);
  if (!doc) return;
  doc.sourceType = sel.value;
  await db.put('documents', doc);
}

/* ---------------- Sources page (provenance & rights) ---------------- */
export function renderSourcesPage() {
  const page = $('#sourcesPage');
  if (!page) return;
  const docs = state.documents;
  const chunks = docs.reduce((n, d) => n + (d.chunkCount || 0), 0);
  page.innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Sources</h2>
      <p class="page-sub">Where your answers come from. Every retrieved passage keeps its document, page and section so citations can open the exact page. Mark each document's rights so it's never redistributed by mistake.</p>
    </div></div>
    <div class="stat-row">
      <div class="stat"><b>${docs.length}</b><span>documents</span></div>
      <div class="stat"><b>${docs.reduce((n, d) => n + (d.pageCount || 0), 0)}</b><span>pages</span></div>
      <div class="stat"><b>${chunks}</b><span>searchable passages</span></div>
    </div>
    ${
      docs.length
        ? `<div class="table-responsive"><table class="table align-middle card-table">
      <thead><tr><th>Document</th><th>Passages</th><th>Rights</th></tr></thead><tbody>
      ${docs
        .map(
          (d) => `<tr><td><a href="#/viewer/${d.id}/1">${escapeHtml(d.title)}</a><div class="small text-body-secondary">${d.fileType.toUpperCase()} · ${d.pageCount || 0} p. · added ${formatDate(d.createdAt)}</div></td>
        <td>${d.chunkCount || 0}</td>
        <td><select class="form-select form-select-sm" data-source-type="${d.id}" aria-label="Rights for ${escapeHtml(d.title)}">
          ${Object.entries(SOURCE_TYPES).map(([k, v]) => `<option value="${k}" ${d.sourceType === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></td></tr>`
        )
        .join('')}</tbody></table></div>`
        : `<div class="empty-block"><i class="bi bi-bookmark-check"></i><p class="mb-0">No sources yet. <a href="#/library">Upload documents to your library.</a></p></div>`
    }`;
  page.querySelectorAll('[data-source-type]').forEach((s) => s.addEventListener('change', onSourceTypeChange));
}
