import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, clearAuth, getAuth, getAuthHeaders, setAuth } from '@/lib/auth-client';

const TOKEN_KEY = 'accessToken';
const BUSINESS_ID_KEY = 'businessId';

function makeToken(payload: object): string {
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64');
  return ['hmac-sha256', b64(payload), 'sig'].join('.');
}

describe('auth-client', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('setAuth / getAuth', () => {
    it('stores the token and business id, returns them on getAuth', () => {
      setAuth({ accessToken: 'tok', businessId: 'biz-1' });

      expect(getAuth()).toEqual({ accessToken: 'tok', businessId: 'biz-1' });
    });

    it('returns null when the token is missing', () => {
      window.localStorage.setItem(BUSINESS_ID_KEY, 'biz-1');
      expect(getAuth()).toBeNull();
    });

    it('returns null when the business id is missing', () => {
      window.localStorage.setItem(TOKEN_KEY, 'tok');
      expect(getAuth()).toBeNull();
    });

    it('returns null when nothing is stored', () => {
      expect(getAuth()).toBeNull();
    });

    it('clearAuth removes both keys', () => {
      setAuth({ accessToken: 'tok', businessId: 'biz-1' });
      clearAuth();
      expect(getAuth()).toBeNull();
    });
  });

  describe('getAuthHeaders', () => {
    it('returns the bearer token and business id header when authed', () => {
      setAuth({ accessToken: 'tok', businessId: 'biz-1' });
      expect(getAuthHeaders()).toEqual({
        Authorization: 'Bearer tok',
        'x-business-id': 'biz-1',
      });
    });

    it('returns an empty object when unauthenticated', () => {
      expect(getAuthHeaders()).toEqual({});
    });
  });

  describe('apiFetch', () => {
    it('passes relative paths through to fetch for the Next.js rewrite to handle', async () => {
      setAuth({ accessToken: 'tok', businessId: 'biz-1' });
      const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('/api/business/me', { method: 'GET' });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/business/me',
        expect.anything(),
      );
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer tok');
      expect(headers.get('x-business-id')).toBe('biz-1');
    });

    it('leaves the headers empty when there is no session', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('/api/business/me', { method: 'GET' });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/business/me',
        expect.anything(),
      );
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
      expect(headers.get('x-business-id')).toBeNull();
    });

    it('preserves caller-provided headers and only adds auth ones', async () => {
      setAuth({ accessToken: 'tok', businessId: 'biz-1' });
      const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('/api/business/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Headers;
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Authorization')).toBe('Bearer tok');
    });

    it('passes through the response from fetch', async () => {
      const fake = new Response('done', { status: 200 });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fake));

      const res = await apiFetch('/api/business/me');

      expect(res).toBe(fake);
    });

    it('passes through already-absolute URLs unchanged', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('https://example.com/path');

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/path', expect.anything());
    });
  });

  describe('security', () => {
    it('does not leak the token into the business id header', () => {
      const secret = 'secret-token-value';
      setAuth({ accessToken: secret, businessId: 'biz-1' });
      const headers = getAuthHeaders();
      expect(headers['x-business-id']).not.toContain(secret);
      expect(headers.Authorization).toBe(`Bearer ${secret}`);
    });
  });
});

// makeToken is intentionally NOT exported; it is a local helper.
// Other test files define their own token fixture.
