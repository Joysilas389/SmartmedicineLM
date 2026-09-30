/*
 * Today (one-screen daily session), Search (everything at once), Practice (worked
 * calculations and image reading) and Import (study-group share links).
 */
import { db } from './store.js';
import { state } from './state.js';
import { $, $$, escapeHtml, toast, uid } from './ui.js';
import { graph, records, loadKnowledge, recordEvidence } from './knowledge-store.js';
import { mastery, status } from './learner-model.js';
import { groupCards } from './card-taxonomy.js';
import { startReview, addCards } from './flashcards.js';
import { startBankBlock } from './questions.js';
import { composeAndSend } from './chat.js';
import { openMistakes } from './notebook.js';
import { CALCS, makeProblem, checkAnswer } from './calc.js';
import { decodeShare } from './share.js';
import { search as searchLibrary } from './retrieval.js';
import { examLabel } from './exams.js';
import { imageFromLibrary } from './viewer.js';
import { scoreText } from './notebook-pure.js';

const DAY = 86400000;
const calcOfToday = () => Object.keys(CALCS)[Math.floor(Date.now() / DAY) % Object.keys(CALCS).length];

/* ================================================================== TODAY */
export async function renderToday() {
  await loadKnowledge();
  const now = Date.now();
  const cards = await db.all('flashcards');
  const due = cards.filter((c) => (c.due || 0) <= now);
  const decks = groupCards(due).basic.concat(groupCards(due).clinical).sort((a, b) => b.due - a.due).slice(0, 3);
  const weak = graph
    .all()
    .map((c) => ({ c, r: records.get(c.id) }))
    .filter(({ r }) => ['critical', 'review'].includes(status(r)))
    .sort((a, b) => mastery(a.r) - mastery(b.r))
    .slice(0, 3);
  const mistakes = await openMistakes();
  const plan = state.settings.studyPlan;
  const daysLeft = plan?.examDate ? Math.ceil((new Date(`${plan.examDate}T00:00:00`) - now) / DAY) : null;
  const scores = (await db.all('scores')).sort((a, b) => b.date - a.date);
  const calcKey = calcOfToday();
  const minutes = Math.round(Math.min(due.length, 60) * 0.4 + (mistakes.length ? Math.min(mistakes.length, 10) * 1.5 : 0) + 15 + (weak.length ? 15 : 0) + 5);
  const hour = new Date().getHours();

  $('#todayPage').innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h2>
      <p class="page-sub">${daysLeft != null && daysLeft >= 0 ? `<b>${daysLeft} day${daysLeft === 1 ? '' : 's'}</b> to ${escapeHtml(plan.exam || examLabel())}. ` : ''}Today's session is about <b>${minutes} minutes</b>. Work top to bottom.${scores[0] ? ` Last practice exam: <b>${escapeHtml(String(scores[0].score))}</b> (${escapeHtml(scores[0].form || scores[0].exam)}).` : ''}</p>
    </div></div>
    <div class="today-list">
      ${task(1, 'bi-stack', due.length ? `Review ${due.length} due flashcard${due.length === 1 ? '' : 's'}` : 'No flashcards due', due.length ? `Mixed across decks${decks.length ? `: ${decks.map((d) => `${d.deck} (${d.due})`).join(', ')}` : ''}. About ${Math.max(1, Math.round(Math.min(due.length, 60) * 0.4))} min.` : 'Nothing is due. Make cards from a lesson or your highlights.', due.length ? `<button class="btn btn-primary btn-sm" data-t="cards">Start review</button>` : '')}
      ${task(2, 'bi-x-octagon', mistakes.length ? `Re-test ${mistakes.length} open mistake${mistakes.length === 1 ? '' : 's'}` : 'No open mistakes', mistakes.length ? 'Questions you missed and have not yet got right. Getting them right closes them.' : 'Missed questions will appear here until you answer them correctly.', mistakes.length ? `<button class="btn btn-primary btn-sm" data-t="mistakes">Re-test</button>` : '')}
      ${task(3, 'bi-shuffle', 'Mixed practice: 10 questions', weak.length ? 'Drawn from your weak areas across systems, mixed together: mixing topics is harder now and pays off on exam day.' : 'Mixed across systems.', `<button class="btn btn-outline-primary btn-sm" data-t="mixed">Start</button>`)}
      ${weak.length ? task(4, 'bi-mortarboard', 'Re-learn your weakest concepts', weak.map(({ c, r }) => `${c.name} (${Math.round(mastery(r) * 100)}%)`).join(' · '), weak.map(({ c }, i) => `<button class="btn btn-outline-primary btn-sm" data-t="learn" data-i="${i}">${escapeHtml(c.name)}</button>`).join('')) : ''}
      ${task(weak.length ? 5 : 4, 'bi-calculator', `Calculation drill: ${CALCS[calcKey].title}`, 'One worked calculation with fresh numbers. Three minutes.', `<a class="btn btn-outline-primary btn-sm" href="#/practice?calc=${calcKey}">Start</a>`)}
    </div>
    <p class="small text-body-secondary mt-3">The session adapts every day to what is due, what you missed and where your progress is weakest.</p>`;
  const p = $('#todayPage');
  $('[data-t="cards"]', p)?.addEventListener('click', () => startReview(null));
  $('[data-t="mistakes"]', p)?.addEventListener('click', () => startBankBlock([...new Set(mistakes.map((m) => m.questionId))].slice(0, 20), 'Mistake re-test'));
  $('[data-t="mixed"]', p)?.addEventListener('click', () => (location.hash = `#/questions?source=${weak.length ? 'weak' : 'topics'}&count=10&mode=tutor`));
  $$('[data-t="learn"]', p).forEach((b) => b.addEventListener('click', () => composeAndSend(`Teach me ${weak[Number(b.dataset.i)].c.name} from absolute zero.`)));
}

