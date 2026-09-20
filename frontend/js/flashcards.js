/*
 * Flashcards + spaced repetition (spec §36, §38). The scheduler is a separate object
 * so SM-2 can later be swapped for FSRS or a SmartMedicine algorithm without touching the UI.
 */
import { db } from './store.js';
import { $, escapeHtml, uid, toast, confirmDialog } from './ui.js';

const DAY = 86400000;

export const SM2 = {
  id: 'sm2',
  grades: [
    { key: 'again', label: 'Again', q: 0 },
    { key: 'hard', label: 'Hard', q: 3 },
    { key: 'good', label: 'Good', q: 4 },
    { key: 'easy', label: 'Easy', q: 5 },
  ],
  next(card, q, now = Date.now()) {
    const c = { ...card };
    if (q < 3) {
      c.reps = 0;
      c.interval = 0;
      c.lapses = (c.lapses || 0) + 1;
      c.failures = (c.failures || 0) + 1;
      c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2);
      c.due = now + 10 * 60000;
    } else {
      c.reps = (c.reps || 0) + 1;
      c.successes = (c.successes || 0) + 1;
      const mult = q === 3 ? 0.8 : q === 5 ? 1.3 : 1;
      c.interval = c.reps === 1 ? 1 : c.reps === 2 ? (q === 5 ? 4 : 3) : Math.max(1, Math.round((c.interval || 1) * (c.ease || 2.5) * mult));
      c.ease = Math.max(1.3, (c.ease || 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
      c.due = now + c.interval * DAY;
    }
    c.lastReview = now;
    return c;
  },
  preview(card, q) {
    const n = this.next(card, q);
    const ms = n.due - Date.now();
    return ms < DAY ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / DAY)} d`;
  },
};

const scheduler = SM2;
let session = null;

export async function addCards(cards, { chatId = null, topic = '' } = {}) {
  const now = Date.now();
  const existing = new Set((await db.all('flashcards')).map((c) => c.q.trim().toLowerCase()));
  const fresh = cards
    .filter((c) => c.q && c.a && !existing.has(c.q.trim().toLowerCase()))
    .map((c) => ({ id: uid('card'), q: c.q.trim(), a: c.a.trim(), type: c.type || '', topic, chatId, createdAt: now, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, successes: 0, failures: 0 }));
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
  page.innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Flashcards</h2>
      <p class="page-sub">Mechanism cards saved from your lessons, scheduled with spaced repetition so you review each one just before you'd forget it.</p>
    </div>
    ${due.length ? `<button class="btn btn-primary" id="startReview" type="button"><i class="bi bi-play-fill me-1"></i>Review ${due.length} due</button>` : ''}</div>
    <div class="stat-row">
      <div class="stat"><b>${cards.length}</b><span>cards</span></div>
      <div class="stat"><b>${due.length}</b><span>due now</span></div>
      <div class="stat"><b>${learned}</b><span>mature (21+ days)</span></div>
    </div>
    ${
      cards.length
        ? `<div class="table-responsive"><table class="table card-table align-middle"><thead><tr><th>Question</th><th class="d-none d-md-table-cell">Topic</th><th>Next review</th><th></th></tr></thead><tbody>
        ${cards
          .map(
            (c) => `<tr><td>${escapeHtml(c.q)}</td><td class="d-none d-md-table-cell text-body-secondary">${escapeHtml(c.topic || '')}</td>
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
          ? `<div class="grade-row">${scheduler.grades
              .map((g) => `<button class="btn ${g.key === 'again' ? 'btn-outline-danger' : g.key === 'good' ? 'btn-primary' : 'btn-outline-primary'}" data-grade="${g.q}">${g.label}<small>${scheduler.preview(card, g.q)}</small></button>`)
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
      const q = Number(b.dataset.grade);
      const next = scheduler.next(card, q);
      await db.put('flashcards', next);
      session.queue.shift();
      if (q < 3) session.queue.push(next); // see it again this session
      else session.done++;
      session.shown = false;
      await updateDueBadge();
      renderReview();
    })
  );
}
