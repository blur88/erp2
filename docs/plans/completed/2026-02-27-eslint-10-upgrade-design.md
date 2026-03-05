# ESLint 10 Upgrade Design

**Date:** 2026-02-27

## Goal

Upgrade `eslint` to 10.0.2, `@eslint/js` to 10.0.1, and `eslint-plugin-react-hooks` to 7.0.1 in the frontend.

## Context

The frontend already uses ESLint 9 flat config (`eslint.config.js`), so the legacy config removal in ESLint 10 is a non-issue. Node.js requirement (^20.19.0) is already met.

## Key Constraint: react-hooks peer dep

`eslint-plugin-react-hooks@7.0.1` does not declare `eslint@^10` in its peer dependencies (fix was merged 2026-02-13 but not yet released as stable). The plugin works at runtime with ESLint 10 — the peer dep declaration is stale metadata only.

`eslint-plugin-react-hooks@5.2.0` (current) uses `context.getSourceCode()` which was **removed** in ESLint 10, causing a hard runtime crash. It cannot stay at 5.x.

**Solution:** Add `eslint-plugin-react-hooks` to the npm `overrides` block in `package.json` to force resolution without `--legacy-peer-deps`.

## Changes

### `frontend/package.json`

- `eslint`: `^9.39.3` → `10.0.2`
- `@eslint/js`: `^9.39.3` → `10.0.1`
- `eslint-plugin-react-hooks`: `^5.2.0` → `7.0.1`
- Add to `overrides`: `"eslint-plugin-react-hooks": "7.0.1"`

### `frontend/eslint.config.js`

1. **Remove the `reactHooks.configs.recommended.rules` spread** — in v7 this now includes React Compiler diagnostic rules. Since all hooks rules are already explicitly `off`, the spread adds no value and risks activating new rules silently.

2. **Disable the three new `js.configs.recommended` rules** added in ESLint 10:
   - `no-unassigned-vars`
   - `no-useless-assignment`
   - `no-empty-pattern` (already disabled via recommended coverage)
   - `no-restricted-syntax` (n/a)

   Specifically add to the rules block: `no-unassigned-vars: off`, `no-useless-assignment: off`.

## Approach Not Taken

- `--legacy-peer-deps`: requires flag on every `npm install`, not baked in
- Canary `7.1.0-canary-...`: pre-release
- Waiting for `7.1.0` stable: blocks upgrade with no known timeline

## Cleanup

Once `eslint-plugin-react-hooks@7.1.0` stable ships, remove the `overrides` entry for it.
