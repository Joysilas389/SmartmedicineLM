import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeachingRequest, maxTokensFor, depthFromText } from '../ai/teacher/controller.js';
import { createAnthropicProvider } from '../ai/providers/anthropic.js';

const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
async function streamWith(events) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => sse(events);
  try {
    const p = createAnthropicProvider({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-test' });
    const s = await p.stream({ system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
    return await new Response(s).text();
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('the provider tells "cut off partway" from "nothing written at all"', async () => {
  const partial = await streamWith([
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Breech presentation is…' } },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
  ]);
  assert.match(partial, /Breech presentation is…\n\n\[\[SM:TRUNCATED\]\]$/);
  const empty = await streamWith([
    { type: 'content_block_start', content_block: { type: 'thinking' } },
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'long reasoning…' } },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
  ]);
  assert.equal(empty, '[[SM:EMPTY]]', 'budget spent before any visible text');
  const refused = await streamWith([{ type: 'message_delta', delta: { stop_reason: 'refusal' } }]);
  assert.equal(refused, '[[SM:REFUSED]]');
  const ok = await streamWith([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done.' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);
  assert.equal(ok, 'Done.');
});

test('"in detail" and "guidelines" raise the depth; explicit choices are never lowered', () => {
  assert.equal(depthFromText("Explain to me the RCOG guidelines of breech presentation and it's management in detail", 'standard'), 'deep');
  assert.equal(depthFromText('Tell me everything about preeclampsia', 'standard'), 'comprehensive');
  assert.equal(depthFromText('What is the normal potassium?', 'standard'), 'standard');
  assert.equal(depthFromText('explain it in detail', 'comprehensive'), 'comprehensive', 'never lowers a chosen depth');
});

test('explanatory answers always get enough room; the retry boost multiplies it, within a cap', () => {
  assert.ok(maxTokensFor('standard', 'standard') >= 4000);
  assert.equal(maxTokensFor('concise', 'quick') < 4000, true, 'short answers stay short');
  assert.equal(maxTokensFor('standard', 'deep', 2.5), Math.round(6000 * 2.5));
  assert.ok(maxTokensFor('learn', 'comprehensive', 4) <= 32000);
  const r = buildTeachingRequest({ messages: [{ role: 'user', content: "Explain to me the RCOG guidelines of breech presentation and it's management in detail" }], controls: { depth: 'standard' } });
  assert.equal(r.depth, 'deep');
  assert.ok(r.maxTokens >= 6000, `the breech request now gets ${r.maxTokens} tokens (was 3000)`);
  const boosted = buildTeachingRequest({ messages: [{ role: 'user', content: 'Explain breech presentation in detail' }], controls: { depth: 'standard', budgetBoost: 2.5 } });
  assert.equal(boosted.maxTokens, 15000);
});
