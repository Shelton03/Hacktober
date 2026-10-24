// fetch wrapper: session cookies + CSRF + business tenancy headers.
// Base '/api' same-origin via nginx proxy in Docker; local dev hits Django directly.

export const API_BASE = '/api';

// When served by `ng serve` (localhost:4200) there is no nginx proxy — call Django directly.
const isDevServer = (): boolean => location.port === '4200' || location.port.startsWith('42');
export const DEV_ORIGIN = 'http://localhost:8000';
const BASE = (): string => (isDevServer() ? `${DEV_ORIGIN}/api` : API_BASE);

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function businessId(): string | null {
  return localStorage.getItem('sme.business_id');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const csrf = getCookie('csrftoken');
  if (csrf) headers['X-CSRFToken'] = csrf;
  const bid = businessId();
  if (bid) headers['X-Business-Id'] = bid;
  return headers;
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: any; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  let url = BASE() + path;
  if (opts.query) {
    const qs = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    credentials: 'include',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.location.href = '/login';
    throw new ApiError(401, 'Session expired', null);
  }
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* no json body */
    }
    const detail =
      body && (body.detail || (typeof body === 'object' && Object.values(body)[0] as any));
    throw new ApiError(res.status, typeof detail === 'string' ? detail : 'Request failed', body);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) =>
    request<T>('GET', path, { query }),
  post: <T>(path: string, body?: any) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: any) => request<T>('PATCH', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** Full URL for a GET (PDF/CSV downloads opened in new tabs). */
  url: (path: string) => BASE() + path,
  /** Download helper: navigates with session cookie; business header via query fallback. */
  download: (path: string) => {
    window.open(BASE() + path, '_blank');
  },
  BASE,
};
