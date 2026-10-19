import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // This workspace compiles into dist/, and Vitest no longer ignores build
    // output by default, so keep the compiled test copies out of the run.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
