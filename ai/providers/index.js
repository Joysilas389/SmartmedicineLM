import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { createDemoProvider } from './demo.js';

/**
 * Picks the provider from environment variables. Adding a new provider
 * (Ollama-native, vLLM, a fine-tuned SmartMedicineLM model...) means adding
 * one file with the same interface and one case here.
 */
export function getProvider(env = {}) {
  const choice = (env.MODEL_PROVIDER || '').toLowerCase().trim();
  if (choice === 'anthropic') return createAnthropicProvider(env);
  if (['openai', 'openai-compatible', 'groq', 'openrouter', 'ollama', 'vllm'].includes(choice))
    return createOpenAICompatibleProvider(env);
  if (choice === 'demo') return createDemoProvider();
  if (env.ANTHROPIC_API_KEY) return createAnthropicProvider(env);
  if (env.OPENAI_API_KEY) return createOpenAICompatibleProvider(env);
  return createDemoProvider();
}
