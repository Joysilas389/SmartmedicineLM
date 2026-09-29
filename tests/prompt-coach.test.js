import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInput, suggestPrompts, PROMPT_LIBRARY, firstPlaceholder } from '../frontend/js/prompt-coach.js';
import { KnowledgeGraph } from '../frontend/js/graph.js';

const graph = new KnowledgeGraph();
const VIGNETTE = 'A 5-year-old boy is brought to the clinic because of puffiness around his eyes for 1 week. Blood pressure is 98/60 mm Hg. Urinalysis shows 4+ protein. Which of the following is most likely to be seen on electron microscopy?';
const PASSAGE = 'Albumin generates most of the plasma colloid osmotic pressure. When plasma albumin falls, the force that holds water inside capillaries falls too. Fluid therefore moves into the interstitium of dependent tissues. The patient notices pitting when the skin is pressed, especially at the ankles after standing.';
const LABS = 'Na 128 mEq/L, K 5.9 mEq/L, glucose 540 mg/dL, bicarbonate 10 mEq/L, pH 7.18';

test('recognises what the learner has typed or pasted', () => {
  assert.equal(classifyInput(''), 'empty');
  assert.equal(classifyInput('nephrotic syndrome'), 'topic');
  assert.equal(classifyInput('Why does hypoalbuminemia cause edema?'), 'question');
  assert.equal(classifyInput(VIGNETTE), 'vignette');
  assert.equal(classifyInput(PASSAGE), 'passage');
  assert.equal(classifyInput(LABS), 'labs');
  assert.equal(classifyInput('A 60-year-old man comes to the emergency department with chest pain.'), 'vignette', 'even a one-line stem');
});

test('a vignette gets reasoning prompts that keep the pasted text', () => {
  const s = suggestPrompts(VIGNETTE, { graph });
  assert.ok(s.length >= 4);
  assert.ok(s.some((x) => /Walk me through/.test(x.label)));
  assert.ok(s.some((x) => /Hint only/.test(x.label)), 'offers a no-spoiler option');
  for (const x of s) assert.ok(x.prompt.includes(VIGNETTE), 'the vignette itself is never lost');
  const step2 = suggestPrompts(VIGNETTE, { graph, exam: 'step2ck' });
  assert.ok(step2.some((x) => /Next best step/.test(x.label)), 'Step 2 CK asks for the next step');
  assert.ok(suggestPrompts(VIGNETTE, { graph, exam: 'step1' }).some((x) => /Mechanism/.test(x.label)), 'Step 1 asks for the mechanism');
});

test('a passage gets understanding prompts; labs get interpretation prompts', () => {
  const p = suggestPrompts(PASSAGE, { graph });
  assert.ok(p.some((x) => /plain language/.test(x.label)));
  assert.ok(p.some((x) => /assume I know/.test(x.label)), 'surfaces hidden prerequisites');
  assert.ok(p.every((x) => x.prompt.endsWith(PASSAGE)));
  const l = suggestPrompts(LABS, { graph });
  assert.ok(l.some((x) => /Interpret/.test(x.label)));
});

test('topic prompts are specific to the concept, using the knowledge graph', () => {
  const s = suggestPrompts('nephrotic syndrome', { graph });
  const labels = s.map((x) => x.label).join(' | ');
  assert.match(labels, /Teach me from zero/);
  assert.ok(s.some((x) => /Compare with Nephritic syndrome/.test(x.label)), `uses the graph's differential: ${labels}`);
  assert.ok(s.some((x) => /^Why /.test(x.label)), 'offers to derive a classic finding');
  const pre = suggestPrompts('nephrotic syndrome', { graph }, 8).find((x) => /need first/.test(x.label));
  assert.ok(pre && /Glomerular filtration|Starling forces|Plasma proteins/.test(pre.prompt), 'names the real prerequisites');
  assert.ok(suggestPrompts('some unknown topic', { graph }).some((x) => /Teach me some unknown topic/.test(x.prompt)), 'works for topics outside the graph too');
});

test('a pinned library page makes the suggestions about that page', () => {
  const s = suggestPrompts('', { graph, pinned: { title: 'Renal notes', page: 12 } });
  assert.ok(s.length >= 3);
  assert.ok(s.every((x) => /page 12 of "Renal notes"/.test(x.prompt)));
});

test('the prompt library is complete and every template has a placeholder to fill', () => {
  const titles = PROMPT_LIBRARY.map((g) => g.title).join(' | ');
  for (const t of ['Learn a topic', 'reading', 'vignettes', 'Clinical reasoning', 'Compare']) assert.match(titles, new RegExp(t));
  for (const g of PROMPT_LIBRARY) for (const [, tpl] of g.items) assert.ok(firstPlaceholder(tpl), tpl);
  assert.deepEqual(firstPlaceholder('Teach me [topic] now'), { start: 9, end: 16 });
});
