import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Database integration tests share one PostgreSQL test database, so test
    // files must not run concurrently.
    fileParallelism: false,
  },
});
