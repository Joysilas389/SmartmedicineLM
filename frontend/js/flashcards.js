/*
 * Flashcards + spaced repetition (spec §36, §38). Scheduling lives in srs.js (FSRS by
 * default, SM-2 selectable). Every card is linked to a knowledge-graph concept and every
 * review feeds the learner model's recall score.
 */
import { db } from './store.js';
import { state } from './state.js';
import { $, escapeHtml, uid, toast, confirmDialog } from './ui.js';
import { getScheduler, GRADES, retrievability, migrateCard } from './srs.js';
import { resolveConcept, recordEvidence, syncReviewDates } from './knowledge-store.js';

const scheduler = () => getScheduler(state.settings.scheduler);
let session = null;

/**
 * Adds cards, skipping duplicates. `concept` (name) links them to the knowledge graph;
 * `source` records where they came from ('lesson' | 'question' | 'page').
 */
export async function addCards(cards, { chatId = null, topic = '', concept = '', system = '', source = 'lesson' } = {}) {
  const now = Date.now();
  const existing = new Set((await db.all('flashcards')).map((c) => c.q.trim().toLowerCase()));
  const node = resolveConcept(concept || topic, system);
  const fresh = cards
    .filter((c) => c.q && c.a && !existing.has(c.q.trim().toLowerCase()))
    .map((c) => ({
      id: uid('card'),
      q: c.q.trim(),
      a: c.a.trim(),
      type: c.type || '',
      topic: node?.name || topic,
      conceptId: node?.id || null,
      source,
      chatId,
      createdAt: now,
      due: now,
      state: 'new',
      reps: 0,
      lapses: 0,
      successes: 0,
      failures: 0,
    }));
  if (fresh.length) await db.putMany('flashcards', fresh);
  await updateDueBadge();
  return fresh.length;
}

export async function updateDueBadge() {
  const due = (await db.all('flashcards')).filter((c) => c.due <= Date.now()).length;
  const b = $('#dueBadge');
  b.textContent = due;
  b.classList.toggle('d-none', !due);
}

export async function renderFlashcards() {
  const page = $('#flashcardsPage');
  if (session) return renderReview();
  const cards = (await db.all('flashcards')).sort((a, b) => a.due - b.due);
  const due = cards.filter((c) => c.due <= Date.now());
  const learned = cards.filter((c) => (c.interval || 0) >= 21).length;
  syncReviewDates(cards).catch(() => {});
  page.innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Flashcards</h2>
      <p class="page-sub">Mechanism cards from your lessons and missed questions, scheduled with ${scheduler().name} so each comes back just before you'd forget it.</p>
    </div>
    ${due.length ? `<button class="btn btn-primary" id="startReview" type="button"><i class="bi bi-play-fill me-1"></i>Review ${due.length} due</button>` : ''}</div>
    <div class="stat-row">
      <div class="stat"><b>${cards.length}</b><span>cards</span></div>
      <div class="stat"><b>${due.length}</b><span>due now</span></div>
      <div class="stat"><b>${learned}</b><span>mature (21+ days)</span></div>
    </div>
    ${
      cards.length
        ? `<div class="table-responsive"><table class="table card-table align-middle"><thead><tr><th>Question</th><th class="d-none d-md-table-cell">Concept</th><th class="d-none d-sm-table-cell" title="Estimated chance you'd recall it right now">Recall now</th><th>Next review</th><th></th></tr></thead><tbody>
        ${cards
          .map(
            (c) => `<tr><td>${escapeHtml(c.q)}</td><td class="d-none d-md-table-cell text-body-secondary">${escapeHtml(c.topic || '')}</td>
          <td class="d-none d-sm-table-cell">${recallCell(c)}</td>
          <td class="text-nowrap">${c.due <= Date.now() ? '<span class="status status-processing">Due</span>' : new Date(c.due).toLocaleDateString()}</td>
          <td><button class="btn btn-icon" data-del-card="${c.id}" aria-label="Delete card"><i class="bi bi-trash"></i></button></td></tr>`
          )
          .join('')}</tbody></table></div>`
        : `<div class="empty-block"><i class="bi bi-stack"></i><p class="mb-1 fw-semibold">No cards yet</p><p class="mb-0">Ask for a lesson from zero; it ends with flashcards you can add here with one tap.</p></div>`
    }`;
  $('#startReview')?.addEventListener('click', () => {
    session = { queue: due.slice(0, 50), shown: false, done: 0 };
    renderReview();
  });
  page.querySelectorAll('[data-del-card]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('Delete card?', 'This card and its review history will be removed.'))) return;
      await db.del('flashcards', b.dataset.delCard);
      await updateDueBadge();
      renderFlashcards();
    })
  );
}

function renderReview() {
  const page = $('#flashcardsPage');
  const card = session.queue[0];
  if (!card) {
    const n = session.done;
    session = null;
    toast(`Review complete: ${n} card${n === 1 ? '' : 's'}.`, 'success');
    renderFlashcards();
    return;
  }
  page.innerHTML = `
    <div class="page-head"><div><h2 class="page-title">Review</h2><p class="page-sub">${session.queue.length} left in this session. Try to answer out loud before revealing.</p></div>
    <button class="btn btn-light" id="endReview" type="button">End session</button></div>
    <div class="review-card">
      <div class="review-face">${card.topic ? `<div class="small text-body-secondary mb-2">${escapeHtml(card.topic)}</div>` : ''}${escapeHtml(card.q)}
        ${session.shown ? `<div class="answer">${escapeHtml(card.a)}</div>` : ''}</div>
      ${
        session.shown
          ? `<div class="grade-row">${GRADES
              .map((g) => `<button class="btn ${g.key === 'again' ? 'btn-outline-danger' : g.key === 'good' ? 'btn-primary' : 'btn-outline-primary'}" data-grade="${g.grade}">${g.label}<small>${scheduler().preview(card, g.grade)}</small></button>`)
              .join('')}</div>`
          : `<button class="btn btn-primary w-100 mt-3" id="showAnswer" type="button">Show answer</button>`
      }
    </div>`;
  $('#endReview').addEventListener('click', () => {
    session = null;
    renderFlashcards();
  });
  $('#showAnswer')?.addEventListener('click', () => {
    session.shown = true;
    renderReview();
  });
  page.querySelectorAll('[data-grade]').forEach((b) =>
    b.addEventListener('click', async () => {
      const grade = Number(b.dataset.grade);
      const now = Date.now();
      const next = scheduler().next(migrateCard(card), grade, now);
      await db.put('flashcards', next);
      await db.put('reviews', { id: uid('rev'), cardId: card.id, conceptId: card.conceptId || null, grade, at: now, interval: next.interval, stability: next.stability ?? null });
      if (card.conceptId || card.topic) recordEvidence(card.conceptId ? { id: card.conceptId, name: card.topic, system: '' } : card.topic, { kind: 'card', grade }).catch(() => {});
      session.queue.shift();
      if (grade === 1) session.queue.push(next); // see it again this session
      else session.done++;
      session.shown = false;
      await updateDueBadge();
      renderReview();
    })
  );
}

function recallCell(c) {
  const r = retrievability(migrateCard(c));
  if (r == null) return '<span class="text-body-secondary">new</span>';
  const pct = Math.round(r * 100);
  const cls = pct >= 85 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-danger';
  return `<span class="${cls}">${pct}%</span>`;
}
