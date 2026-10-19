import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database integration tests share one PostgreSQL test database, so test
    // files must not run concurrently.
    fileParallelism: false,
    // Vitest no longer ignores build output by default. Without this, the
    // compiled copies in dist/ run a second time, and stale artifacts from
    // code that no longer exists fail to load.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
