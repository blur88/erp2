# ESLint 10.1.0 Update

**Date:** 2026-03-22
**Issue:** #151

## Summary

Bump ESLint from `10.0.3` to `10.1.0` in both backend and frontend. Also align `@eslint/js` (frontend-only) from `10.0.1` to `10.1.0` to match the ESLint lockstep versioning convention.

## Changes

| File | Package | From | To |
|------|---------|------|----|
| `backend/package.json` | `eslint` | `10.0.3` | `10.1.0` |
| `frontend/package.json` | `eslint` | `10.0.3` | `10.1.0` |
| `frontend/package.json` | `@eslint/js` | `10.0.1` | `10.1.0` |

## Approach

Manual edit of `package.json` files, followed by `npm install` in each directory to regenerate lock files.

## Acceptance Criteria

- `npm run lint` passes in `backend/`
- `npm run lint` passes in `frontend/`
- No new lint regressions introduced
