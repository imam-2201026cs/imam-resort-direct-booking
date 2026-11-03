import { vi } from 'vitest';

/** Replace fetch with a tiny router. routes: [[METHOD, RegExp, (body, match, url) => ({status?, json})]] */
export function mockApi(routes) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const path = String(url).replace(/^.*\/api/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, headers: init.headers });
    for (const [m, re, handler] of routes) {
      const match = path.match(re);
      if (m === method && match) {
        const out = await handler(body, match, path);
        const status = out.status ?? 200;
        return { ok: status < 400, status, json: async () => out.json ?? {} };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: `unmocked ${method} ${path}` } }) };
  }));
  return calls;
}
