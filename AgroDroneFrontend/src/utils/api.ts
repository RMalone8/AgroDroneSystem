const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;
const TOKEN_KEY   = 'agro_token';

/**
 * fetch() wrapper that automatically attaches the stored JWT as the
 * Authorization header. All authenticated API calls should use this instead
 * of calling fetch() directly.
 */
export function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token ?? ''}`,
    },
  });
}
