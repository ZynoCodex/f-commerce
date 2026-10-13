const TOKEN_KEY = 'accessToken';
const BUSINESS_ID_KEY = 'businessId';

export interface AuthUser {
  accessToken: string;
  businessId: string;
}

export function setAuth(user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, user.accessToken);
  localStorage.setItem(BUSINESS_ID_KEY, user.businessId);
}

export function getAuth(): AuthUser | null {
  const accessToken = localStorage.getItem(TOKEN_KEY);
  const businessId = localStorage.getItem(BUSINESS_ID_KEY);
  if (!accessToken || !businessId) return null;
  return { accessToken, businessId };
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BUSINESS_ID_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const auth = getAuth();
  if (!auth) return {};
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'x-business-id': auth.businessId,
  };
}

export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const authHeaders = getAuthHeaders();
  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  // Pass relative paths through directly. Next.js rewrites in next.config.ts
  // forward /api/* to the Express backend, which works in both dev and
  // production. No hardcoded host means this works in any deployment.
  return fetch(input, { ...init, headers });
}
