/*
 * Notebook: everything worth coming back to, in one place.
 *   Mistakes   – missed questions not yet answered correctly since, grouped by error type,
 *                plus lessons you rated "lost me"; one tap re-tests them.
 *   Highlights – every highlight, by ink colour, linking back; any can become a cloze card.
 *   Bookmarks  – saved passages.
 *   Reports    – errors you reported in answers (checked in future answers on that topic).
 */
import { db } from './store.js';
import { $, $$, escapeHtml, toast, confirmDialog, formatDate, promptDialog } from './ui.js';
import { ERROR_TYPES } from './learner-model.js';
import { INKS } from './highlights.js';
import { addCards } from './flashcards.js';
import { startBankBlock } from './questions.js';
import { composeAndSend } from './chat.js';
import { renderMessage } from './render.js';
import { buildCloze } from './notebook-pure.js';
export { buildCloze };

let tab = 'mistakes';
const TABS = [
  ['mistakes', 'bi-x-octagon', 'Mistakes'],
  ['highlights', 'bi-highlighter', 'Highlights'],
  ['bookmarks', 'bi-bookmark', 'Bookmarks'],
  ['reports', 'bi-flag', 'Reports'],
];

export async function renderNotebook(params = {}) {
  if (TABS.some(([k]) => k === params.tab)) tab = params.tab;
  const page = $('#notebookPage');
  page.innerHTML = `<div class="page-head"><div><h2 class="page-title">Notebook</h2>
      <p class="page-sub">Your mistakes, highlights, bookmarks and reports, collected so nothing you flagged gets lost.</p></div></div>
    <div class="seg nb-tabs" role="tablist">${TABS.map(([k, icon, label]) => `<button type="button" class="seg-btn ${tab === k ? 'active' : ''}" data-tab="${k}" role="tab" aria-selected="${tab === k}"><i class="bi ${icon}"></i><span>${label}</span></button>`).join('')}</div>
    <div id="nbBody"><div class="text-body-secondary small">Loading…</div></div>`;
  $$('[data-tab]', page).forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    renderNotebook();
  }));
  const body = $('#nbBody');
  if (tab === 'mistakes') return renderMistakes(body);
  if (tab === 'highlights') return renderHighlights(body);
  if (tab === 'bookmarks') return renderBookmarks(body);
  return renderReports(body);
}

/* ------------------------------------------------------------------ links */
async function whereOf(target = '') {
  const [kind, id, page] = target.split(':');
  if (kind === 'msg') {
    const m = await db.get('messages', id);
    const chat = m ? await db.get('chats', m.chatId) : null;
    return { href: m ? `#/chat/${m.chatId}` : '#/chat', label: chat?.title || 'A lesson', message: m };
  }
  if (kind === 'doc') {
    const d = await db.get('documents', id);
    return { href: `#/viewer/${id}/${page || 1}`, label: `${d?.title || 'Document'}, p. ${page || 1}`, docId: id, page: Number(page) || 1 };
  }
  return { href: '#/chat', label: '' };
}

/* ------------------------------------------------------------------ mistakes */
/** Missed questions whose most recent attempt is still wrong. */
export async function openMistakes() {
  const attempts = (await db.all('attempts')).sort((a, b) => a.at - b.at);
  const latest = new Map();
  for (const a of attempts) latest.set(a.questionId, a);
  const out = [];
  for (const a of latest.values()) if (!a.correct) out.push(a);
  return out.sort((a, b) => b.at - a.at);
}

