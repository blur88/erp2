import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
    },
    rules: {
      // react-hooks
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',

      // react-refresh
      'react-refresh/only-export-components': 'off',

      // typescript-eslint — keep current permissive settings
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-types': 'off',

      // base ESLint
      'no-unused-vars': 'off',
      'no-extra-semi': 'off',
      'no-extra-boolean-cast': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'deprecation/deprecation': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
  },
);
