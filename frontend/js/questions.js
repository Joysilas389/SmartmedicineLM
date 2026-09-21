/*
 * Question engine (spec §26), error analysis (§27) and exam mode (§51).
 * Workflow: question → answer (+ confidence) → correct/incorrect → why the answer is right →
 * why every distractor is wrong → what would make each distractor right → mechanism →
 * error classification → knowledge gap / prerequisites → flashcard → spaced repetition.
 */
import { state } from './state.js';
import { db } from './store.js';
import { $, $$, escapeHtml, uid, toast, confirmDialog, formatDate } from './ui.js';
import { parseQuestions, countStems } from './question-parse.js';
import { graph, records, loadKnowledge, recordEvidence } from './knowledge-store.js';
import { ERROR_TYPES, mastery, status, bottlenecks, errorBreakdown } from './learner-model.js';
import { SYSTEMS } from './graph-seed.js';
import { search } from './retrieval.js';
import { renderMessage } from './render.js';
import { addCards } from './flashcards.js';
import { composeAndSend } from './chat.js';
import { EXAMS, examKey, examShort, currentExam } from './exams.js';

const FIRST_BATCH = 2; // start answering sooner
const BATCH = 3; // small batches never hit the length limit
const MAX_EMPTY_BATCHES = 2;
const SECONDS_PER_QUESTION = 90;
let view = { name: 'home' }; // home | session | results
let block = null; // active block record
let bank = new Map(); // questionId -> question
let timer = null;
let generating = null; // AbortController
let form = { exam: null, source: 'topics', topic: '', system: '', count: 5, mode: 'tutor', difficulty: 'mixed', docId: '', sourceLocked: false };

const page = () => $('#questionsPage');

/* ============================== entry ============================== */
export async function renderQuestions(params = {}) {
  await loadKnowledge();
  clearInterval(timer);
  if (params.concept || params.system || params.source) {
    form.source = ['topics', 'weak', 'library', 'bank'].includes(params.source) ? params.source : 'topics';
    form.topic = params.concept || '';
    if (params.system !== undefined) form.system = SYSTEMS.includes(params.system) ? params.system : '';
    if ([5, 10, 20].includes(Number(params.count))) form.count = Number(params.count);
    if (['tutor', 'exam'].includes(params.mode)) form.mode = params.mode;
    if (view.name !== 'session') view = { name: 'home' };
  }
  if (view.name === 'session' && block) return renderSession();
  if (view.name === 'results' && block) return renderResults();
  return renderHome();
}

