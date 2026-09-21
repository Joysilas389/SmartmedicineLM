import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeachingRequest } from '../ai/teacher/controller.js';
import { buildQuestionRequest } from '../ai/tasks/questions.js';
import { DEMO_QUESTIONS } from '../ai/tasks/demo-questions.js';
import { parseQuestions } from '../frontend/js/question-parse.js';
import { KnowledgeGraph } from '../frontend/js/graph.js';
import { SYSTEMS as UI_SYSTEMS } from '../frontend/js/graph-seed.js';
import { SYSTEMS as AI_SYSTEMS } from '../ai/teacher/modules.js';

const lesson = (exam) =>
  buildTeachingRequest({ messages: [{ role: 'user', content: 'Teach me sepsis from absolute zero' }], controls: { exam, depth: 'deep', knowledgeMode: 'general' } });

test('Step 1 lessons stay mechanism-first (unchanged default)', () => {
  const r = lesson(undefined);
  assert.equal(r.exam, 'step1');
  assert.match(r.system, /TARGET EXAM: USMLE Step 1/);
  assert.match(r.system, /\*\*Common distractor\*\*/);
  assert.match(r.system, /Layer 6 · Treatment: drug → target → molecular action/);
  assert.doesNotMatch(r.system, /NEXT BEST STEP/);
});

test('Step 2 CK lessons centre on diagnosis, the next best step and management', () => {
  const r = lesson('step2ck');
  assert.match(r.system, /TARGET EXAM: USMLE Step 2 CK/);
  assert.match(r.system, /stabilising an unstable patient first/);
  assert.match(r.system, /Layer 5 · Diagnostic approach: which test first/);
  assert.match(r.system, /marking the NEXT BEST STEP/);
  assert.match(r.system, /\*\*Next best step\*\*/);
  assert.match(r.system, /Step 2 CK reasoning/);
  assert.doesNotMatch(r.system, /Layer 8/);
});

test('Step 3 lessons add management over time, ethics and biostatistics', () => {
  const r = lesson('step3');
  assert.match(r.system, /TARGET EXAM: USMLE Step 3/);
  assert.match(r.system, /Computer-based Case Simulations/);
  assert.match(r.system, /Layer 8 · Over time: disposition/);
  assert.match(r.system, /\*\*The management decision\*\*/);
});

test('an unknown exam value falls back to Step 1', () => {
  assert.equal(lesson('step9').exam, 'step1');
});

test('question writer changes item style per exam', () => {
  const q2 = buildQuestionRequest({ topics: [{ name: 'Sepsis' }], exam: 'step2ck' });
  assert.match(q2.system, /senior USMLE Step 2 CK item writer/);
  assert.match(q2.system, /At most one question in five may be a pure mechanism question/);
  assert.match(q2.system, /one-sentence Step 2 CK takeaway/);
  const q3 = buildQuestionRequest({ topics: [{ name: 'Cancer screening' }], exam: 'step3' });
  assert.match(q3.system, /management over time/);
  assert.match(q3.system, /2 × 2 table/);
  assert.equal(buildQuestionRequest({ topics: [{ name: 'X' }] }).exam, 'step1');
});

test('Step 2 CK and Step 3 demo items are valid questions', () => {
  const clinical = DEMO_QUESTIONS.questions.filter((q) => q.exam !== 'step1');
  assert.equal(clinical.length, 2);
  const parsed = parseQuestions(JSON.stringify({ questions: clinical }));
  assert.equal(parsed.length, 2, 'both pass validation (5 options, exactly one correct)');
  assert.ok(parsed.every((q) => q.flashcard && q.mechanism));
});

test('knowledge graph covers psychiatry, biostatistics, ethics and prevention without false matches', () => {
  assert.deepEqual(UI_SYSTEMS, AI_SYSTEMS, 'browser and server agree on the systems');
  const g = new KnowledgeGraph();
  assert.ok(g.bySystem('Psychiatry').length >= 8);
  assert.ok(g.bySystem('Biostatistics, Ethics & Prevention').length >= 8);
  assert.equal(g.match('how do I calculate the NNT').name, 'Risk measures');
  assert.equal(g.match('teach me sepsis management').name, 'Sepsis management');
  assert.equal(g.match('why is there ST depression in V1'), null, 'an ECG finding is not psychiatry');
  assert.equal(g.match('explain insulin sensitivity').name, 'Insulin and glucose metabolism');
  assert.ok(g.prerequisites('stemi-management').some((p) => p.concept.name === 'Myocardial infarction'));
});
