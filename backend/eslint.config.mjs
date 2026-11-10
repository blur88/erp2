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
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'bullmq',
              message: 'Use the shared Nest BullMQ wiring; import BullMQ types with `import type`.',
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ['bullmq/*'],
              message: 'Use the shared Nest BullMQ wiring; do not import BullMQ implementation paths.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value=/^bullmq(\\/|$)/]",
          message: 'Use the shared Nest BullMQ wiring; do not load BullMQ at runtime.',
        },
        {
          selector: "CallExpression[callee.object.name='module'][callee.property.name='require'][arguments.0.value=/^bullmq(\\/|$)/]",
          message: 'Use the shared Nest BullMQ wiring; do not load BullMQ at runtime.',
        },
        {
          selector: "VariableDeclarator[init.name='require']",
          message: 'Avoid aliasing require; prefer explicit module imports.',
        },
        {
          selector: "VariableDeclarator[init.callee.object.name='require'][init.callee.property.name='bind']",
          message: 'Avoid binding require; prefer explicit module imports.',
        },
        {
          selector: "VariableDeclarator[init.object.name='module'][init.property.name='require']",
          message: 'Avoid aliasing module.require; prefer explicit module imports.',
        },
        {
          selector: "VariableDeclarator[init.callee.object.object.name='module'][init.callee.object.property.name='require'][init.callee.property.name='bind']",
          message: 'Avoid binding module.require; prefer explicit module imports.',
        },
        {
          selector: "ImportExpression[source.value=/^bullmq(\\/|$)/]",
          message: 'Use the shared Nest BullMQ wiring; do not load BullMQ at runtime.',
        },
        {
          selector: "ImportSpecifier[imported.name='createRequire']",
          message: 'Avoid custom Node module loaders; prefer explicit module imports.',
        },
      ],
    },
  },
];