/* ============================== home ============================== */
async function renderHome() {
  view = { name: 'home' };
  const [blocks, attempts, questions] = await Promise.all([db.all('blocks'), db.all('attempts'), db.all('questions')]);
  blocks.sort((a, b) => b.createdAt - a.createdAt);
  const active = blocks.find((b) => b.status === 'active');
  const correct = attempts.filter((a) => a.correct).length;
  const docs = state.documents.filter((d) => d.status === 'ready' && d.fileType !== 'image');
  const seen = new Set(attempts.map((a) => a.questionId));
  const unseen = questions.filter((q) => !seen.has(q.id)).length;
  const missed = new Set(attempts.filter((a) => !a.correct).map((a) => a.questionId));

  page().innerHTML = `
    <div class="page-head"><div>
      <h2 class="page-title">Questions</h2>
      <p class="page-sub">USMLE-style vignettes that train clue → mechanism → diagnosis → prediction. Every miss is analysed, linked to its prerequisites and turned into a flashcard.</p>
    </div></div>

    ${active ? `<div class="resume-card"><div><b>Block in progress</b><div class="small text-body-secondary">${escapeHtml(active.label)} · ${Object.keys(active.answers || {}).length}/${active.questionIds.length} answered</div></div>
      <div class="d-flex gap-2"><button class="btn btn-sm btn-outline-secondary" data-q="discard" data-id="${active.id}">Discard</button><button class="btn btn-sm btn-primary" data-q="resume" data-id="${active.id}">Resume</button></div></div>` : ''}

    <div class="stat-row">
      <div class="stat"><b>${attempts.length}</b><span>answered</span></div>
      <div class="stat"><b>${attempts.length ? Math.round((correct / attempts.length) * 100) + '%' : '–'}</b><span>correct</span></div>
      <div class="stat"><b>${questions.length}</b><span>in your bank</span></div>
    </div>

    <section class="builder">
      <h3 class="builder-title">New block</h3>
      <div class="seg" role="tablist" aria-label="Question source">
        ${[
          ['topics', 'bi-bullseye', 'Topics'],
          ['weak', 'bi-activity', 'Weak areas'],
          ['library', 'bi-journal-medical', 'My library'],
          ['bank', 'bi-archive', 'Question bank'],
        ]
          .map(([k, icon, label]) => `<button type="button" class="seg-btn ${form.source === k ? 'active' : ''}" data-source="${k}" role="tab" aria-selected="${form.source === k}"><i class="bi ${icon}"></i><span>${label}</span></button>`)
          .join('')}
      </div>
      <div class="builder-body">${sourceFields(docs, unseen, missed.size)}</div>
      <div class="builder-grid">
        <div><label class="form-label small" for="qExam">Exam</label>
          <select class="form-select form-select-sm" id="qExam">${Object.entries(EXAMS).map(([k, v]) => `<option value="${k}" ${(form.exam || currentExam()) === k ? 'selected' : ''}>${v.short}</option>`).join('')}</select></div>
        <div><label class="form-label small" for="qCount">Questions</label>
          <select class="form-select form-select-sm" id="qCount">${[5, 10, 20].map((n) => `<option ${form.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div><label class="form-label small" for="qMode">Mode</label>
          <select class="form-select form-select-sm" id="qMode">
            <option value="tutor" ${form.mode === 'tutor' ? 'selected' : ''}>Tutor</option>
            <option value="exam" ${form.mode === 'exam' ? 'selected' : ''}>Timed exam</option>
          </select></div>
        <div ${form.source === 'bank' ? 'hidden' : ''}><label class="form-label small" for="qDiff">Difficulty</label>
          <select class="form-select form-select-sm" id="qDiff">${['mixed', 'easy', 'medium', 'hard'].map((d) => `<option value="${d}" ${form.difficulty === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></div>
      </div>
      <button class="btn btn-primary mt-3" data-q="start" type="button"><i class="bi bi-play-fill me-1"></i>Start block</button>
      <p class="small text-body-secondary mt-2 mb-0">${form.mode === 'exam' ? `${SECONDS_PER_QUESTION} seconds per question, answers revealed after the block.` : 'Answers and full explanations after each question.'}</p>
    </section>

    ${
      blocks.filter((b) => b.status === 'done').length
        ? `<h3 class="section-title mt-4">Past blocks</h3><div class="block-list">${blocks
            .filter((b) => b.status === 'done')
            .slice(0, 20)
            .map(
              (b) => `<button class="block-row" data-q="open" data-id="${b.id}">
                <span class="score ${scoreClass(b.score)}">${b.score != null ? Math.round(b.score * 100) + '%' : '–'}</span>
                <span class="min-w-0"><b class="text-truncate d-block">${escapeHtml(b.label)}</b><small class="text-body-secondary">${formatDate(b.createdAt)} · ${b.questionIds.length} questions · ${b.mode === 'exam' ? 'Timed' : 'Tutor'}</small></span>
                <i class="bi bi-chevron-right ms-auto"></i></button>`
            )
            .join('')}</div>`
        : ''
    }`;

  bindHome(docs);
}

function sourceFields(docs, unseen, missedCount) {
  const conceptOptions = graph
    .all()
    .map((c) => `<option value="${escapeHtml(c.name)}"></option>`)
    .join('');
  if (form.source === 'topics')
    return `<div class="builder-grid">
      <div class="span-2"><label class="form-label small" for="qTopic">Topic <span class="text-body-secondary">(optional)</span></label>
        <input class="form-control form-control-sm" id="qTopic" list="conceptList" placeholder="e.g. nephrotic syndrome, or leave blank" value="${escapeHtml(form.topic)}"><datalist id="conceptList">${conceptOptions}</datalist></div>
      <div><label class="form-label small" for="qSystem">System</label>
        <select class="form-select form-select-sm" id="qSystem"><option value="">All systems</option>${SYSTEMS.map((s) => `<option ${form.system === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></div>
    </div>`;
  if (form.source === 'weak') {
    const weak = weakTopics();
    return weak.length
      ? `<p class="small mb-1">Built from your learner model: the concepts you're weakest on and the prerequisites underneath them.</p>
         <div class="chip-row">${weak.map((w) => `<span class="concept-chip st-${w.status}">${escapeHtml(w.name)}</span>`).join('')}</div>`
      : `<div class="note-box"><i class="bi bi-info-circle me-2"></i>No weak areas yet. Answer some questions or rate a few lessons first, and this will target what you're struggling with.</div>`;
  }
  if (form.source === 'library')
    return docs.length
      ? `<div class="builder-grid">
          <div class="span-2"><label class="form-label small" for="qDoc">Document</label>
            <select class="form-select form-select-sm" id="qDoc">${docs.map((d) => `<option value="${d.id}" ${form.docId === d.id ? 'selected' : ''}>${escapeHtml(d.title)}</option>`).join('')}</select></div>
          <div><label class="form-label small" for="qDocTopic">Focus <span class="text-body-secondary">(optional)</span></label>
            <input class="form-control form-control-sm" id="qDocTopic" placeholder="e.g. chapter topic" value="${escapeHtml(form.topic)}"></div>
        </div>
        <div class="form-check form-switch mt-2"><input class="form-check-input" type="checkbox" id="qLocked" ${form.sourceLocked ? 'checked' : ''}>
          <label class="form-check-label small" for="qLocked">Source-locked: answers must be supported by this document</label></div>`
      : `<div class="note-box"><i class="bi bi-info-circle me-2"></i>Upload a PDF or notes in the Library first.</div>`;
  return `<p class="small mb-0">Reuses questions already in your bank, with no model cost: <b>${unseen}</b> not yet answered and <b>${missedCount}</b> previously missed. Missed questions come first.</p>`;
}

function bindHome() {
  const p = page();
  $$('[data-source]', p).forEach((b) =>
    b.addEventListener('click', () => {
      readForm();
      form.source = b.dataset.source;
      renderHome();
    })
  );
  $('#qMode', p)?.addEventListener('change', () => {
    readForm();
    renderHome();
  });
  $$('[data-q]', p).forEach((b) => b.addEventListener('click', () => homeAction(b.dataset.q, b.dataset.id)));
}

function readForm() {
  const p = page();
  const v = (id) => $(id, p)?.value;
  form.topic = (v('#qTopic') ?? v('#qDocTopic') ?? form.topic ?? '').trim();
  form.system = v('#qSystem') ?? form.system;
  form.count = Number(v('#qCount') || form.count);
  form.exam = examKey(v('#qExam') || form.exam || currentExam());
  form.mode = v('#qMode') || form.mode;
  form.difficulty = v('#qDiff') || form.difficulty;
  form.docId = v('#qDoc') || form.docId;
  form.sourceLocked = $('#qLocked', p)?.checked ?? form.sourceLocked;
}

async function homeAction(action, id) {
  if (action === 'start') {
    readForm();
    return startBlock();
  }
  if (action === 'resume' || action === 'open') {
    block = await db.get('blocks', id);
    if (!block) return renderHome();
    await loadBank(block.questionIds);
    view = { name: block.status === 'done' ? 'results' : 'session', index: firstUnanswered() };
    return block.status === 'done' ? renderResults() : renderSession();
  }
  if (action === 'discard') {
    if (!(await confirmDialog('Discard this block?', 'Answers you gave in it are kept in your statistics; the block itself is removed.', 'Discard'))) return;
    await db.del('blocks', id);
    block = null;
    renderHome();
  }
}

/* ============================== building a block ============================== */
function weakTopics() {
  const rated = graph
    .all()
    .map((c) => ({ c, rec: records.get(c.id), m: mastery(records.get(c.id)) }))
    .filter((x) => x.m != null && ['critical', 'review', 'moderate'].includes(status(x.rec)))
    .sort((a, b) => a.m - b.m)
    .slice(0, 4)
    .map((x) => ({ name: x.c.name, system: x.c.system, status: status(x.rec) }));
  const bn = bottlenecks(graph, records, 3)
    .filter((b) => !rated.some((r) => r.name === b.concept.name))
    .map((b) => ({ name: b.concept.name, system: b.concept.system, status: status(records.get(b.concept.id)) }));
  return [...rated, ...bn].slice(0, 6);
}

function randomConcepts(system, n) {
  const pool = system ? graph.bySystem(system) : graph.all().filter((c) => c.system !== 'Foundations');
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).map((c) => ({ name: c.name, system: c.system }));
}

async function libraryPassages(docId, focus) {
  const doc = state.documents.find((d) => d.id === docId);
  if (!doc) return [];
  let chunks;
  if (focus) chunks = (await search(focus, { docIds: [docId], k: 8 })).map((h) => h.chunk);
  else {
    const all = (await db.byIndex('chunks', 'docId', docId)).filter((c) => c.text.length > 250).sort((a, b) => a.page - b.page || a.order - b.order);
    const step = Math.max(1, Math.floor(all.length / 8));
    chunks = all.filter((_, i) => i % step === 0).sort(() => Math.random() - 0.5).slice(0, 8);
  }
  return chunks.map((c, i) => ({ tag: `S${i + 1}`, docId, docName: doc.title, page: c.page, section: c.section || '', text: c.text }));
}

async function startBlock() {
  const count = form.count;
  let label = '';
  let request = null;
  let ids = [];

  if (form.source === 'bank') {
    const [questions, attempts] = await Promise.all([db.all('questions'), db.all('attempts')]);
    const seen = new Set(attempts.map((a) => a.questionId));
    const missed = new Set(attempts.filter((a) => !a.correct).map((a) => a.questionId));
    const correctLater = new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));
    const order = [
      ...questions.filter((q) => missed.has(q.id) && !correctLater.has(q.id)),
      ...questions.filter((q) => !seen.has(q.id)),
      ...questions.filter((q) => missed.has(q.id) && correctLater.has(q.id)),
    ];
    ids = [...new Set(order.map((q) => q.id))].slice(0, count);
    if (!ids.length) return toast('Your bank has nothing new to review yet. Generate a block first.', 'warning');
    label = 'Question bank review';
  } else {
    let topics = [];
    let sources = [];
    let focusErrors = [];
    if (form.source === 'topics') {
      const t = form.topic ? graph.find(form.topic) || graph.match(form.topic) : null;
      topics = form.topic ? [{ name: t?.name || form.topic, system: t?.system || form.system }] : randomConcepts(form.system, Math.min(count, 6));
      label = form.topic ? t?.name || form.topic : form.system ? `${form.system} (mixed)` : 'Mixed systems';
    } else if (form.source === 'weak') {
      topics = weakTopics();
      if (!topics.length) return toast('No weak areas yet. Try a Topics block first.', 'warning');
      const errs = Object.entries(errorBreakdown(records)).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      focusErrors = errs.slice(0, 2).map(([k]) => k);
      label = 'Weak areas';
    } else {
      if (!form.docId) return toast('Choose a document.', 'warning');
      sources = await libraryPassages(form.docId, form.topic);
      if (!sources.length) return toast('No readable text was found in that document.', 'warning');
      label = `${state.documents.find((d) => d.id === form.docId)?.title || 'Document'}${form.topic ? ` · ${form.topic}` : ''}`;
    }
    const recent = (await db.all('questions')).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((q) => q.stem.slice(0, 90));
    request = { task: 'questions', exam: form.exam || currentExam(), topics, sources, sourceLocked: form.source === 'library' && form.sourceLocked, difficulty: form.difficulty, focusErrors, avoid: recent };
  }

  for (const old of (await db.all('blocks')).filter((b) => b.status === 'active' && !Object.values(b.answers || {}).some((x) => x.chosen)))
    await db.del('blocks', old.id);

  const exam = form.exam || currentExam();
  if (exam !== 'step1') label = `${label} · ${examShort(exam)}`;
  block = {
    id: uid('blk'),
    createdAt: Date.now(),
    exam,
    label,
    source: form.source,
    mode: form.mode,
    planned: ids.length || count,
    questionIds: ids,
    answers: {},
    status: 'active',
    endsAt: null,
    sourceMap: {},
  };
  bank = new Map();
  if (ids.length) {
    await loadBank(ids);
    await beginSession();
    return;
  }
  await generateInto(request, count);
}

