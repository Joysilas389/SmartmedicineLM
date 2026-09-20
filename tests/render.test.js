import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareText } from '../frontend/js/render.js';

test('a diagram cut off mid-way is removed and flagged', () => {
  const raw = 'Intro\n\n```mermaid\nflowchart TD\nA["Podocyte injury"] --> B["Loss\n\n[[SM:TRUNCATED]]';
  const r = prepareText(raw);
  assert.equal(r.truncated, true);
  assert.equal(r.cutBlock, 'mermaid');
  assert.equal(r.text, 'Intro');
});

test('legacy length-limit note is recognised too', () => {
  const raw = 'Text\n```mermaid\nflowchart TD\n\n> [!NOTE]\n> This answer reached the length limit. Ask me to "continue" to get the rest.';
  const r = prepareText(raw);
  assert.equal(r.truncated, true);
  assert.equal(r.text, 'Text');
});

test('an ordinary code block cut off is closed, not dropped', () => {
  const r = prepareText('Code:\n```js\nconst a = 1;[[SM:TRUNCATED]]');
  assert.equal(r.cutBlock, null);
  assert.ok(r.text.endsWith('\n```'));
});

test('complete answers pass through untouched', () => {
  const t = 'Done.\n```mermaid\nflowchart TD\nA-->B\n```';
  assert.deepEqual(prepareText(t), { text: t, truncated: false, cutBlock: null });
});
