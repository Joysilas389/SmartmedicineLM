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

export async function upstreamError(res, providerName) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      detail = body?.error?.message || body?.message || text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ' Check the API key in your Vercel environment variables.'
      : res.status === 404
      ? ' Check the model name in your Vercel environment variables.'
      : res.status === 429
      ? ' The provider is rate-limiting requests; wait a moment and try again.'
      : '';
  return new ProviderError(`${providerName} returned ${res.status}: ${String(detail).slice(0, 300)}.${hint}`, 502);
}