const task = (n, icon, title, sub, actions) => `<section class="today-task"><div class="today-num">${n}</div>
  <div class="today-main"><div class="today-title"><i class="bi ${icon} me-2"></i>${escapeHtml(title)}</div><div class="small text-body-secondary">${sub}</div>
  ${actions ? `<div class="today-actions">${actions}</div>` : ''}</div></section>`;

/* ================================================================== SEARCH */
let searchQuery = '';

export async function renderSearch(params = {}) {
  if (params.q !== undefined) searchQuery = params.q;
  $('#searchPage').innerHTML = `<div class="page-head"><div><h2 class="page-title">Search</h2><p class="page-sub">Across your lessons, flashcards, questions, highlights, bookmarks and library.</p></div></div>
    <div class="search-wrap mb-3"><i class="bi bi-search"></i><input type="search" class="form-control" id="globalSearch" placeholder="Search everything" value="${escapeHtml(searchQuery)}" aria-label="Search everything" autofocus></div>
    <div id="searchResults"></div>`;
  const input = $('#globalSearch');
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      searchQuery = input.value;
      runSearch(searchQuery);
    }, 250);
  });
  if (searchQuery) runSearch(searchQuery);
}

function snippet(text, terms, len = 160) {
  const t = text.replace(/\s+/g, ' ');
  const i = Math.max(0, t.toLowerCase().indexOf(terms[0]) - 50);
  let s = escapeHtml((i ? '…' : '') + t.slice(i, i + len) + (t.length > i + len ? '…' : ''));
  for (const term of terms) s = s.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  return s;
}

