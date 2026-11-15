let token = null;
try { token = sessionStorage.getItem('thunai.token'); } catch { /* storage blocked: stay in memory */ }

export const hasToken = () => Boolean(token);
export function setToken(t) {
  token = t;
  try { t ? sessionStorage.setItem('thunai.token', t) : sessionStorage.removeItem('thunai.token'); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No internet connection. Please check and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('thunai:signedout'));
    throw new ApiError(res.status, data.error || 'Something went wrong.');
  }
  return data;
}