async function renderMistakes(body) {
  const misses = await openMistakes();
  const lost = (await db.all('messages')).filter((m) => m.rating === 'lost');
  if (!misses.length && !lost.length) {
    body.innerHTML = `<div class="empty-block"><i class="bi bi-emoji-smile"></i><p class="mb-1 fw-semibold">No open mistakes</p><p class="mb-0">Missed questions and lessons you rated "Lost me" collect here until you get them right.</p></div>`;
    return;
  }
  const groups = new Map();
  for (const a of misses) {
    const k = a.errorType || 'unclassified';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const questions = new Map();
  for (const a of misses) questions.set(a.questionId, await db.get('questions', a.questionId));
  body.innerHTML = `
    ${misses.length ? `<div class="nb-actions"><button class="btn btn-primary btn-sm" data-retest="all"><i class="bi bi-arrow-repeat me-1"></i>Re-test all ${misses.length}</button></div>` : ''}
    ${[...groups.entries()]
      .map(
        ([k, list]) => `<section class="nb-group"><h3 class="section-title">${escapeHtml(ERROR_TYPES[k]?.label || 'Not yet classified')} <small class="text-body-secondary fw-normal">${list.length}</small>
          <button class="btn btn-sm btn-link ms-1" data-retest="${k}">Re-test these</button></h3>
          ${list
            .map((a) => {
              const q = questions.get(a.questionId);
              if (!q) return '';
              const right = q.options?.find((o) => o.correct);
              const mine = q.options?.find((o) => o.id === a.chosen);
              return `<div class="nb-item"><b>${escapeHtml(q.concept)}</b><p class="mb-1 small">${escapeHtml(q.stem.slice(0, 180))}…</p>
                <div class="small"><span class="text-danger">You: ${escapeHtml(mine?.text || '—')}</span> · <span class="text-success">Answer: ${escapeHtml(right?.text || '')}</span></div>
                <div class="small text-body-secondary">${formatDate(a.at)}</div></div>`;
            })
            .join('')}</section>`
      )
      .join('')}
    ${lost.length ? `<section class="nb-group"><h3 class="section-title">Lessons that lost you <small class="text-body-secondary fw-normal">${lost.length}</small></h3>
      ${lost.map((m) => `<div class="nb-item"><b>${escapeHtml(m.concept || 'Lesson')}</b><div><button class="btn btn-sm btn-outline-primary mt-1" data-relearn="${escapeHtml(m.concept || '')}">Explain it differently</button> <a class="btn btn-sm btn-link mt-1" href="#/chat/${m.chatId}">Open lesson</a></div></div>`).join('')}</section>` : ''}`;
  $$('[data-retest]', body).forEach((b) =>
    b.addEventListener('click', () => {
      const pickFrom = b.dataset.retest === 'all' ? misses : groups.get(b.dataset.retest) || [];
      startBankBlock([...new Set(pickFrom.map((a) => a.questionId))], 'Mistake re-test', 'tutor');
    })
  );
  $$('[data-relearn]', body).forEach((b) => b.addEventListener('click', () => composeAndSend(`I didn't understand ${b.dataset.relearn} the first time. Explain it differently, from first principles, one step at a time.`)));
}

/* ------------------------------------------------------------------ highlights + cloze */
async function renderHighlights(body) {
  const all = (await db.all('highlights')).sort((a, b) => b.createdAt - a.createdAt);
  if (!all.length) {
    body.innerHTML = `<div class="empty-block"><i class="bi bi-highlighter"></i><p class="mb-1 fw-semibold">No highlights yet</p><p class="mb-0">Select text in a lesson or document and tap an ink colour.</p></div>`;
    return;
  }
  const wheres = await Promise.all(all.map((h) => whereOf(h.target)));
  body.innerHTML = INKS.filter((ink) => all.some((h) => h.color === ink.key))
    .map(
      (ink) => `<section class="nb-group"><h3 class="section-title"><span class="ink-dot" style="background:${ink.color}"></span>${ink.label} <small class="text-body-secondary fw-normal">${all.filter((h) => h.color === ink.key).length}</small>
        <button class="btn btn-sm btn-link ms-1" data-cloze-all="${ink.key}">Make cards from all</button></h3>
        ${all
          .map((h, i) => [h, i])
          .filter(([h]) => h.color === ink.key)
          .map(
            ([h, i]) => `<div class="nb-item"><mark class="hl hl-${h.color}">${escapeHtml(h.text)}</mark>
              <div class="small mt-1"><a href="${wheres[i].href}">${escapeHtml(wheres[i].label)}</a> · ${formatDate(h.createdAt)}</div>
              <div class="mt-1"><button class="btn btn-sm btn-outline-primary" data-cloze="${i}"><i class="bi bi-input-cursor-text me-1"></i>Make a fill-in-the-blank card</button>
              <button class="btn btn-sm btn-link text-danger" data-del-hl="${h.id}">Remove</button></div></div>`
          )
          .join('')}</section>`
    )
    .join('');
  $$('[data-cloze]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      const i = Number(b.dataset.cloze);
      const n = await makeClozeCards([all[i]], [wheres[i]]);
      toast(n ? 'Card added to your flashcards.' : 'That card is already in your deck.', n ? 'success' : 'info', 2500);
    })
  );
  $$('[data-cloze-all]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      const idx = all.map((h, i) => i).filter((i) => all[i].color === b.dataset.clozeAll);
      const n = await makeClozeCards(idx.map((i) => all[i]), idx.map((i) => wheres[i]));
      toast(`${n} card${n === 1 ? '' : 's'} added.`, 'success', 2500);
    })
  );
  $$('[data-del-hl]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      await db.del('highlights', b.dataset.delHl);
      renderNotebook();
    })
  );
}

