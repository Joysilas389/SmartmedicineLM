import { getProvider } from '../ai/providers/index.js';
import { buildTeachingRequest } from '../ai/teacher/controller.js';
import { json, checkAccess } from './_http.js';
import { requireUser } from './_auth.js';

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 4_000_000;

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const denied = checkAccess(req);
  if (denied) return denied;
  const auth = await requireUser(req);
  if (auth.denied) return auth.denied;

  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return json({ error: 'Request is too large. Attach fewer or smaller images.' }, 413);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!Array.isArray(body?.messages) || !body.messages.length)
    return json({ error: 'messages must be a non-empty array.' }, 400);

  const teaching = buildTeachingRequest(body);
  const headers = {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-teaching-mode': teaching.mode,
    'x-teaching-depth': teaching.depth,
  };

  if (teaching.refusal) {
    return new Response(teaching.refusal, { headers: { ...headers, 'x-source-locked': 'no-support' } });
  }

  const provider = getProvider(process.env);
  if (teaching.messages.at(-1)?.images?.length && !provider.supportsVision) {
    if (provider.id !== 'demo')
      return json({ error: `The configured model (${provider.model}) cannot read images. Use a vision-capable model.` }, 400);
  }

  try {
    const stream = await provider.stream({
      system: teaching.system,
      messages: teaching.messages,
      maxTokens: teaching.maxTokens,
      temperature: teaching.temperature,
      meta: { mode: teaching.mode, depth: teaching.depth, sourceCount: teaching.sources.length },
    });
    return new Response(stream, { headers: { ...headers, 'x-provider': provider.id } });
  } catch (err) {
    return json({ error: err.message || 'The model request failed.' }, err.status || 502);
  }
}
