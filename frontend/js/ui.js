/* Small UI helpers built on Bootstrap components. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid(prefix = '') {
  const id = globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function toast(message, variant = 'dark', delay = 4000) {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  const bg = { dark: 'text-bg-dark', danger: 'text-bg-danger', success: 'text-bg-success', warning: 'text-bg-warning' }[variant] || 'text-bg-dark';
  el.className = `toast align-items-center border-0 ${bg}`;
  el.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close ${variant === 'warning' ? '' : 'btn-close-white'} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  el.querySelector('.toast-body').textContent = message;
  wrap.appendChild(el);
  const t = new bootstrap.Toast(el, { delay });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

/* ---- generic modal dialog (confirm / prompt) ---- */
let dlgModal;
function dlg() {
  if (!dlgModal) dlgModal = new bootstrap.Modal(document.getElementById('dlg'));
  return dlgModal;
}

function openDialog({ title, bodyHtml, okText = 'OK', okClass = 'btn-primary', onOpen, collect }) {
  return new Promise((resolve) => {
    const el = document.getElementById('dlg');
    const form = document.getElementById('dlgForm');
    const ok = document.getElementById('dlgOk');
    document.getElementById('dlgTitle').textContent = title;
    document.getElementById('dlgBody').innerHTML = bodyHtml;
    ok.textContent = okText;
    ok.className = `btn ${okClass}`;
    let result = null;
    const submit = (e) => {
      e.preventDefault();
      result = collect ? collect() : true;
      dlg().hide();
    };
    const hidden = () => {
      form.removeEventListener('submit', submit);
      el.removeEventListener('hidden.bs.modal', hidden);
      el.removeEventListener('shown.bs.modal', shown);
      resolve(result);
    };
    const shown = () => onOpen?.();
    form.addEventListener('submit', submit);
    el.addEventListener('hidden.bs.modal', hidden);
    el.addEventListener('shown.bs.modal', shown);
    dlg().show();
  });
}

export function confirmDialog(title, message, okText = 'Delete', danger = true) {
  return openDialog({
    title,
    bodyHtml: `<p class="mb-0">${escapeHtml(message)}</p>`,
    okText,
    okClass: danger ? 'btn-danger' : 'btn-primary',
  }).then(Boolean);
}

export function promptDialog(title, value = '', label = 'Name', type = 'text') {
  return openDialog({
    title,
    bodyHtml: `<label class="form-label" for="dlgInput">${escapeHtml(label)}</label><input class="form-control" id="dlgInput" type="${type}" maxlength="200" value="${escapeHtml(value)}">`,
    okText: 'Save',
    onOpen: () => {
      const i = document.getElementById('dlgInput');
      i.focus();
      i.select();
    },
    collect: () => (type === 'password' ? document.getElementById('dlgInput').value : document.getElementById('dlgInput').value.trim()) || null,
  });
}

export function downloadText(filename, text, type = 'text/markdown') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