/** The full readable text a highlight came from, so a cloze card can use the whole sentence. */
async function contextText(where) {
  if (where.message) {
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-9999px;width:600px';
    document.body.appendChild(holder);
    try {
      await renderMessage(holder, where.message.content, { final: true, sources: where.message.sources || [] });
      return holder.innerText;
    } finally {
      holder.remove();
    }
  }
  if (where.docId) {
    const chunks = (await db.byIndex('chunks', 'docId', where.docId)).filter((c) => c.page === where.page);
    return chunks.map((c) => c.text).join(' ');
  }
  return '';
}

async function makeClozeCards(highlights, wheres) {
  const cards = [];
  for (let i = 0; i < highlights.length; i++) {
    const card = buildCloze(await contextText(wheres[i]), highlights[i].text);
    if (card) cards.push({ ...card, type: 'cloze' });
  }
  const concept = wheres[0]?.message?.concept || '';
  return addCards(cards, { concept, topic: wheres[0]?.label || '', source: 'highlight' });
}

/* ------------------------------------------------------------------ bookmarks */
async function renderBookmarks(body) {
  const all = (await db.all('bookmarks')).sort((a, b) => b.createdAt - a.createdAt);
  if (!all.length) {
    body.innerHTML = `<div class="empty-block"><i class="bi bi-bookmark"></i><p class="mb-1 fw-semibold">No bookmarks yet</p><p class="mb-0">Select a passage and tap the bookmark at the end of the ink palette.</p></div>`;
    return;
  }
  const wheres = await Promise.all(all.map((b) => whereOf(b.target)));
  body.innerHTML = all
    .map(
      (b, i) => `<div class="nb-item"><blockquote class="nb-quote">${escapeHtml(b.text)}</blockquote>
        ${b.note ? `<div class="small mb-1"><i class="bi bi-sticky me-1"></i>${escapeHtml(b.note)}</div>` : ''}
        <div class="small"><a href="${wheres[i].href}">${escapeHtml(wheres[i].label)}</a> · ${formatDate(b.createdAt)}</div>
        <div class="mt-1"><button class="btn btn-sm btn-link" data-note="${b.id}">${b.note ? 'Edit note' : 'Add note'}</button><button class="btn btn-sm btn-link" data-ask="${i}">Explain this</button><button class="btn btn-sm btn-link text-danger" data-del-bm="${b.id}">Remove</button></div></div>`
    )
    .join('');
  $$('[data-note]', body).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const bm = all.find((x) => x.id === btn.dataset.note);
      const note = await promptDialog('Note', bm.note || '', 'Your note on this passage');
      if (note === null) return;
      await db.put('bookmarks', { ...bm, note });
      renderNotebook();
    })
  );
  $$('[data-ask]', body).forEach((btn) => btn.addEventListener('click', () => composeAndSend(`Explain this passage in plain language, then the mechanism behind it:\n\n${all[Number(btn.dataset.ask)].text}`)));
  $$('[data-del-bm]', body).forEach((btn) =>
    btn.addEventListener('click', async () => {
      await db.del('bookmarks', btn.dataset.delBm);
      renderNotebook();
    })
  );
}

/* ------------------------------------------------------------------ reports */
async function renderReports(body) {
  const all = (await db.all('reports')).sort((a, b) => b.createdAt - a.createdAt);
  if (!all.length) {
    body.innerHTML = `<div class="empty-block"><i class="bi bi-flag"></i><p class="mb-1 fw-semibold">No reports</p><p class="mb-0">If an answer contains a mistake, tap the flag under it. Open reports are checked in future answers on that topic.</p></div>`;
    return;
  }
  body.innerHTML = all
    .map(
      (r) => `<div class="nb-item"><div class="d-flex gap-2 align-items-center"><b>${escapeHtml(r.concept || 'Answer')}</b><span class="badge ${r.status === 'resolved' ? 'text-bg-success' : 'text-bg-warning'}">${r.status === 'resolved' ? 'Resolved' : 'Open'}</span></div>
        <p class="mb-1">${escapeHtml(r.note)}</p><div class="small text-body-secondary">${formatDate(r.createdAt)}${r.chatId ? ` · <a href="#/chat/${r.chatId}">Open the answer</a>` : ''}</div>
        <div class="mt-1"><button class="btn btn-sm btn-link" data-toggle-rep="${r.id}">${r.status === 'resolved' ? 'Reopen' : 'Mark resolved'}</button><button class="btn btn-sm btn-link text-danger" data-del-rep="${r.id}">Delete</button></div></div>`
    )
    .join('');
  $$('[data-toggle-rep]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      const r = all.find((x) => x.id === b.dataset.toggleRep);
      await db.put('reports', { ...r, status: r.status === 'resolved' ? 'open' : 'resolved' });
      renderNotebook();
    })
  );
  $$('[data-del-rep]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('Delete report?', 'It will no longer be checked in future answers.'))) return;
      await db.del('reports', b.dataset.delRep);
      renderNotebook();
    })
  );
}
