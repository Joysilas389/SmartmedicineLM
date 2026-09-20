/**
 * ModelProvider contract (spec §40).
 * Every provider exposes the same surface so SmartMedicineLM stays model-independent:
 *
 *   id, name, model, supportsVision, configured
 *   generate({ system, messages, maxTokens, temperature }) -> Promise<string>
 *   stream({ system, messages, maxTokens, temperature })   -> Promise<ReadableStream<Uint8Array>> of UTF-8 text
 *   embed(texts)                                            -> Promise<number[][]>
 *   vision(args)  -> same as stream(); images travel inside messages[].images
 *
 * Internal message format:
 *   { role: 'user' | 'assistant', content: string, images?: [{ mediaType, data }] }   (data = base64)
 */

export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const encoder = new TextEncoder();

/** Turns an upstream Server-Sent-Events body into a plain UTF-8 text stream. */
export function sseToText(body, extract) {
  const decoder = new TextDecoder();
  let buffer = '';
  const handleLine = (line, controller) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const text = extract(JSON.parse(data));
      if (text) controller.enqueue(encoder.encode(text));
    } catch {
      /* ignore keep-alive or malformed lines */
    }
  };
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          handleLine(buffer.slice(0, idx), controller);
          buffer = buffer.slice(idx + 1);
        }
      },
      flush(controller) {
        if (buffer) handleLine(buffer, controller);
      },
    })
  );
}

/** Collects a text stream into a string (used by generate()). */
export async function streamToString(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** Appended to a stream when the model hit its output limit; the client renders it as a Continue prompt. */
export const TRUNCATION_MARK = '\n\n[[SM:TRUNCATED]]';

export async function upstreamError(res, providerName) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  return errorFromBody(res.status, text, providerName);
}

function errorDetail(text) {
  try {
    const body = JSON.parse(text);
    return body?.error?.message || body?.message || text;
  } catch {
    return text;
  }
}

export function errorFromBody(status, text, providerName) {
  const detail = String(errorDetail(text) || 'no details').slice(0, 300).replace(/[.\s]+$/, '');
  const hint =
    status === 401 || status === 403
      ? ' Check the API key in your Vercel environment variables.'
      : status === 404
      ? ' Check the model name in your Vercel environment variables.'
      : status === 429
      ? ' The provider is rate-limiting requests; wait a moment and try again.'
      : '';
  return new ProviderError(`${providerName} returned ${status}: ${detail}.${hint}`, 502);
}

/*
 * Newer models reject some sampling parameters (e.g. `temperature` on recent
 * Claude models, `max_tokens` on OpenAI reasoning models). Instead of hard-coding
 * model lists, POST once; if the API answers 400 naming one of these parameters,
 * drop or rename it, retry, and remember the adjustment for this model.
 */
const OPTIONAL_PARAMS = ['temperature', 'top_p', 'top_k'];
const adjustments = new Map(); // model -> { drop: Set, rename: Map }

function applyAdjustments(body) {
  const adj = adjustments.get(body.model);
  if (!adj) return body;
  const out = { ...body };
  for (const k of adj.drop) delete out[k];
  for (const [from, to] of adj.rename)
    if (from in out) {
      out[to] = out[from];
      delete out[from];
    }
  return out;
}

function learnFrom(body, detail) {
  const msg = String(detail).toLowerCase();
  const adj = adjustments.get(body.model) || { drop: new Set(), rename: new Map() };
  if ('max_tokens' in body && msg.includes('max_tokens') && msg.includes('max_completion_tokens')) {
    adj.rename.set('max_tokens', 'max_completion_tokens');
  } else {
    const key = OPTIONAL_PARAMS.find((k) => k in body && msg.includes(k));
    if (!key) return false;
    adj.drop.add(key);
  }
  adjustments.set(body.model, adj);
  return true;
}

export async function postWithFallback(url, headers, body, providerName) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const sent = applyAdjustments(body);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(sent) });
    if (res.ok && res.body) return res;
    if (res.status !== 400) throw await upstreamError(res, providerName);
    let text = '';
    try {
      text = await res.text();
    } catch {
      /* ignore */
    }
    if (!learnFrom(sent, errorDetail(text))) throw errorFromBody(res.status, text, providerName);
  }
  throw new ProviderError(`${providerName} rejected the request parameters.`, 502);
}

/** Test helper. */
export function _resetAdjustments() {
  adjustments.clear();
}