async function generateInto(request, total) {
  renderGenerating(0, total);
  const ac = new AbortController();
  generating = ac;
  let started = false;
  let empty = 0;
  let attempts = 0;
  try {
    while (block.questionIds.length < total && !ac.signal.aborted && attempts < total + 3) {
      attempts++;
      const need = Math.min(started ? BATCH : FIRST_BATCH, total - block.questionIds.length);
      const base = block.questionIds.length;
      const qs = await requestQuestions({ ...request, count: need }, ac.signal, (n) => {
        if (!started) renderGenerating(base + n, total);
      });
      if (!qs.length) {
        // An empty or unreadable batch: try again once before giving up.
        if (++empty >= MAX_EMPTY_BATCHES) throw new Error('The questions could not be read. Please try again.');
        continue;
      }
      empty = 0;
      const srcMap = Object.fromEntries((request.sources || []).map((s) => [s.tag, { docId: s.docId, docName: s.docName, page: s.page }]));
      for (const q of qs) {
        q.blockId = block.id;
        q.exam = request.exam;
        q.sourceMap = srcMap;
        bank.set(q.id, q);
        block.questionIds.push(q.id);
      }
      await db.putMany('questions', qs);
      request.avoid = [...(request.avoid || []), ...qs.map((q) => q.stem.slice(0, 90))].slice(-40);
      await db.put('blocks', block);
      if (!started) {
        started = true;
        await beginSession(); // start answering while the rest are written
      } else if (view.name === 'session') {
        if (page().querySelector('.q-actions .spinner-border')) renderSession();
        else renderNav();
      }
      // A short batch (for example cut off by the length limit) just means we ask for the rest.
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (!started) {
      block = null;
      page().innerHTML = `<div class="page-head"><div><h2 class="page-title">Questions</h2></div></div>
        <div class="msg-error"><strong>Couldn't create questions.</strong> ${escapeHtml(err.message)}<div class="mt-2"><button class="btn btn-sm btn-outline-primary" id="qBack">Back</button></div></div>`;
      $('#qBack').addEventListener('click', renderHome);
      return;
    }
    toast(`Stopped at ${block.questionIds.length} questions: ${err.message}`, 'warning', 6000);
  } finally {
    generating = null;
    if (block && block.questionIds.length < block.planned) {
      block.planned = block.questionIds.length;
      await db.put('blocks', block);
      if (view.name === 'session' && block.questionIds.length) renderSession(); // refresh "of N" and the last button
    }
  }
}

function renderGenerating(n, total) {
  const pct = Math.round((Math.min(n, total) / total) * 100);
  page().innerHTML = `<div class="generating">
    <div class="spinner-border text-primary" role="status"></div>
    <h3>Writing your questions…</h3>
    <p class="text-body-secondary">Question ${Math.min(n + 1, total)} of ${total}. The block starts as soon as the first ones are ready.</p>
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${Math.max(6, pct)}%"></div></div>
    <button class="btn btn-sm btn-light mt-3" id="qCancel">Cancel</button></div>`;
  $('#qCancel').addEventListener('click', () => {
    generating?.abort();
    block = null;
    renderHome();
  });
}

async function requestQuestions(body, signal, onProgress) {
  const s = state.settings;
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(s.accessCode ? { 'x-access-code': s.accessCode } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let msg = `The request failed (${res.status}).`;
    try {
      const j = await res.json();
      msg = j.error || msg;
      if (j.code === 'LOGIN') document.dispatchEvent(new CustomEvent('account:signedout'));
    } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onProgress(Math.max(0, countStems(text) - 1));
  }
  text += dec.decode();
  const tags = new Set((body.sources || []).map((s2) => s2.tag));
  return parseQuestions(text, { uid: () => uid(), validTags: tags });
}

async function loadBank(ids) {
  for (const id of ids) if (!bank.has(id)) {
    const q = await db.get('questions', id);
    if (q) bank.set(id, q);
  }
}

async function beginSession() {
  if (block.mode === 'exam') block.endsAt = Date.now() + block.planned * SECONDS_PER_QUESTION * 1000;
  await db.put('blocks', block);
  view = { name: 'session', index: 0 };
  renderSession();
}

const firstUnanswered = () => Math.max(0, block.questionIds.findIndex((id) => !block.answers[id]?.submitted));

/* ============================== session ============================== */
function renderSession() {
  clearInterval(timer);
  const i = Math.min(view.index ?? 0, block.questionIds.length - 1);
  view.index = i;
  const q = bank.get(block.questionIds[i]);
  if (!q) return renderHome();
  const a = block.answers[q.id] || {};
  const reveal = block.mode === 'tutor' && a.submitted;

  page().innerHTML = `
    <div class="q-top">
      <div class="q-top-left"><button class="btn btn-icon" data-q="home" aria-label="Back to questions"><i class="bi bi-arrow-left"></i></button>
        <b>Question ${i + 1}<span class="text-body-secondary fw-normal"> of ${block.planned}</span></b></div>
      <div class="q-top-right">
        ${block.mode === 'exam' ? `<span class="q-timer" id="qTimer"></span>` : ''}
        <button class="btn btn-sm ${a.marked ? 'btn-warning' : 'btn-outline-secondary'}" data-q="mark"><i class="bi bi-flag${a.marked ? '-fill' : ''}"></i><span class="d-none d-sm-inline ms-1">${a.marked ? 'Marked' : 'Mark'}</span></button>
        <button class="btn btn-sm btn-outline-secondary" data-q="end">End</button>
      </div>
    </div>
    <div class="q-nav" id="qNav"></div>
    <article class="q-card">
      <div class="q-meta">${escapeHtml(q.system || '')}${q.difficulty ? ` · ${q.difficulty}` : ''}</div>
      <p class="q-stem">${escapeHtml(q.stem)}</p>
      <div class="q-options" role="radiogroup" aria-label="Answer options">
        ${q.options.map((o) => optionHtml(q, o, a, reveal)).join('')}
      </div>
      ${
        a.submitted && block.mode === 'tutor'
          ? ''
          : `<div class="q-confidence"><span class="small text-body-secondary">How sure are you?</span>
          <div class="btn-group btn-group-sm" role="group">${[
            ['sure', 'Sure'],
            ['unsure', 'Unsure'],
            ['guess', 'Guessing'],
          ]
            .map(([k, l]) => `<button type="button" class="btn ${(a.confidence || 'unsure') === k ? 'btn-secondary' : 'btn-outline-secondary'}" data-conf="${k}">${l}</button>`)
            .join('')}</div></div>`
      }
      <div class="q-actions">
        ${i > 0 ? `<button class="btn btn-light" data-q="prev"><i class="bi bi-chevron-left"></i> Previous</button>` : '<span></span>'}
        ${
          block.mode === 'tutor' && !a.submitted
            ? `<button class="btn btn-primary" data-q="submit" ${a.chosen ? '' : 'disabled'}>Submit answer</button>`
            : i < block.questionIds.length - 1
            ? `<button class="btn btn-primary" data-q="next">Next <i class="bi bi-chevron-right"></i></button>`
            : block.questionIds.length < block.planned
            ? `<button class="btn btn-primary" disabled><span class="spinner-border spinner-border-sm me-1"></span>Writing next…</button>`
            : `<button class="btn btn-primary" data-q="finish">Finish block</button>`
        }
      </div>
    </article>
    <div id="qReveal"></div>`;

  renderNav();
  bindSession(q);
  if (reveal) renderReveal($('#qReveal'), q, a);
  if (block.mode === 'exam') startTimer();
}

function optionHtml(q, o, a, reveal) {
  const chosen = a.chosen === o.id;
  const struck = (a.eliminated || []).includes(o.id);
  let cls = chosen ? 'chosen' : '';
  if (reveal) cls = o.correct ? 'correct' : chosen ? 'wrong' : 'dim';
  return `<div class="q-option ${cls} ${struck && !reveal ? 'struck' : ''}">
    <button type="button" class="q-opt-main" data-opt="${o.id}" role="radio" aria-checked="${chosen}" ${reveal ? 'disabled' : ''}>
      <span class="q-letter">${o.id}</span><span class="q-text">${escapeHtml(o.text)}</span>
      ${reveal && o.correct ? '<i class="bi bi-check-circle-fill ms-auto"></i>' : reveal && chosen ? '<i class="bi bi-x-circle-fill ms-auto"></i>' : ''}
    </button>
    ${reveal ? '' : `<button type="button" class="q-strike" data-strike="${o.id}" aria-label="${struck ? 'Restore' : 'Eliminate'} option ${o.id}" title="${struck ? 'Restore' : 'Eliminate'}"><i class="bi ${struck ? 'bi-arrow-counterclockwise' : 'bi-x-lg'}"></i></button>`}
  </div>`;
}

function renderNav() {
  const nav = $('#qNav');
  if (!nav || !block) return;
  const cells = [];
  for (let k = 0; k < block.planned; k++) {
    const id = block.questionIds[k];
    const a = id ? block.answers[id] : null;
    let cls = id ? '' : 'pending';
    if (a?.submitted && block.mode === 'tutor') cls = a.correct ? 'ok' : 'bad';
    else if (a?.chosen) cls = 'answered';
    cells.push(`<button class="q-cell ${cls} ${k === view.index ? 'current' : ''} ${a?.marked ? 'marked' : ''}" ${id ? `data-go="${k}"` : 'disabled'} aria-label="Question ${k + 1}">${k + 1}</button>`);
  }
  nav.innerHTML = cells.join('');
  $$('[data-go]', nav).forEach((b) =>
    b.addEventListener('click', () => {
      view.index = Number(b.dataset.go);
      renderSession();
    })
  );
}

function bindSession(q) {
  const p = page();
  const a = (block.answers[q.id] ||= { confidence: 'unsure', eliminated: [], shownAt: Date.now() });
  a.shownAt ||= Date.now();
  $$('[data-opt]', p).forEach((b) =>
    b.addEventListener('click', async () => {
      if (a.submitted && block.mode === 'tutor') return;
      a.chosen = b.dataset.opt;
      a.eliminated = (a.eliminated || []).filter((x) => x !== a.chosen);
      await saveBlock();
      renderSession();
    })
  );
  $$('[data-strike]', p).forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.strike;
      a.eliminated = a.eliminated?.includes(id) ? a.eliminated.filter((x) => x !== id) : [...(a.eliminated || []), id];
      if (a.chosen === id) delete a.chosen;
      await saveBlock();
      renderSession();
    })
  );
  $$('[data-conf]', p).forEach((b) =>
    b.addEventListener('click', async () => {
      a.confidence = b.dataset.conf;
      await saveBlock();
      renderSession();
    })
  );
  $$('[data-q]', p).forEach((b) => b.addEventListener('click', () => sessionAction(b.dataset.q, q)));
}

