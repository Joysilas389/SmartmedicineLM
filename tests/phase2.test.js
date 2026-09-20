import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnowledgeGraph, parseSeed } from '../frontend/js/graph.js';
import { emptyRecord, applyEvidence, mastery, status, prerequisitePlan, systemSummary, bottlenecks } from '../frontend/js/learner-model.js';
import { FSRS, SM2, retrievability, migrateCard, DAY, forecast } from '../frontend/js/srs.js';
import { parseQuestions, extractQuestionObjects } from '../frontend/js/question-parse.js';
import { SYSTEMS } from '../frontend/js/graph-seed.js';
import { buildQuestionRequest } from '../ai/tasks/questions.js';
import { DEMO_QUESTIONS } from '../ai/tasks/demo-questions.js';
import { buildTeachingRequest } from '../ai/teacher/controller.js';

/* ---------------- knowledge graph ---------------- */
test('seed graph: every prerequisite resolves and there are no cycles', () => {
  const g = new KnowledgeGraph();
  assert.ok(g.size >= 90);
  for (const c of parseSeed()) for (const n of c.prereqNames) assert.ok(g.find(n), `${c.name} -> ${n}`);
  for (const c of g.all()) assert.ok(!g.prerequisites(c.id, 20).some((p) => p.concept.id === c.id), `cycle at ${c.name}`);
  for (const c of g.all()) assert.ok(SYSTEMS.includes(c.system), c.name);
});

test('graph: matches requests to concepts, longest phrase wins', () => {
  const g = new KnowledgeGraph();
  assert.equal(g.match('Teach me nephrotic syndrome from absolute zero.').name, 'Nephrotic syndrome');
  assert.equal(g.match('what is Conn syndrome?').name, 'Primary hyperaldosteronism');
  assert.equal(g.match('explain stroke volume').name, 'Cardiac output');
  assert.equal(g.match('tell me a joke'), null);
});

test('graph: prerequisites come foundations-first (spec §29 example)', () => {
  const g = new KnowledgeGraph();
  const names = g.prerequisites('nephrotic-syndrome').map((p) => p.concept.name);
  assert.ok(names.includes('Glomerular filtration') && names.includes('Starling forces'));
  assert.ok(names.indexOf('Diffusion and osmosis') < names.indexOf('Starling forces'));
});

test('graph: lesson blocks merge, persist, restore and cannot create cycles', () => {
  const g = new KnowledgeGraph();
  g.merge({ concept: 'Minimal change disease', system: 'Renal', prerequisites: ['Nephrotic syndrome', 'Podocyte biology'], relations: [['treated_by', 'Corticosteroids'], ['nonsense', 'x']] });
  const mcd = g.find('minimal change disease');
  assert.equal(mcd.id, 'nephrotic-syndrome', 'alias of an existing concept is reused, not duplicated');
  const pod = g.find('Podocyte biology');
  assert.equal(pod.system, 'Renal');
  g.merge({ concept: 'Glomerular filtration', prerequisites: ['Nephrotic syndrome'] });
  assert.ok(!g.get('glomerular-filtration').prereqs.includes('nephrotic-syndrome'));
  const g2 = new KnowledgeGraph();
  g2.restore(g.learnedState());
  assert.ok(g2.get('nephrotic-syndrome').prereqs.includes(pod.id));
});

/* ---------------- learner model ---------------- */
test('learner model keeps understanding, recall and application separate', () => {
  const r = emptyRecord({ id: 'x', name: 'X', system: 'Renal' });
  applyEvidence(r, { kind: 'card', grade: 3 });
  applyEvidence(r, { kind: 'card', grade: 4 });
  applyEvidence(r, { kind: 'question', correct: false, confidence: 'unsure' });
  applyEvidence(r, { kind: 'lesson', rating: 'partly' });
  assert.ok(r.recall > 0.85 && r.application === 0 && r.understanding === 0.55);
  assert.equal(r.attempts, 1);
  assert.ok(mastery(r) > 0 && mastery(r) < 1);
});

test('confidently wrong answers count against understanding; lucky guesses count less', () => {
  const a = emptyRecord({ id: 'a', name: 'A', system: 'Renal' });
  applyEvidence(a, { kind: 'question', correct: false, confidence: 'sure' });
  assert.ok(a.understanding != null && a.understanding < 0.5);
  const b = emptyRecord({ id: 'b', name: 'B', system: 'Renal' });
  applyEvidence(b, { kind: 'question', correct: true, confidence: 'guess' });
  assert.equal(b.application, 0.6);
});

