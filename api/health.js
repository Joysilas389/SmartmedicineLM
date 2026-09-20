import { json } from './_http.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  return json({ ok: true, service: 'SmartMedicineLM', version: '0.1.0', time: new Date().toISOString() });
}