async function runSearch(q) {
  const box = $('#searchResults');
  const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!terms.length) {
    box.innerHTML = '';
    return;
  }
  const [chats, messages, cards, questions, highlights, bookmarks, docs] = await Promise.all(
    ['chats', 'messages', 'flashcards', 'questions', 'highlights', 'bookmarks', 'documents'].map((s) => db.all(s))
  );
  const chatTitle = new Map(chats.map((c) => [c.id, c.title]));
  const top = (list, text, n = 6) => list.map((x) => ({ x, s: scoreText(text(x), terms) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map((r) => r.x);
  const sections = [
    ['Lessons & chats', top(messages.filter((m) => m.role === 'assistant' && !m.error), (m) => m.content, 8).map((m) => ({ href: `#/chat/${m.chatId}`, title: chatTitle.get(m.chatId) || 'Chat', text: m.content }))],
    ['Flashcards', top(cards, (c) => `${c.q} ${c.a} ${c.topic || ''}`).map((c) => ({ href: '#/flashcards', title: c.q, text: c.a }))],
    ['Questions', top(questions, (x) => `${x.concept} ${x.stem}`).map((x) => ({ href: '#/questions', title: x.concept, text: x.stem }))],
    ['Highlights', top(highlights, (h) => h.text).map((h) => ({ href: '#/notebook?tab=highlights', title: 'Highlight', text: h.text }))],
    ['Bookmarks', top(bookmarks, (b) => `${b.text} ${b.note || ''}`).map((b) => ({ href: '#/notebook?tab=bookmarks', title: 'Bookmark', text: b.text }))],
    ['Concepts', graph.all().map((c) => ({ c, s: scoreText(`${c.name} ${c.aliases.join(' ')}`, terms) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(({ c }) => ({ href: `#/knowledge/${c.id}`, title: c.name, text: c.system }))],
  ];
  let lib = [];
  try {
    lib = (await searchLibrary(q, { k: 5 })).map((h) => ({ href: `#/viewer/${h.chunk.docId}/${h.chunk.page || 1}`, title: `${docs.find((d) => d.id === h.chunk.docId)?.title || 'Document'}, p. ${h.chunk.page || 1}`, text: h.chunk.text }));
  } catch { /* library search is optional */ }
  sections.push(['Library documents', lib]);
  const shown = sections.filter(([, list]) => list.length);
  box.innerHTML = shown.length
    ? shown.map(([name, list]) => `<section class="nb-group"><h3 class="section-title">${name} <small class="text-body-secondary fw-normal">${list.length}</small></h3>
        ${list.map((r) => `<a class="search-hit" href="${r.href}"><b>${escapeHtml(r.title.slice(0, 120))}</b><span>${snippet(r.text || '', terms)}</span></a>`).join('')}</section>`).join('')
    : `<p class="text-body-secondary">Nothing matches "${escapeHtml(q)}".</p>`;
}

/* ================================================================== PRACTICE */
let practice = { tab: 'calc', key: null, problem: null, done: 0, right: 0 };

export async function renderPractice(params = {}) {
  if (params.calc && CALCS[params.calc]) {
    practice = { ...practice, tab: 'calc', key: params.calc, problem: null };
  }
  const page = $('#practicePage');
  page.innerHTML = `<div class="page-head"><div><h2 class="page-title">Practice</h2><p class="page-sub">Worked calculations with fresh numbers every time, and reading practice on your own images.</p></div></div>
    <div class="seg nb-tabs" role="tablist">
      <button type="button" class="seg-btn ${practice.tab === 'calc' ? 'active' : ''}" data-ptab="calc"><i class="bi bi-calculator"></i><span>Calculations</span></button>
      <button type="button" class="seg-btn ${practice.tab === 'images' ? 'active' : ''}" data-ptab="images"><i class="bi bi-image"></i><span>Image reading</span></button>
    </div><div id="practiceBody"></div>`;
  $$('[data-ptab]', page).forEach((b) => b.addEventListener('click', () => {
    practice.tab = b.dataset.ptab;
    renderPractice();
  }));
  if (practice.tab === 'calc') renderCalc();
  else renderImagePractice();
}

function renderCalc() {
  const body = $('#practiceBody');
  if (!practice.problem) practice.problem = makeProblem(practice.key || Object.keys(CALCS)[Math.floor(Math.random() * Object.keys(CALCS).length)]);
  const p = practice.problem;
  body.innerHTML = `<div class="builder-grid mb-3"><div class="span-2"><label class="form-label small" for="calcType">Calculation</label>
      <select class="form-select form-select-sm" id="calcType"><option value="">Mixed (random)</option>${Object.entries(CALCS).map(([k, c]) => `<option value="${k}" ${practice.key === k ? 'selected' : ''}>${c.title}</option>`).join('')}</select></div>
      <div class="small text-body-secondary align-self-end">${practice.done ? `${practice.right}/${practice.done} right this session` : ''}</div></div>
    <article class="q-card"><div class="q-meta">${escapeHtml(p.title)}</div><p class="q-stem">${escapeHtml(p.prompt)}</p>
      <div class="calc-answer"><input class="form-control" id="calcInput" inputmode="decimal" placeholder="Your answer" aria-label="Your answer"><span class="calc-unit">${escapeHtml(p.unit)}</span>
      <button class="btn btn-primary" id="calcCheck">Check</button></div>
      <div id="calcResult"></div></article>`;
  $('#calcType').addEventListener('change', (e) => {
    practice.key = e.target.value || null;
    practice.problem = null;
    renderCalc();
  });
  const check = async () => {
    const r = checkAnswer(p, $('#calcInput').value);
    if (!r.valid) return toast('Type a number.', 'warning', 1500);
    practice.done++;
    if (r.correct) practice.right++;
    $('#calcResult').innerHTML = `<div class="verdict ${r.correct ? 'ok' : 'bad'} mt-3"><i class="bi ${r.correct ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i><div><b>${r.correct ? 'Correct' : 'Not quite'}</b><div class="small">Answer: <b>${p.answer} ${escapeHtml(p.unit)}</b>${r.correct ? '' : ` (you entered ${r.value})`}</div></div></div>
      <ol class="calc-steps">${p.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
      <div class="d-flex gap-2 flex-wrap"><button class="btn btn-primary btn-sm" id="calcNext">Next problem</button><button class="btn btn-outline-primary btn-sm" id="calcWhy">Explain the concept behind it</button></div>`;
    $('#calcCheck').disabled = true;
    recordEvidence(p.topic, { kind: 'question', correct: r.correct, confidence: 'unsure' }).catch(() => {});
    $('#calcNext').addEventListener('click', () => {
      practice.problem = null;
      renderCalc();
    });
    $('#calcWhy').addEventListener('click', () => composeAndSend(`Explain the concept behind the ${p.title} calculation from first principles: why each term is in the formula and what the result means clinically.`));
  };
  $('#calcCheck').addEventListener('click', check);
  $('#calcInput').addEventListener('keydown', (e) => e.key === 'Enter' && check());
}

async function renderImagePractice() {
  const body = $('#practiceBody');
  const images = state.documents.filter((d) => d.fileType === 'image' && d.status === 'ready');
  const boards = (await db.all('boards')).filter((b) => b.bg);
  body.innerHTML = `<div class="note-box small mb-3"><i class="bi bi-info-circle me-1"></i>Practise on your own images: ECGs, X-rays, slides or photos you have added to the Library, and whiteboards with a background image. The app does not come with an image bank, because medical images need permission to reuse; open-licence collections (for example Wikimedia Commons) are a good place to find them.</div>
    ${images.length || boards.length ? `<div class="kn-grid">${images.map((d) => `<button class="kn-card text-start" data-img="${d.id}"><i class="bi bi-image"></i><span class="min-w-0"><b class="text-truncate d-block">${escapeHtml(d.title)}</b><small class="text-body-secondary">Read it first, then get graded</small></span></button>`).join('')}
      ${boards.map((b) => `<a class="kn-card" href="#/whiteboard/${b.id}"><i class="bi bi-easel"></i><span class="min-w-0"><b class="text-truncate d-block">${escapeHtml(b.title)}</b><small class="text-body-secondary">Annotated whiteboard</small></span></a>`).join('')}</div>`
      : `<div class="empty-block"><i class="bi bi-images"></i><p class="mb-1 fw-semibold">No images yet</p><p class="mb-0">Add images in the <a href="#/library">Library</a> and they appear here for reading practice.</p></div>`}`;
  $$('[data-img]', body).forEach((b) =>
    b.addEventListener('click', async () => {
      const doc = state.documents.find((d) => d.id === b.dataset.img);
      try {
        const img = await imageFromLibrary(doc);
        composeAndSend('I want to read this image myself first.', { images: [img], imageTask: 'quiz' });
      } catch {
        toast('This image is not on this device.', 'warning');
      }
    })
  );
}

/* ================================================================== IMPORT (share links) */
export async function renderImport(params = {}) {
  const page = $('#importPage');
  page.innerHTML = '<p class="text-body-secondary">Reading the shared link…</p>';
  let data;
  try {
    data = await decodeShare(params.d || '');
  } catch (err) {
    page.innerHTML = `<div class="msg-error"><strong>This link could not be opened.</strong> ${escapeHtml(err.message)}</div>`;
    return;
  }
  const isCards = data.kind === 'cards';
  page.innerHTML = `<div class="page-head"><div><h2 class="page-title">${escapeHtml(data.title || (isCards ? 'Shared flashcards' : 'Shared questions'))}</h2>
    <p class="page-sub">Shared with you: ${data.items.length} ${isCards ? 'flashcards' : 'questions'}. Adding them copies them into your own library on this device.</p></div></div>
    <div class="nb-group">${data.items.slice(0, 8).map((it) => `<div class="nb-item"><b>${escapeHtml(isCards ? it.q : it.concept)}</b><div class="small text-body-secondary">${escapeHtml((isCards ? it.a : it.stem).slice(0, 160))}</div></div>`).join('')}
    ${data.items.length > 8 ? `<p class="small text-body-secondary">…and ${data.items.length - 8} more.</p>` : ''}</div>
    <button class="btn btn-primary" id="importGo">${isCards ? `Add ${data.items.length} cards to my flashcards` : `Add ${data.items.length} questions and start`}</button>`;
  $('#importGo').addEventListener('click', async () => {
    if (isCards) {
      const n = await addCards(data.items.map((c) => ({ q: c.q, a: c.a })), { topic: data.items[0]?.topic || '', source: 'shared' });
      toast(`${n} new card${n === 1 ? '' : 's'} added${n < data.items.length ? ' (duplicates skipped)' : ''}.`, 'success');
      location.hash = '#/flashcards';
    } else {
      const qs = data.items.map((q) => ({ ...q, id: `q_${uid()}`, createdAt: Date.now(), sourceMap: {} }));
      await db.putMany('questions', qs);
      startBankBlock(qs.map((q) => q.id), data.title || 'Shared block', 'tutor');
    }
  });
}
