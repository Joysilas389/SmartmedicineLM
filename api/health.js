import { json } from './_http.js';
import { authEnabled, loginRequired } from './_auth.js';

export const config = { runtime: 'edge' };

export default async function handler() {
  return json({
    ok: true,
    service: 'SmartMedicineLM',
    version: '0.3.0',
    accounts: authEnabled(),
    localStore: process.env.SM_LOCAL_STORE === '1',
    dataDir: process.env.SM_DATA_DIR_LABEL || undefined,
    loginRequired: loginRequired(),
    time: new Date().toISOString(),
  });
}