test('error analysis updates the right dimension and counts error types', () => {
  const r = emptyRecord({ id: 'x', name: 'X', system: 'Renal' });
  applyEvidence(r, { kind: 'error', type: 'mechanism_gap' });
  applyEvidence(r, { kind: 'error', type: 'mechanism_gap' });
  applyEvidence(r, { kind: 'error', type: 'invalid' });
  assert.equal(r.errors, 2);
  assert.equal(r.errorTypes.mechanism_gap, 2);
  assert.ok(r.understanding < 0.3);
});

test('prerequisite plan: teach gaps, review middling, skip mastery', () => {
  const g = new KnowledgeGraph();
  const recs = new Map();
  const set = (id, v) => {
    const r = emptyRecord(g.get(id));
    r.understanding = v;
    r.recall = v;
    r.application = v;
    r.n = { understanding: 3, recall: 3, application: 3 };
    recs.set(id, r);
  };
  set('starling-forces', 0.2);
  set('glomerular-filtration', 0.9);
  const plan = prerequisitePlan(g.prerequisites('nephrotic-syndrome'), recs);
  const by = Object.fromEntries(plan.map((p) => [p.id, p.decision]));
  assert.equal(by['starling-forces'], 'teach');
  assert.equal(by['glomerular-filtration'], 'skip');
  assert.equal(by['plasma-proteins-and-albumin'], 'review', 'unrated direct prerequisite gets a brief review');
});

test('dashboard summary and prerequisite bottlenecks', () => {
  const g = new KnowledgeGraph();
  const recs = new Map();
  const weak = (id) => {
    const r = emptyRecord(g.get(id));
    for (let i = 0; i < 3; i++) applyEvidence(r, { kind: 'question', correct: false, confidence: 'unsure' });
    recs.set(id, r);
  };
  weak('acid-base-disorders');
  weak('diabetes-mellitus-and-dka');
  const sum = systemSummary(g, recs, SYSTEMS);
  const renal = sum.find((s) => s.system === 'Renal');
  assert.equal(renal.rated, 1);
  assert.equal(renal.application, 0);
  assert.equal(status(recs.get('acid-base-disorders')), 'critical');
  const b = bottlenecks(g, recs);
  assert.ok(b.some((x) => x.concept.name === 'Anion gap'), 'anion gap sits under both weak topics');
  assert.ok(b[0].chain.length >= 2);
});

/* ---------------- spaced repetition ---------------- */
test('FSRS: intervals grow with success, ordered Again < Hard < Good < Easy', () => {
  const now = Date.UTC(2026, 0, 1);
  const card = { id: 'c', state: 'new', due: now };
  const iv = [1, 2, 3, 4].map((g) => FSRS.next(card, g, now).due - now);
  assert.ok(iv[0] < iv[1] && iv[1] < iv[2] && iv[2] < iv[3]);
  let c = FSRS.next(card, 3, now);
  let t = now;
  const intervals = [];
  for (let i = 0; i < 4; i++) {
    t = c.due;
    c = FSRS.next(c, 3, t);
    intervals.push(c.interval);
  }
  assert.ok(intervals.every((v, i) => i === 0 || v > intervals[i - 1]), `growing: ${intervals}`);
  assert.ok(c.difficulty >= 1 && c.difficulty <= 10 && c.stability > 1);
  assert.ok(Math.abs(retrievability(c, c.lastReview + c.interval * DAY) - 0.9) < 0.03, 'due at ~90% retention');
});

test('FSRS: a lapse shrinks stability and schedules a same-day relearn', () => {
  const now = Date.UTC(2026, 0, 1);
  let c = FSRS.next({ state: 'new' }, 3, now);
  c = FSRS.next(c, 3, c.due);
  const before = c.stability;
  const lapsed = FSRS.next(c, 1, c.due);
  assert.ok(lapsed.stability < before);
  assert.equal(lapsed.state, 'relearning');
  assert.ok(lapsed.due - c.due <= 15 * 60000);
  assert.equal(lapsed.lapses, 1);
});

test('Phase 1 SM-2 cards migrate to FSRS, and SM-2 still works', () => {
  const old = { id: 'o', reps: 3, interval: 12, ease: 2.2, lastReview: 1, due: 2 };
  const m = migrateCard(old);
  assert.equal(m.stability, 12);
  assert.ok(m.difficulty > 5);
  const s = SM2.next({ reps: 0 }, 3, 0);
  assert.equal(s.interval, 1);
  assert.deepEqual(forecast([{ due: 0 }, { due: DAY * 1.5 }], 3, 0), [1, 1, 0]);
});

