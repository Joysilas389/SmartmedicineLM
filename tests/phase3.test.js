import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rrf } from '../frontend/js/retrieval.js';
import { dot } from '../frontend/js/embeddings.js';
import { buildTeachingRequest } from '../ai/teacher/controller.js';
import { IMAGE_KINDS } from '../ai/teacher/modules.js';

const img = { mediaType: 'image/jpeg', data: 'AAAA' };

test('hybrid search: reciprocal rank fusion rewards agreement between keyword and semantic rankings', () => {
  const fused = rrf([['a', 'b', 'c'], ['c', 'a', 'd']]);
  assert.equal(fused[0].id, 'a', 'high in both lists');
  assert.equal(fused[1].id, 'c');
  assert.deepEqual(fused.map((f) => f.id).sort(), ['a', 'b', 'c', 'd'], 'semantic-only hits are kept');
  assert.ok(Math.abs(dot(Float32Array.of(0.6, 0.8), Float32Array.of(0.6, 0.8)) - 1) < 1e-6);
});

test('every image kind gets its own systematic reading approach', () => {
  for (const kind of IMAGE_KINDS) {
    const r = buildTeachingRequest({ messages: [{ role: 'user', content: 'Explain this', images: [img] }], controls: { imageKind: kind } });
    assert.equal(r.mode, 'image');
    assert.match(r.system, kind === 'auto' ? /IMAGE TYPE: not specified/ : new RegExp(`IMAGE TYPE \\(chosen by the learner\\): ${kind.toUpperCase()}`));
    assert.match(r.system, /Image safety/);
  }
  const ecg = buildTeachingRequest({ messages: [{ role: 'user', content: 'x', images: [img] }], controls: { imageKind: 'ecg' } }).system;
  assert.match(ecg, /Rate/);
  assert.match(ecg, /QTc/);
  assert.match(ecg, /Never invent a measurement/);
});

test('image practice: quiz hides the answer; the follow-up is evaluated against the resent image', () => {
  const quiz = buildTeachingRequest({ messages: [{ role: 'user', content: '', images: [img] }], controls: { imageKind: 'histology', imageTask: 'quiz' } });
  assert.equal(quiz.mode, 'image_quiz');
  assert.match(quiz.system, /Do NOT interpret the image/);
  assert.match(quiz.system, /stain/);
  assert.doesNotMatch(quiz.system, /mermaid/i);
  assert.ok(quiz.maxTokens <= 1000);
  const evalReq = buildTeachingRequest({
    messages: [
      { role: 'user', content: 'read it', images: [img] },
      { role: 'assistant', content: 'Your checklist…' },
      { role: 'user', content: 'Simple cuboidal epithelium, kidney tubule' },
    ],
    controls: { imageKind: 'histology', imageEval: true, knowledgeMode: 'library' },
  });
  assert.equal(evalReq.mode, 'image_eval');
  assert.ok(!evalReq.refusal, 'source-locked mode does not refuse to grade an image');
  assert.equal(evalReq.messages[0].images.length, 1);
  assert.match(evalReq.system, /What you got right/);
  assert.match(evalReq.system, /HISTOLOGY/);
});

test('"continue" after an image practice answer is still a continuation', () => {
  const r = buildTeachingRequest({ messages: [{ role: 'user', content: 'continue' }], controls: { imageEval: true } });
  assert.equal(r.mode, 'continue');
});
