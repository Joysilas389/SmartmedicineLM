/*
 * Reading highlighter. Select text in a lesson or document page and a row of coloured ink
 * dots appears; tap one to highlight, or the eraser to rub highlights out.
 * Highlights are stored as character positions within the text of their container, so they
 * survive reloads, sync between devices and appear in the Excel workbook.
 */
import { db } from './store.js';
import { uid, toast } from './ui.js';

export const INKS = [
  { key: 'yellow', label: 'Yellow', color: '#ffd84d' },
  { key: 'green', label: 'Green', color: '#7ddc9a' },
  { key: 'blue', label: 'Blue', color: '#8fc9f5' },
  { key: 'pink', label: 'Pink', color: '#f7a8c4' },
  { key: 'purple', label: 'Purple', color: '#c3b3f2' },
];

const targets = new Map(); // container -> targetId
let bar = null;
let pending = null; // { target, start, end, text }

/* ---------------- offsets ---------------- */
const walker = (root) => document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

/**
 * Character offset of a selection boundary from the start of the container's text.
 * Measuring the text before the boundary also handles boundaries that sit on an element
 * (which is what a whole-paragraph or triple-tap selection gives).
 */
function offsetOf(root, node, offset) {
  if (!root.contains(node)) return null;
  try {
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  } catch {
    return null;
  }
}

/** Turns a character range back into a DOM Range. */
function rangeFrom(root, start, end) {
  const w = walker(root);
  const r = document.createRange();
  let total = 0;
  let started = false;
  let n;
  while ((n = w.nextNode())) {
    const len = n.nodeValue.length;
    if (!started && start <= total + len) {
      r.setStart(n, Math.max(0, start - total));
      started = true;
    }
    if (started && end <= total + len) {
      r.setEnd(n, Math.max(0, end - total));
      return r;
    }
    total += len;
  }
  return started ? (r.setEnd(root, root.childNodes.length), r) : null;
}

/* ---------------- painting ---------------- */
function paint(root, h) {
  const range = rangeFrom(root, h.start, h.end);
  if (!range || range.collapsed) return;
  // One <mark> per text node the range touches, so block elements are not broken apart.
  const pieces = [];
  const w = walker(root);
  let total = 0;
  let n;
  while ((n = w.nextNode())) {
    const len = n.nodeValue.length;
    const from = Math.max(h.start, total);
    const to = Math.min(h.end, total + len);
    if (to > from) pieces.push({ node: n, from: from - total, to: to - total });
    total += len;
    if (total >= h.end) break;
  }
  for (const p of pieces.reverse()) {
    const r = document.createRange();
    r.setStart(p.node, p.from);
    r.setEnd(p.node, p.to);
    const mark = document.createElement('mark');
    mark.className = `hl hl-${h.color}`;
    mark.dataset.hlId = h.id;
    try {
      r.surroundContents(mark);
    } catch {
      /* a range crossing element boundaries: skip that piece */
    }
  }
}

function unpaint(root, id) {
  root.querySelectorAll(`mark[data-hl-id="${id}"]`).forEach((m) => {
    const parent = m.parentNode;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    m.remove();
    parent.normalize();
  });
}

/* ---------------- storage ---------------- */
const load = (target) => db.byIndex('highlights', 'target', target);

async function save(h) {
  await db.put('highlights', h);
}

async function removeOverlapping(root, target, start, end) {
  const existing = await load(target);
  for (const h of existing) {
    if (h.start < end && start < h.end) {
      await db.del('highlights', h.id);
      unpaint(root, h.id);
    }
  }
}

/* ---------------- the little toolbar ---------------- */
function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'hl-bar';
  bar.hidden = true;
  bar.innerHTML = `${INKS.map((i) => `<button type="button" class="hl-ink" data-ink="${i.key}" style="--ink:${i.color}" aria-label="Highlight ${i.label}"></button>`).join('')}
    <span class="hl-sep"></span>
    <button type="button" class="hl-ink hl-eraser" data-ink="erase" aria-label="Erase highlight"><i class="bi bi-eraser"></i></button>`;
  document.body.appendChild(bar);
  bar.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection alive
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ink]');
    if (!b || !pending) return;
    const { root, target, start, end, text } = pending;
    hideBar();
    getSelection().removeAllRanges();
    await removeOverlapping(root, target, start, end);
    if (b.dataset.ink !== 'erase') {
      const h = { id: uid('hl'), target, start, end, color: b.dataset.ink, text: text.slice(0, 400), createdAt: Date.now() };
      await save(h);
      paint(root, h);
    }
  });
  return bar;
}

function showBar(rect) {
  const el = ensureBar();
  el.hidden = false;
  const w = el.offsetWidth || 240;
  const h = el.offsetHeight || 46;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), Math.max(8, innerWidth - w - 8));
  // Prefer above the selection, but always keep the whole bar on screen.
  const wanted = rect.top > h + 16 ? rect.top - h - 8 : rect.bottom + 8;
  const top = Math.min(Math.max(8, wanted), Math.max(8, innerHeight - h - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hideBar() {
  if (bar) bar.hidden = true;
  pending = null;
}

/* ---------------- public API ---------------- */
/** Makes `root` highlightable. `target` identifies what is being read (a message or page). */
export async function enableHighlighting(root, target) {
  if (!root || root.dataset.hlOn === target) return;
  root.dataset.hlOn = target;
  targets.set(root, target);
  try {
    for (const h of await load(target)) paint(root, h);
  } catch (err) {
    console.warn('Could not load highlights', err);
  }
  // Tap an existing highlight to remove it.
  root.addEventListener('click', async (e) => {
    const mark = e.target.closest('mark.hl');
    if (!mark || !getSelection().isCollapsed) return;
    const id = mark.dataset.hlId;
    unpaint(root, id);
    await db.del('highlights', id);
  });
}

function onSelectionChange() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return hideBar();
  const range = sel.getRangeAt(0);
  const root = [...targets.keys()].find((r) => r.contains(range.commonAncestorContainer));
  if (!root) return hideBar();
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (start == null || end == null || end - start < 1) return hideBar();
  pending = { root, target: targets.get(root), start: Math.min(start, end), end: Math.max(start, end), text: sel.toString() };
  showBar(range.getBoundingClientRect());
}

document.addEventListener('selectionchange', () => setTimeout(onSelectionChange, 0));
document.addEventListener('scroll', hideBar, true);
window.addEventListener('resize', hideBar);

/** Everything highlighted, newest first (used by the Highlights view). */
export async function allHighlights() {
  return (await db.all('highlights')).sort((a, b) => b.createdAt - a.createdAt);
}
