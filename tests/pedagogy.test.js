import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeachingRequest, resolveMode } from '../ai/teacher/controller.js';
import * as P from '../ai/teacher/pedagogy.js';

const ask = (content, controls = {}) => buildTeachingRequest({ messages: [{ role: 'user', content }], controls });

test('the teaching doctrine is always present: philosophy, why, plain language, uncertainty, safety', () => {
  const r = ask('Teach me heart failure from absolute zero', { depth: 'deep' });
  for (const re of [/simplify the explanation, not the medicine/i, /ask yourself why it is true/i, /never introduce unexplained medical terminology/i, /probabilistic/i, /does not replace clinical judgement|individualised advice/i])
    assert.match(r.system, re);
});

test('full lessons add hierarchy, misconceptions, analogy rules, cross-linking and synthesis', () => {
  const r = ask('Teach me nephrotic syndrome from absolute zero', { depth: 'deep' });
  assert.match(r.system, /\*\*Must know\*\*/);
  assert.match(r.system, /Common misconception/);
  assert.match(r.system, /where it breaks down/);
  assert.match(r.system, /Five things to remember/);
  assert.match(r.system, /what does it connect to/);
  assert.match(r.system, /what must be understood \(mechanisms\)/, 'deep lessons say what to convert into flashcards');
});

test('a short factual question gets a lean brief, not the whole doctrine', () => {
  const quick = ask('What is the normal serum potassium?');
  assert.equal(quick.mode, 'concise');
  assert.ok(quick.system.length < 7000, `lean brief (${quick.system.length} chars)`);
  assert.doesNotMatch(quick.system, /Five things to remember/);
  assert.match(quick.system, /probabilistic/, 'calibrated language still applies');
});

test('learner level changes what is assumed', () => {
  assert.match(ask('Explain preload', { level: 'beginner' }).system, /Assume little or no prior knowledge/);
  assert.match(ask('Explain preload', { level: 'specialist' }).system, /Do not spend space defining elementary concepts/);
  assert.equal(ask('Explain preload', { level: 'nonsense' }).level, 'auto');
  assert.match(ask('Explain preload').system, /LEARNER LEVEL: not stated/);
});

test('subject frameworks switch on for the subject actually asked about', () => {
  assert.deepEqual(P.subjectKeys('Interpret this ECG with ST elevation in II, III and aVF'), ['ecg']);
  assert.ok(P.subjectKeys('Which diuretic would you choose and what are its adverse effects?').includes('pharmacology'));
  assert.ok(P.subjectKeys('Walk me through this arterial blood gas: pH 7.2, anion gap 22').includes('acidbase'));
  assert.ok(P.subjectKeys('What is the differential for chest pain?').includes('differential'));
  assert.deepEqual(P.subjectKeys('Teach me the Frank-Starling relationship').includes('physiology'), true);
  assert.deepEqual(P.subjectKeys('Tell me a joke'), []);
  assert.match(ask('Interpret this ECG with ST elevation').system, /rate, rhythm, axis/);
  assert.doesNotMatch(ask('Teach me nephrotic syndrome from absolute zero').system, /rate, rhythm, axis/, 'irrelevant frameworks stay out');
  assert.ok(P.subjectModules('An unstable trauma patient with an abnormal ECG and a drug overdose').length <= 2, 'at most two frameworks per answer');
});

test('"I do not understand" never repeats the same explanation', () => {
  for (const phrase of ["I don't understand", 'I still don\'t get it', 'explain it differently', 'can you explain this more simply', "I'm lost"]) {
    assert.equal(resolveMode({}, phrase), 'reexplain', phrase);
  }
  const r = ask("I don't understand why the potassium rises");
  assert.match(r.system, /Do NOT repeat it in the same shape/);
  assert.match(r.system, /one step at a time/i);
});

test('comparison and case modes are detected and shaped', () => {
  assert.equal(resolveMode({}, 'Compare nephrotic vs nephritic syndrome'), 'compare');
  assert.equal(resolveMode({}, 'What is the difference between Crohn disease and ulcerative colitis?'), 'compare');
  assert.match(ask('Compare warfarin vs heparin').system, /comparison table using discriminators/);
  assert.equal(resolveMode({}, 'Give me a clinical case on chest pain'), 'case');
  const c = ask('Give me a clinical case on chest pain');
  assert.match(c.system, /without naming the diagnosis/);
  assert.match(c.system, /recognition → differentiation/);
  assert.match(c.system, /vary the level deliberately/, 'question levels apply in case mode');
});

test('evidence rules forbid invented guidance, in every mode', () => {
  for (const mode of ['Teach me sepsis from absolute zero', 'What is the normal potassium?', 'Compare X vs Y']) {
    assert.match(ask(mode).system, /Never invent citations, studies, statistics, trial names or guideline numbers/);
  }
});

test('continuing a cut-off answer does not resend the whole doctrine', () => {
  const r = ask('continue');
  assert.equal(r.mode, 'continue');
  assert.ok(r.system.length < 6000, `continuation brief stays small (${r.system.length})`);
  assert.doesNotMatch(r.system, /LEARNER LEVEL/);
});
