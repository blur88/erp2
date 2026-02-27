# ESLint 10 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade `eslint` to 10.0.2, `@eslint/js` to 10.0.1, and `eslint-plugin-react-hooks` to 7.0.1 in the frontend with zero lint regressions.

**Architecture:** Bump versions in `package.json`, add an npm `overrides` entry to silence the stale peer dep conflict on `eslint-plugin-react-hooks@7.0.1`, then update `eslint.config.js` to remove the `recommended.rules` spread (which now includes React Compiler rules) and disable the two new `js.configs.recommended` rules added in ESLint 10.

**Tech Stack:** npm, ESLint 10 flat config (`eslint.config.js`), `typescript-eslint` v8, `eslint-plugin-react-hooks` v7, `eslint-plugin-react-refresh` v0.5.

---

### Task 1: Update `package.json`

**Files:**
- Modify: `frontend/package.json`

**Step 1: Bump `eslint` version**

In `frontend/package.json`, change:
```json
"eslint": "^9.39.3",
```
to:
```json
"eslint": "10.0.2",
```

**Step 2: Bump `@eslint/js` version**

Change:
```json
"@eslint/js": "^9.39.3",
```
to:
```json
"@eslint/js": "10.0.1",
```

**Step 3: Bump `eslint-plugin-react-hooks` version**

Change:
```json
"eslint-plugin-react-hooks": "^5.2.0",
```
to:
```json
"eslint-plugin-react-hooks": "7.0.1",
```

**Step 4: Add npm override to resolve peer dep conflict**

`eslint-plugin-react-hooks@7.0.1` declares peer dep `eslint: ^3–^9` (ESLint 10 fix is merged but not yet released as stable). The override forces npm to accept it without `--legacy-peer-deps`.

Find the existing `overrides` block:
```json
"overrides": {
  "qs": "6.14.2"
}
```
Change it to:
```json
"overrides": {
  "qs": "6.14.2",
  "eslint-plugin-react-hooks": "7.0.1"
}
```

**Step 5: Install**

```bash
cd frontend && npm install
```

Expected: clean install, no peer dep errors, no `--legacy-peer-deps` needed.

---

### Task 2: Update `eslint.config.js`

**Files:**
- Modify: `frontend/eslint.config.js`

**Background:**
- In `eslint-plugin-react-hooks` v7, `configs.recommended.rules` now includes React Compiler diagnostic rules in addition to the two core hook rules. Since the project turns all hooks rules `off` explicitly, spreading `recommended.rules` only risks silently activating new compiler rules. Remove the spread.
- ESLint 10 adds two new rules to `js.configs.recommended`: `no-unassigned-vars` and `no-useless-assignment`. Add them to the disabled rules block to maintain the permissive policy.

**Step 1: Remove the `recommended.rules` spread**

Find this block in `frontend/eslint.config.js`:
```js
rules: {
  // react-hooks
  ...reactHooks.configs.recommended.rules,
  'react-hooks/exhaustive-deps': 'off',
  'react-hooks/rules-of-hooks': 'off',
```
Change it to:
```js
rules: {
  // react-hooks
  'react-hooks/exhaustive-deps': 'off',
  'react-hooks/rules-of-hooks': 'off',
```

**Step 2: Disable the two new ESLint 10 recommended rules**

Find the `// base ESLint` section:
```js
// base ESLint
'no-unused-vars': 'off',
```
Add the two new rules before `no-unused-vars`:
```js
// base ESLint
'no-unassigned-vars': 'off',
'no-useless-assignment': 'off',
'no-unused-vars': 'off',
```

**Step 3: Verify the full config looks correct**

The file should look like:
```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
    },
    rules: {
      // react-hooks
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
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',

      // base ESLint
      'no-unassigned-vars': 'off',
      'no-useless-assignment': 'off',
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
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
```

---

### Task 3: Verify lint passes

**Step 1: Run the linter**

```bash
cd frontend && npm run lint
```

Expected: exits with code 0, no warnings, no errors.

If new errors appear from the ESLint 10 recommended rules, add them to the `off` block in `eslint.config.js` and re-run.

**Step 2: Commit**

```bash
cd frontend && git add package.json package-lock.json eslint.config.js
git commit -m "chore(frontend): upgrade eslint 9→10, @eslint/js 9→10, react-hooks 5→7"
```

---

## Post-upgrade note

Once `eslint-plugin-react-hooks@7.1.0` stable is released (the version that officially declares ESLint 10 peer dep support), remove the `overrides` entry for `eslint-plugin-react-hooks` from `frontend/package.json` and run `npm install`.
