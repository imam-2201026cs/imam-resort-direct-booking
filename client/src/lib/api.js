const BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Thin fetch wrapper: cookies, the CSRF header, and normalised errors. */
export async function api(path, { method = 'GET', body, signal, headers } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        'X-Requested-With': 'resort-web',
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network problem. Please check your connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || 'Something went wrong', e.details);
  }
  return data;
}
