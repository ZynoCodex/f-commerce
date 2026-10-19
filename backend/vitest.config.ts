import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database integration tests share one PostgreSQL test database, so test
    // files must not run concurrently.
    fileParallelism: false,
    // Build output is never test input, and Vitest no longer ignores dist/ by
    // default. Keeping it excluded also stops stale artifacts from an older
    // build from breaking the run.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
