import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // Keep the Vitest defaults, then drop the Playwright suite and the Next
    // build output so only source tests are collected.
    exclude: [...configDefaults.exclude, 'e2e/**', '.next/**'],
    setupFiles: './src/test-setup.ts',
  },
});