/* ---------------- question engine ---------------- */
test('demo questions pass validation and options are shuffled', () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const qs = parseQuestions(JSON.stringify(DEMO_QUESTIONS), { rand });
  assert.equal(qs.length, 3);
  for (const q of qs) {
    assert.equal(q.options.length, 5);
    assert.equal(q.options.filter((o) => o.correct).length, 1);
    assert.equal(q.options.find((o) => o.id === q.answer).correct, true);
    assert.ok(q.flashcard?.q);
  }
  const positions = new Set(qs.map((q) => q.answer));
  assert.ok(positions.size > 1 || qs.length < 2, 'correct answer is not always in the same position');
});

test('parser keeps complete questions from truncated or fenced output and drops invalid ones', () => {
  const good = DEMO_QUESTIONS.questions[0];
  const bad = { ...good, options: good.options.map((o) => ({ ...o, correct: true })) };
  const text = '```json\n{"questions":[' + JSON.stringify(good) + ',' + JSON.stringify(bad) + ',' + JSON.stringify(good).slice(0, 300);
  assert.equal(extractQuestionObjects(text).length, 2);
  assert.equal(parseQuestions(text).length, 1);
});

test('question request builder validates input and scales the budget', () => {
  assert.ok(buildQuestionRequest({}).error);
  const r = buildQuestionRequest({ topics: [{ name: 'Nephrotic syndrome', system: 'Renal' }], count: 9, difficulty: 'hard', focusErrors: ['mechanism_gap', 'rm -rf'] });
  assert.equal(r.count, 5);
  assert.ok(r.maxTokens >= 5000);
  assert.match(r.messages[0].content, /mechanism_gap/);
  assert.doesNotMatch(r.messages[0].content, /rm -rf/);
  const s = buildQuestionRequest({ sources: [{ tag: 'S1', docName: 'Notes', page: 3, text: 'Podocytes form foot processes.' }], sourceLocked: true });
  assert.match(s.messages[0].content, /SOURCE-LOCKED/);
});

test('teaching controller: prerequisite plan and knowledge-graph block', () => {
  const r = buildTeachingRequest({
    messages: [{ role: 'user', content: 'Teach me nephrotic syndrome from absolute zero' }],
    controls: { depth: 'deep', knowledgeMode: 'general' },
    prerequisites: { concept: 'Nephrotic syndrome', items: [{ name: 'Starling forces', decision: 'teach' }, { name: 'Evil\nname', decision: 'hack' }] },
  });
  assert.match(r.system, /Teach properly before the main topic.*Starling forces/);
  assert.doesNotMatch(r.system, /Evil/);
  assert.match(r.system, /"concepts"/);
  const quick = buildTeachingRequest({ messages: [{ role: 'user', content: 'What is the normal serum potassium?' }], controls: { knowledgeMode: 'general' } });
  assert.doesNotMatch(quick.system, /Knowledge graph block/);
});

/* ---------------- study plan ---------------- */
test('study plan: phases fit before the exam, weakest systems get more days, today has concrete tasks', async () => {
  const { buildPlan } = await import('../frontend/js/study-plan.js');
  const g = new KnowledgeGraph();
  const recs = new Map();
  const set = (id, v) => {
    const r = emptyRecord(g.get(id));
    r.application = v;
    r.n.application = 3;
    recs.set(id, r);
  };
  for (const c of g.bySystem('Renal')) set(c.id, 0.2);
  for (const c of g.bySystem('Cardiovascular')) set(c.id, 0.95);
  set('cell-membrane-and-ion-channels', 0.9);
  const now = new Date('2026-09-20T09:00:00').getTime();
  const plan = buildPlan({ examDate: '2026-12-20', hours: 5 }, { graph: g, records: recs, systems: SYSTEMS, dueForecast: [12, 3, 0, 0, 0, 0, 0], now });
  assert.equal(plan.daysLeft, 91);
  assert.equal(plan.phases.firstPass + plan.phases.consolidation + plan.phases.final, 91);
  const renal = plan.rotation.find((r) => r.system === 'Renal');
  const cardio = plan.rotation.find((r) => r.system === 'Cardiovascular');
  assert.ok(renal.days > cardio.days, `renal ${renal.days} > cardio ${cardio.days}`);
  assert.ok(plan.rotation.every((r) => r.end <= plan.phases.passEnd + 86400000));
  assert.ok(plan.today.some((t) => t.kind === 'questions' && t.count > 0));
  assert.ok(plan.today.some((t) => t.kind === 'flashcards' && /12/.test(t.text)));
  assert.ok(plan.weeks.length >= 13);
  assert.ok(buildPlan({ examDate: '2020-01-01', hours: 3 }, { graph: g, records: recs, systems: SYSTEMS, now }).error);
});
