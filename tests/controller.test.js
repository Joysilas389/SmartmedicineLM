import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent, buildTeachingRequest, SOURCE_LOCKED_MESSAGE, sanitizeMessages } from '../ai/teacher/controller.js';
import { getProvider } from '../ai/providers/index.js';
import { streamToString } from '../ai/providers/base.js';

test('adapts to what was asked (spec §78)', () => {
  assert.equal(detectIntent('What is the function of aldosterone?'), 'concise');
  assert.equal(detectIntent('I know nothing about aldosterone. Teach me from absolute zero.'), 'learn');
  assert.equal(detectIntent('Give me a 2-minute review of aldosterone.'), 'review');
  assert.equal(detectIntent('Test me.'), 'recall');
  assert.equal(detectIntent('Explain this.', true), 'image');
  assert.equal(detectIntent('Why does nephrotic syndrome cause edema and how does that relate to the Starling forces in the capillary bed?'), 'standard');
});

test('explicit mode beats detected intent', () => {
  const r = buildTeachingRequest({ messages: [{ role: 'user', content: 'What is RAAS?' }], controls: { mode: 'learn', depth: 'deep' } });
  assert.equal(r.mode, 'learn');
  assert.match(r.system, /LEARN FROM ZERO/);
  assert.match(r.system, /Layer 0/);
});

test('source-locked mode refuses without sources', () => {
  const r = buildTeachingRequest({ messages: [{ role: 'user', content: 'Teach me AKI' }], controls: { knowledgeMode: 'library' } });
  assert.equal(r.refusal, SOURCE_LOCKED_MESSAGE);
});

test('sources are tagged and injected', () => {
  const r = buildTeachingRequest({
    messages: [{ role: 'user', content: 'Teach me nephrotic syndrome from zero' }],
    sources: [{ tag: 'S1', docName: 'Renal notes.pdf', page: 42, text: 'Podocyte injury causes proteinuria.' }],
    controls: { knowledgeMode: 'hybrid' },
  });
  assert.match(r.system, /tag="S1"/);
  assert.match(r.system, /page="42"/);
});

test('policy toggles remove modules', () => {
  const r = buildTeachingRequest({
    messages: [{ role: 'user', content: 'Teach me RAAS from zero' }],
    controls: { policy: { flashcards: false, spatial_anchor: false } },
  });
  assert.doesNotMatch(r.system, /language "flashcards"/);
  assert.doesNotMatch(r.system, /spatial anchor for this is/);
});

test('message sanitising', () => {
  const m = sanitizeMessages([
    { role: 'assistant', content: 'hi' },
    { role: 'user', content: 'a', images: [{ mediaType: 'image/png', data: 'AAAA' }] },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c', images: [{ mediaType: 'text/html', data: 'x' }] },
  ]);
  assert.equal(m[0].role, 'user');
  assert.equal(m.at(-1).images.length, 0);
  assert.equal(m[0].images, undefined);
});

test('demo provider streams when no key is set', async () => {
  const p = getProvider({});
  assert.equal(p.id, 'demo');
  const text = await streamToString(await p.stream({ messages: [{ role: 'user', content: 'hi' }], meta: { mode: 'learn' } }));
  assert.match(text, /demo mode/);
});

test('provider selection', () => {
  assert.equal(getProvider({ ANTHROPIC_API_KEY: 'x' }).id, 'anthropic');
  assert.equal(getProvider({ OPENAI_API_KEY: 'x' }).id, 'openai-compatible');
  assert.equal(getProvider({ MODEL_PROVIDER: 'groq', OPENAI_API_KEY: 'x' }).id, 'openai-compatible');
});

test('"Continue" gets its own mode with a large budget', async () => {
  const { detectIntent, maxTokensFor } = await import('../ai/teacher/controller.js');
  assert.equal(detectIntent('Continue'), 'continue');
  assert.equal(detectIntent('please continue where you stopped'), 'continue');
  assert.notEqual(detectIntent('continue the discussion of how continuous murmurs arise in a PDA and why they matter clinically today'), 'continue');
  assert.ok(maxTokensFor('continue', 'deep') >= 12000);
  assert.ok(maxTokensFor('learn', 'deep') >= 12000);
});
