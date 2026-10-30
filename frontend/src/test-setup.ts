import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Query helpers default to one second. Under a loaded run, debounced requests
// can take longer than that, so wait up to five seconds before giving up.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});

if (
  typeof window !== 'undefined' &&
  (!window.localStorage || typeof window.localStorage.getItem !== 'function')
) {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    },
    writable: true,
    configurable: true,
  });
}