async function sessionAction(action, q) {
  const a = block.answers[q.id];
  if (action === 'home') {
    clearInterval(timer);
    view = { name: 'home' };
    return renderHome();
  }
  if (action === 'prev') view.index--;
  if (action === 'next') view.index++;
  if (action === 'mark') {
    a.marked = !a.marked;
    await saveBlock();
  }
  if (action === 'submit') {
    await submit(q, true);
  }
  if (action === 'finish' || action === 'end') {
    const unanswered = block.questionIds.filter((id) => (block.mode === 'exam' ? !block.answers[id]?.chosen : !block.answers[id]?.submitted)).length;
    if (action === 'end' || unanswered) {
      const msg = unanswered ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered and will count as incorrect.` : 'End this block and see your results?';
      if (!(await confirmDialog('End block?', msg, 'End block', false))) return;
    }
    return finishBlock();
  }
  renderSession();
}

/** Records an answer. In tutor mode the learner model is updated immediately; in exam mode at the end. */
async function submit(q, reveal) {
  const a = block.answers[q.id];
  if (!a?.chosen) return;
  a.submitted = true;
  a.correct = a.chosen === q.answer;
  a.seconds = Math.round((Date.now() - (a.shownAt || Date.now())) / 1000);
  a.suggestedError = a.correct ? null : suggestError(q, a);
  await saveBlock();
  if (block.mode === 'tutor') await commitAttempt(q, a);
  if (reveal) renderSession();
}

async function commitAttempt(q, a) {
  if (a.committed) return;
  a.committed = true;
  await db.put('attempts', {
    id: uid('att'),
    questionId: q.id,
    blockId: block.id,
    concept: q.concept,
    system: q.system,
    chosen: a.chosen || null,
    correct: Boolean(a.correct),
    confidence: a.confidence || 'unsure',
    seconds: a.seconds || null,
    at: Date.now(),
  });
  await recordEvidence(q.concept, { kind: 'question', correct: Boolean(a.correct), confidence: a.confidence || 'unsure' }, q.system);
  // A missed question becomes a flashcard (spec §26: knowledge gap → flashcard → spaced repetition).
  if (!a.correct && q.flashcard) {
    const n = await addCards([q.flashcard], { concept: q.concept, system: q.system, source: 'question' });
    a.cardAdded = n > 0 || a.cardAdded;
  }
  await saveBlock();
}

/** Best first guess at the error type: the chosen distractor's trap, adjusted for confidence. */
function suggestError(q, a) {
  const chosen = q.options.find((o) => o.id === a.chosen);
  if (!chosen) return 'knowledge_gap';
  if (a.confidence === 'guess') return 'knowledge_gap';
  return chosen.trap || (a.confidence === 'sure' ? 'mechanism_gap' : 'recognition_failure');
}

/* ============================== reveal (explanations + error analysis) ============================== */
async function renderReveal(host, q, a) {
  const chosen = q.options.find((o) => o.id === a.chosen);
  const correct = q.options.find((o) => o.correct);
  const srcChips = (q.sources || [])
    .map((t) => q.sourceMap?.[t])
    .filter(Boolean)
    .map((s) => `<a class="src-chip" href="#/viewer/${s.docId}/${s.page || 1}"><i class="bi bi-file-earmark-text"></i>${escapeHtml(s.docName)}${s.page ? `, p. ${s.page}` : ''}</a>`)
    .join('');

  host.innerHTML = `
    <div class="verdict ${a.correct ? 'ok' : 'bad'}">
      <i class="bi ${a.correct ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
      <div><b>${a.correct ? 'Correct' : a.chosen ? 'Incorrect' : 'Not answered'}</b>${a.correct && a.confidence === 'guess' ? ' <span class="small">(a lucky guess counts less)</span>' : ''}
      <div class="small">The answer is <b>${correct.id}. ${escapeHtml(correct.text)}</b>${a.seconds ? ` · ${a.seconds}s` : ''}</div></div>
    </div>

    ${!a.correct && a.chosen ? errorPanel(q, a) : ''}

    <section class="rv-section"><h4>Why ${correct.id} is right</h4><p>${escapeHtml(correct.explanation)}</p></section>

    ${q.clues?.length ? `<section class="rv-section"><h4>Clues in the stem</h4><ul class="clue-list">${q.clues.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></section>` : ''}

    <section class="rv-section"><h4>Mechanism</h4><div class="prose" id="rvChain"></div></section>

    <section class="rv-section"><h4>Why every other option is wrong</h4>
      <div class="distractors">${q.options
        .filter((o) => !o.correct)
        .map(
          (o) => `<div class="distractor ${o.id === a.chosen ? 'picked' : ''}">
            <div class="d-head"><span class="q-letter">${o.id}</span><b>${escapeHtml(o.text)}</b>${o.id === a.chosen ? '<span class="badge text-bg-danger ms-auto">Your answer</span>' : ''}</div>
            <p>${escapeHtml(o.explanation)}</p>
            ${o.wouldBeRightIf ? `<p class="would"><i class="bi bi-arrow-repeat me-1"></i><b>Would be right if</b> ${escapeHtml(o.wouldBeRightIf)}.</p>` : ''}
          </div>`
        )
        .join('')}</div>
    </section>

    ${q.highYield ? `<div class="callout callout-highyield"><div class="callout-title"><i class="bi bi-bullseye"></i>${examShort(q.exam || 'step1')} high yield</div><p>${escapeHtml(q.highYield)}</p></div>` : ''}

    <div class="rv-foot">
      ${srcChips ? `<div class="chip-row">${srcChips}</div>` : ''}
      <div class="d-flex flex-wrap gap-2">
        ${
          q.flashcard
            ? a.cardAdded
              ? `<span class="small text-success"><i class="bi bi-stack me-1"></i>Flashcard added to your deck</span>`
              : `<button class="btn btn-sm btn-outline-primary" data-rv="card"><i class="bi bi-stack me-1"></i>Add flashcard</button>`
            : ''
        }
        <button class="btn btn-sm btn-outline-primary" data-rv="teach"><i class="bi bi-mortarboard me-1"></i>Teach me ${escapeHtml(q.concept)}</button>
        ${!a.correct && a.chosen ? `<button class="btn btn-sm btn-outline-secondary" data-rv="discuss"><i class="bi bi-chat-left-text me-1"></i>Talk through my mistake</button>` : ''}
      </div>
    </div>`;

  if (q.mechanism) {
    const steps = q.mechanism.split(/\s*(?:→|->|⟶)\s*/).filter(Boolean);
    await renderMessage($('#rvChain', host), steps.length > 1 ? '```chain\n' + steps.join('\n') + '\n```' : q.mechanism, { final: true });
  } else $('#rvChain', host).closest('.rv-section').remove();

  $$('[data-err]', host).forEach((b) => b.addEventListener('click', () => classifyError(q, a, b.dataset.err, host)));
  $$('[data-pre]', host).forEach((b) => b.addEventListener('click', () => composeAndSend(`Teach me ${b.dataset.pre} from absolute zero.`)));
  $('[data-rv="card"]', host)?.addEventListener('click', async () => {
    await addCards([q.flashcard], { concept: q.concept, system: q.system, source: 'question' });
    a.cardAdded = true;
    await saveBlock();
    renderReveal(host, q, a);
    toast('Flashcard added.', 'success', 2000);
  });
  $('[data-rv="teach"]', host)?.addEventListener('click', () => composeAndSend(`Teach me ${q.concept} from absolute zero.`));
  $('[data-rv="discuss"]', host)?.addEventListener('click', () => {
    const txt = `I answered this practice question wrong. Help me understand my reasoning error.\n\n${q.stem}\n\n${q.options.map((o) => `${o.id}. ${o.text}`).join('\n')}\n\nI chose ${chosen.id} (${chosen.text}) and was ${a.confidence === 'sure' ? 'sure' : a.confidence === 'guess' ? 'guessing' : 'unsure'}. The answer is ${correct.id} (${correct.text}). Explain the mechanism I missed and how to avoid this trap.`;
    composeAndSend(txt);
  });
}

function errorPanel(q, a) {
  const chosen = q.options.find((o) => o.id === a.chosen);
  const current = a.errorType || a.suggestedError;
  const prereqs = q.prerequisites || [];
  return `<section class="error-panel">
    <h4><i class="bi bi-search me-1"></i>What went wrong?</h4>
    <p class="small mb-2">You chose <b>${escapeHtml(chosen.text)}</b>${a.confidence === 'sure' ? ' and were sure' : ''}. ${
      a.errorType ? 'Saved to your learner model.' : 'The suggested reason is highlighted; tap the one that fits best.'
    }</p>
    <div class="err-grid">${Object.entries(ERROR_TYPES)
      .map(([k, v]) => `<button type="button" class="err-btn ${current === k ? (a.errorType ? 'saved' : 'suggested') : ''}" data-err="${k}" title="${escapeHtml(v.hint)}"><b>${v.label}</b><small>${v.hint}</small></button>`)
      .join('')}</div>
    ${
      prereqs.length
        ? `<div class="prereq-row"><span class="small text-body-secondary">This question relies on:</span>${prereqs
            .map((p) => {
              const c = graph.find(p);
              const st = c ? status(records.get(c.id)) : 'unrated';
              return `<button class="concept-chip st-${st}" data-pre="${escapeHtml(c?.name || p)}" title="Teach me this"><i class="bi bi-mortarboard me-1"></i>${escapeHtml(c?.name || p)}</button>`;
            })
            .join('')}</div>`
        : ''
    }
  </section>`;
}

async function classifyError(q, a, type, host) {
  const first = !a.errorType;
  a.errorType = type;
  await saveBlock();
  const atts = await db.byIndex('attempts', 'questionId', q.id);
  const last = atts.sort((x, y) => y.at - x.at)[0];
  if (last) {
    last.errorType = type;
    await db.put('attempts', last);
  }
  if (first) await recordEvidence(q.concept, { kind: 'error', type }, q.system);
  toast(`Classified as ${ERROR_TYPES[type].label.toLowerCase()}.`, 'success', 2000);
  renderReveal(host, q, a);
}

/* ============================== timer / finish ============================== */
function startTimer() {
  const tick = () => {
    const el = $('#qTimer');
    if (!block?.endsAt || !el) return clearInterval(timer);
    const left = Math.max(0, Math.round((block.endsAt - Date.now()) / 1000));
    el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    el.classList.toggle('low', left < 60);
    if (left <= 0) {
      clearInterval(timer);
      toast('Time is up.', 'warning');
      finishBlock();
    }
  };
  tick();
  timer = setInterval(tick, 1000);
}

async function finishBlock() {
  clearInterval(timer);
  generating?.abort();
  for (const id of block.questionIds) {
    const q = bank.get(id);
    const a = (block.answers[id] ||= {});
    // Exam answers can be changed until the end, so they are scored only now.
    if (!a.submitted || block.mode === 'exam') {
      a.submitted = true;
      a.correct = a.chosen === q.answer;
      a.suggestedError = a.correct ? null : a.chosen ? suggestError(q, a) : null;
    }
    if (a.chosen) await commitAttempt(q, a);
  }
  const answered = block.questionIds.length;
  block.score = answered ? block.questionIds.filter((id) => block.answers[id]?.correct).length / answered : 0;
  block.status = 'done';
  block.finishedAt = Date.now();
  block.planned = block.questionIds.length;
  await db.put('blocks', block);
  view = { name: 'results' };
  renderResults();
}

async function saveBlock() {
  if (block) await db.put('blocks', block);
}

/* ============================== results ============================== */
function renderResults() {
  const qs = block.questionIds.map((id) => bank.get(id)).filter(Boolean);
  const correct = qs.filter((q) => block.answers[q.id]?.correct).length;
  const byConcept = new Map();
  for (const q of qs) {
    const e = byConcept.get(q.concept) || { n: 0, ok: 0 };
    e.n++;
    if (block.answers[q.id]?.correct) e.ok++;
    byConcept.set(q.concept, e);
  }
  const missed = qs.filter((q) => !block.answers[q.id]?.correct);
  const unclassified = missed.filter((q) => block.answers[q.id]?.chosen && !block.answers[q.id]?.errorType).length;
  const time = block.finishedAt && block.createdAt ? Math.round((block.finishedAt - block.createdAt) / 60000) : null;

  page().innerHTML = `
    <div class="q-top"><div class="q-top-left"><button class="btn btn-icon" data-r="home" aria-label="Back"><i class="bi bi-arrow-left"></i></button><b>${escapeHtml(block.label)}</b></div></div>
    <div class="result-hero">
      <div class="result-score ${scoreClass(block.score)}">${Math.round(block.score * 100)}%</div>
      <div><b>${correct} of ${qs.length} correct</b><div class="small text-body-secondary">${block.mode === 'exam' ? 'Timed block' : 'Tutor block'}${time != null ? ` · ${time} min` : ''}</div>
      ${unclassified ? `<div class="small mt-1"><i class="bi bi-search me-1"></i>${unclassified} miss${unclassified === 1 ? '' : 'es'} still to analyse: open ${unclassified === 1 ? 'it' : 'them'} below.</div>` : ''}</div>
    </div>
    <h3 class="section-title">By concept</h3>
    <div class="concept-scores">${[...byConcept.entries()]
      .map(([c, e]) => `<div class="cs-row"><span class="text-truncate">${escapeHtml(c)}</span><span class="cs-bar"><span style="width:${(e.ok / e.n) * 100}%"></span></span><b>${e.ok}/${e.n}</b></div>`)
      .join('')}</div>
    <h3 class="section-title mt-4">Review</h3>
    <div class="block-list">${qs
      .map((q, i) => {
        const a = block.answers[q.id] || {};
        return `<button class="block-row" data-r="open" data-i="${i}">
          <i class="bi ${a.correct ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'}"></i>
          <span class="min-w-0"><b class="d-block text-truncate">${i + 1}. ${escapeHtml(q.concept)}</b><small class="text-body-secondary text-truncate d-block">${escapeHtml(q.stem.slice(0, 110))}…</small></span>
          ${!a.correct && a.chosen ? (a.errorType ? `<span class="badge text-bg-light ms-auto">${ERROR_TYPES[a.errorType].label}</span>` : '<span class="badge text-bg-warning ms-auto">Analyse</span>') : ''}
        </button>`;
      })
      .join('')}</div>
    <div class="d-flex flex-wrap gap-2 mt-3">
      ${missed.length ? `<button class="btn btn-outline-primary" data-r="retry"><i class="bi bi-arrow-repeat me-1"></i>Retry ${missed.length} missed</button>` : ''}
      <button class="btn btn-light" data-r="home">New block</button>
    </div>
    <div id="qReveal" class="mt-3"></div>`;

  $$('[data-r]', page()).forEach((b) =>
    b.addEventListener('click', async () => {
      const r = b.dataset.r;
      if (r === 'home') {
        block = null;
        return renderHome();
      }
      if (r === 'open') {
        const q = qs[Number(b.dataset.i)];
        const host = $('#qReveal');
        host.innerHTML = `<article class="q-card mb-2"><div class="q-meta">Question ${Number(b.dataset.i) + 1}</div><p class="q-stem">${escapeHtml(q.stem)}</p>
          <div class="q-options">${q.options.map((o) => optionHtml(q, o, block.answers[q.id] || {}, true)).join('')}</div></article><div id="rvBody"></div>`;
        await renderReveal($('#rvBody'), q, block.answers[q.id] || {});
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (r === 'retry') {
        const ids = missed.map((q) => q.id);
        block = { id: uid('blk'), createdAt: Date.now(), label: `Retry: ${block.label}`, source: 'bank', mode: 'tutor', planned: ids.length, questionIds: ids, answers: {}, status: 'active', endsAt: null };
        await beginSession();
      }
    })
  );
}

const scoreClass = (s) => (s == null ? '' : s >= 0.8 ? 'good' : s >= 0.6 ? 'ok' : 'low');

/** Keyboard shortcuts during a session (desktop): A–E choose, X+letter eliminate, Enter submit/next. */
document.addEventListener('keydown', (e) => {
  if (document.body.dataset.view !== 'questions' || view.name !== 'session' || e.target.closest('input, textarea, select, .modal')) return;
  if (e.key === 'Enter' && e.target.closest('button')) return; // the focused button handles it
  const k = e.key.toUpperCase();
  if (/^[A-E]$/.test(k) && !e.ctrlKey && !e.metaKey) {
    $(`[data-opt="${k}"]`)?.click();
  } else if (e.key === 'Enter') {
    ($('[data-q="submit"]:not([disabled])') || $('[data-q="next"]') || $('[data-q="finish"]'))?.click();
  } else if (e.key === 'ArrowRight') $('[data-q="next"]')?.click();
  else if (e.key === 'ArrowLeft') $('[data-q="prev"]')?.click();
});
