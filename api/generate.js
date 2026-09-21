/*
 * POST /api/generate — structured generation tasks (Phase 2).
 *   { task: 'questions', topics, count, difficulty, sources, sourceLocked, avoid, focusErrors }
 * The model's JSON is streamed through as text so long generations never hit the edge
 * function's time-to-first-byte limit; the browser parses and validates it.
 */
import { getProvider } from '../ai/providers/index.js';
import { buildQuestionRequest } from '../ai/tasks/questions.js';
import { DEMO_QUESTIONS } from '../ai/tasks/demo-questions.js';
import { json, checkAccess } from './_http.js';
import { requireUser } from './_auth.js';

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 1_000_000;

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const denied = checkAccess(req);
  if (denied) return denied;
  const auth = await requireUser(req);
  if (auth.denied) return auth.denied;
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ error: 'Request is too large.' }, 413);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (body?.task !== 'questions') return json({ error: 'Unknown task.' }, 400);

  const request = buildQuestionRequest(body);
  if (request.error) return json({ error: request.error }, 400);

  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };
  const provider = getProvider(process.env);

  if (provider.id === 'demo') {
    // Demo mode: items written for the chosen exam first.
    const ordered = [...DEMO_QUESTIONS.questions].sort((a, b) => (b.exam === request.exam) - (a.exam === request.exam));
    const sample = { questions: ordered.slice(0, request.count).map(({ exam, ...q }) => q) };
    return new Response(JSON.stringify(sample), { headers: { ...headers, 'x-provider': 'demo' } });
  }

  try {
    const stream = await provider.stream({
      system: request.system,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    });
    return new Response(stream, { headers: { ...headers, 'x-provider': provider.id } });
  } catch (err) {
    return json({ error: err.message || 'The model request failed.' }, err.status || 502);
  }
}
