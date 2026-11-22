import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['{src,apps,libs,test}/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      // Keep lint executable in this legacy codebase without forcing bulk refactors.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-unused-vars': 'off',
      'prettier/prettier': 'off',
    },
  },
  {
    // ESM Jest injects describe, it and expect but not jest. @types/jest still
    // declares the global, so a bare jest.fn() type-checks and then throws
    // "ReferenceError: jest is not defined" at runtime (#2025).
    files: ['{src,test}/**/*.{spec,e2e-spec,redis-spec}.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'jest',
          message: 'Import { jest } from "@jest/globals" (ESM Jest).',
        },
      ],
    },
  },
];
