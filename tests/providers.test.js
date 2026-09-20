import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicProvider } from '../ai/providers/anthropic.js';
import { createOpenAICompatibleProvider } from '../ai/providers/openai-compatible.js';
import { streamToString, _resetAdjustments } from '../ai/providers/base.js';

function sse(events) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
}

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return handler(body, calls.length);
  };
  return calls;
}

test('Anthropic: retries without temperature when the model rejects it, and remembers', async () => {
  _resetAdjustments();
  const calls = mockFetch((body) =>
    'temperature' in body
      ? new Response(JSON.stringify({ error: { message: '`temperature` is deprecated for this model.' } }), { status: 400 })
      : new Response(sse([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } }]), { status: 200 }),
  );
  const p = createAnthropicProvider({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-sonnet-5' });
  assert.equal(await streamToString(await p.stream({ system: 's', messages: [{ role: 'user', content: 'hi' }] })), 'ok');
  assert.equal(calls.length, 2);
  assert.ok(!('temperature' in calls[1]));
  await streamToString(await p.stream({ system: 's', messages: [{ role: 'user', content: 'again' }] }));
  assert.equal(calls.length, 3, 'second request goes straight through without temperature');
  assert.ok(!('temperature' in calls[2]));
});

test('Anthropic: unrelated 400 errors are reported, not retried', async () => {
  _resetAdjustments();
  const calls = mockFetch(() => new Response(JSON.stringify({ error: { message: 'messages: field required' } }), { status: 400 }));
  const p = createAnthropicProvider({ ANTHROPIC_API_KEY: 'k' });
  await assert.rejects(p.stream({ system: 's', messages: [] }), /messages: field required\./);
  assert.equal(calls.length, 1);
});

test('OpenAI-compatible: renames max_tokens for reasoning models', async () => {
  _resetAdjustments();
  const calls = mockFetch((body) =>
    'max_tokens' in body
      ? new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } }), { status: 400 })
      : new Response(sse([{ choices: [{ delta: { content: 'fine' } }] }]), { status: 200 }),
  );
  const p = createOpenAICompatibleProvider({ OPENAI_API_KEY: 'k', OPENAI_MODEL: 'o-test' });
  assert.equal(await streamToString(await p.stream({ system: 's', messages: [{ role: 'user', content: 'x' }] })), 'fine');
  assert.equal(calls[1].max_completion_tokens, 4000);
});
