export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Optional shared-secret gate so strangers who find the URL can't spend your API credits. */
export function checkAccess(req) {
  const code = process.env.APP_ACCESS_CODE;
  if (!code) return null;
  if (req.headers.get('x-access-code') === code) return null;
  return json({ error: 'This deployment needs an access code. Add it in Settings → AI → Access code.', code: 'ACCESS_CODE' }, 401);
}
