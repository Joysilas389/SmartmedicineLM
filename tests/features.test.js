import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALCS, makeProblem, checkAnswer } from '../frontend/js/calc.js';
import { packItems, encodeShare, decodeShare } from '../frontend/js/share.js';
import { estimateCost, formatUsd } from '../frontend/js/cost.js';
import { buildTeachingRequest } from '../ai/teacher/controller.js';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('every calculation produces a correct worked answer across many random cases', () => {
  for (const key of Object.keys(CALCS))
    for (let i = 0; i < 200; i++) {
      const p = makeProblem(key, rand);
      assert.ok(Number.isFinite(p.answer), `${key} answer`);
      assert.ok(p.steps.length >= 2 && p.prompt.length > 20);
      assert.ok(checkAnswer(p, String(p.answer)).correct, `${key}: its own answer is accepted`);
      assert.ok(!checkAnswer(p, String(p.answer + p.tolerance + 5)).correct, `${key}: a wrong answer is rejected`);
    }
});

test('calculations match hand-worked values', () => {
  const fixed = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  const ag = CALCS.aniongap.make(fixed([0.5, 0.5, 0.5])); // Na 137, Cl 101, HCO3 18
  assert.equal(ag.answer, 137 - (101 + 18));
  const nnt = CALCS.nnt.make(fixed([0.5, 0.5])); // control 25%, treated about 13%
  assert.equal(nnt.answer, Math.ceil(1 / ((25 - Math.round(2 + 0.5 * 21)) / 100)));
  assert.equal(checkAnswer(ag, 'abc').valid, false);
  assert.equal(checkAnswer(ag, `${ag.answer} mEq/L`).correct, true, 'units typed after the number are fine');
});

test('share links round-trip a deck without review history', async () => {
  const cards = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, q: `Why does X${i} cause Y?`, a: 'Because of Z.', topic: 'Topic', deck: 'Physiology', due: 123, stability: 4 }));
  const code = await encodeShare(packItems('cards', 'Renal deck', cards));
  assert.ok(code.length < 3000, `compact link (${code.length} chars)`);
  const back = await decodeShare(code);
  assert.equal(back.kind, 'cards');
  assert.equal(back.items.length, 40);
  assert.equal(back.items[0].due, undefined, 'personal scheduling is not shared');
  await assert.rejects(decodeShare('zgarbage'));
});

test('cost estimate is proportional and clearly formatted', () => {
  const c = estimateCost(40000, 20000);
  assert.equal(c.inTok, 10000);
  assert.equal(c.outTok, 5000);
  assert.ok(Math.abs(c.usd - (10000 * 3 + 5000 * 15) / 1e6) < 1e-9);
  assert.equal(formatUsd(0.004), '<$0.01');
  assert.equal(formatUsd(0.105), '$0.10');
});

test('server: explain-back grading, rotation focus, reported corrections and guideline flags', () => {
  const eb = buildTeachingRequest({ messages: [{ role: 'user', content: 'Preload is the stretch before contraction.' }], controls: { explainBack: true } });
  assert.equal(eb.mode, 'explainback');
  assert.match(eb.system, /What is missing/);
  const r = buildTeachingRequest({
    messages: [{ role: 'user', content: 'Teach me heart failure from absolute zero' }],
    controls: { rotation: 'internal', depth: 'deep' },
    corrections: [{ note: 'Furosemide is not potassium-sparing.' }, { note: '' }],
  });
  assert.match(r.system, /CURRENT ROTATION: Internal medicine/);
  assert.match(r.system, /treat these as claims to check, not facts/);
  assert.match(r.system, /Furosemide is not potassium-sparing/);
  assert.match(r.system, /\[!CHECK\]/);
  const quick = buildTeachingRequest({ messages: [{ role: 'user', content: 'What is normal potassium?' }], controls: { rotation: 'surgery' } });
  assert.doesNotMatch(quick.system, /CURRENT ROTATION/, 'short answers stay lean');
});

test('cloze cards blank out the highlighted phrase within its own sentence', async () => {
  const { buildCloze } = await import('../frontend/js/notebook-pure.js');
  const ctx = 'Albumin keeps water inside capillaries. When plasma albumin falls, oncotic pressure drops and fluid leaks out. Edema follows.';
  const c = buildCloze(ctx, 'oncotic pressure');
  assert.equal(c.q, 'Fill in the blank: When plasma albumin falls, _____ drops and fluid leaks out.');
  assert.match(c.a, /^oncotic pressure/);
  assert.match(buildCloze('', 'Starling forces').q, /_____ \(2 words\)/, 'still useful without context');
  assert.equal(buildCloze(ctx, ''), null);
});

test('practice-exam projection is a line through your own scores, only with enough points', async () => {
  const { fitLine } = await import('../frontend/js/notebook-pure.js');
  assert.equal(fitLine([{ x: 0.4, y: 210 }, { x: 0.5, y: 220 }]), null, 'needs at least three scores');
  const line = fitLine([{ x: 0.4, y: 210 }, { x: 0.5, y: 220 }, { x: 0.6, y: 230 }]);
  assert.ok(Math.abs(line.predict(0.7) - 240) < 1e-6);
  assert.ok(line.resid < 1e-6);
});

test('the concept-map exercise mixes real links with unrelated distractors', async () => {
  const { mapQuizItems } = await import('../frontend/js/notebook-pure.js');
  const { KnowledgeGraph } = await import('../frontend/js/graph.js');
  const g = new KnowledgeGraph();
  let s = 3;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const items = mapQuizItems(g.get('nephrotic-syndrome'), g, rand);
  const kinds = new Set(items.map((i) => i.answer));
  assert.ok(kinds.has('prereq') && kinds.has('none') && kinds.has('causes'), [...kinds].join(','));
  assert.ok(items.filter((i) => i.answer === 'none').every((i) => g.find(i.label)?.system !== 'Renal'), 'distractors come from other systems');
});

test('interleaving alternates decks; search ranking prefers items matching every word', async () => {
  const { interleave, scoreText } = await import('../frontend/js/notebook-pure.js');
  const cards = ['A', 'A', 'A', 'B', 'B', 'C'].map((deck, i) => ({ id: i, deck }));
  assert.deepEqual(interleave(cards).map((c) => c.deck), ['A', 'B', 'C', 'A', 'B', 'A']);
  assert.ok(scoreText('Nephrotic syndrome causes edema', ['nephrotic', 'edema']) > scoreText('Nephrotic syndrome only', ['nephrotic', 'edema']));
  assert.equal(scoreText('unrelated text', ['nephrotic']), 0);
});
