import { getProvider } from '../ai/providers/index.js';
import { json } from './_http.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  const p = getProvider(process.env);
  return json({
    provider: p.id,
    name: p.name,
    model: p.model,
    vision: p.supportsVision,
    configured: p.configured,
    accessCodeRequired: Boolean(process.env.APP_ACCESS_CODE),
  });
}
