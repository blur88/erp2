# ESLint Upgrade to 10.0.2 — Design

**Date**: 2026-03-01

## Context

The frontend already runs ESLint 10.0.2 (exact pin). The backend is on `^9.37.0` (resolved: 9.39.3). This upgrade aligns the backend with the frontend.

## Scope

Backend only (`backend/package.json` and `backend/package-lock.json`).

## Approach

Exact-pin ESLint to `10.0.2` in `backend/package.json` (no caret), matching the frontend pattern. Run `npm install` to update the lockfile.

## Compatibility

| Package | Declared range | ESLint 10 compatible? |
|---|---|---|
| `@typescript-eslint/eslint-plugin ^8.46.0` | `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` | Yes |
| `@typescript-eslint/parser ^8.46.0` | same | Yes |
| `eslint-plugin-prettier ^5.0.0` | `>=8.0.0` | Yes |
| `eslint-config-prettier ^10.1.8` | `>=7.0.0` | Yes |

ESLint 10 requires Node.js >=18.18. Project runs Node 24 — no issue.

ESLint 10 requires flat config format. `backend/eslint.config.mjs` already uses flat config — no config changes needed.

## Verification

`npm run lint` in backend must exit 0 with no warnings.

## Files Changed

- `backend/package.json` — version string only
- `backend/package-lock.json` — lockfile update
