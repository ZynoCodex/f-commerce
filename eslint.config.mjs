import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['backend/**/*.ts', 'packages/contracts/**/*.ts'],
    // Standalone tool configs are outside their workspace tsconfig program.
    ignores: ['backend/*.config.ts', 'packages/contracts/*.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
