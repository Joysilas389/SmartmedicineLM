import { ProviderError, sseToText, streamToString, upstreamError, postWithFallback, TRUNCATION_MARK } from './base.js';

/**
 * Works with any OpenAI-compatible Chat Completions API:
 * OpenAI, Groq, OpenRouter, Together, DeepInfra, a self-hosted vLLM server,
 * or Ollama (http://host:11434/v1). This is the path to open-weight models (spec §39).
 */
export function createOpenAICompatibleProvider(env) {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const supportsVision = String(env.OPENAI_VISION ?? 'true').toLowerCase() !== 'false';

  const toOpenAI = (system, messages) => [
    { role: 'system', content: system },
    ...messages.map((m) => {
      if (!m.images?.length || !supportsVision) return { role: m.role, content: m.content || ' ' };
      return {
        role: m.role,
        content: [
          ...m.images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mediaType};base64,${img.data}` },
          })),
          { type: 'text', text: m.content || 'Explain this image.' },
        ],
      };
    }),
  ];

  const headers = () => ({
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  });

  async function stream({ system, messages, maxTokens = 4000, temperature = 0.4 }) {
    if (!apiKey && !/localhost|127\.0\.0\.1/.test(baseUrl))
      throw new ProviderError('OPENAI_API_KEY is not set.', 500);
    const res = await postWithFallback(
      `${baseUrl}/chat/completions`,
      headers(),
      { model, stream: true, temperature, max_tokens: maxTokens, messages: toOpenAI(system, messages) },
      'Model API',
    );
    return sseToText(res.body, (evt) => {
      if (evt.error) return `\n\n⚠️ Model error: ${evt.error.message || 'unknown error'}`;
      const choice = evt.choices?.[0];
      let text = choice?.delta?.content || '';
      if (choice?.finish_reason === 'length')
        text += TRUNCATION_MARK;
      return text;
    });
  }

  return {
    id: 'openai-compatible',
    name: 'OpenAI-compatible',
    model,
    supportsVision,
    configured: Boolean(apiKey),
    stream,
    vision: (args) => stream(args),
    async generate(args) {
      return streamToString(await stream(args));
    },
    async embed(texts) {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ model: env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small', input: texts }),
      });
      if (!res.ok) throw await upstreamError(res, 'Embeddings API');
      const body = await res.json();
      return body.data.map((d) => d.embedding);
    },
  };
}
