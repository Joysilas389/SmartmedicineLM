import { ProviderError, sseToText, streamToString, postWithFallback } from './base.js';

export function createAnthropicProvider(env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  const baseUrl = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');

  const toAnthropic = (messages) =>
    messages.map((m) => {
      if (!m.images?.length) return { role: m.role, content: m.content || ' ' };
      return {
        role: m.role,
        content: [
          ...m.images.map((img) => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mediaType, data: img.data },
          })),
          { type: 'text', text: m.content || 'Explain this image.' },
        ],
      };
    });

  async function stream({ system, messages, maxTokens = 4000, temperature = 0.4 }) {
    if (!apiKey) throw new ProviderError('ANTHROPIC_API_KEY is not set.', 500);
    const res = await postWithFallback(
      `${baseUrl}/v1/messages`,
      { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, system, max_tokens: maxTokens, temperature, stream: true, messages: toAnthropic(messages) },
      'Anthropic',
    );
    return sseToText(res.body, (evt) => {
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') return evt.delta.text;
      if (evt.type === 'message_delta' && evt.delta?.stop_reason === 'max_tokens')
        return '\n\n> [!NOTE]\n> This answer reached the length limit. Ask me to "continue" to get the rest.';
      if (evt.type === 'error') return `\n\n⚠️ Model error: ${evt.error?.message || 'unknown error'}`;
      return '';
    });
  }

  return {
    id: 'anthropic',
    name: 'Anthropic',
    model,
    supportsVision: true,
    configured: Boolean(apiKey),
    stream,
    vision: (args) => stream(args),
    async generate(args) {
      return streamToString(await stream(args));
    },
    async embed() {
      throw new ProviderError('Anthropic does not provide an embeddings endpoint. Configure an embedding provider.', 501);
    },
  };
}
