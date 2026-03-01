# Design: Upgrade class-validator to ^0.15.1

**Date**: 2026-03-01
**Motivation**: Housekeeping — stay current with latest stable release
**Risk**: Very low

## Summary

Bump `class-validator` in `backend/package.json` from `^0.14.0` to `^0.15.1`.
No application code changes are needed.

## Context

- Current installed: `0.14.4`
- Target: `0.15.1` (released 2026-02-26)
- Scope: backend only (class-validator is not a frontend dependency)

## Breaking Changes in 0.15.0

One breaking change: `IsIBAN` now requires `IsIBANOptions` as an argument.
**This codebase does not use `IsIBAN`** — no code changes required.

## New Features (additive, no action needed)

- `IsISO31661Numeric` decorator
- `isISO6391` decorator
- Extended `IsUUID` to support versions 1–8, nil, max — existing `@IsUUID()` and `@IsUUID(4)` usages remain valid
- `validateIf` option in validation options
- Dependency security bumps

## Files Changed

| File | Change |
|---|---|
| `backend/package.json` | `"class-validator": "^0.14.0"` → `"class-validator": "^0.15.1"` |
| `backend/package-lock.json` | Updated by `npm install` |

## Verification Steps

1. `npm install` — resolves and installs 0.15.1
2. `npm run test` — full jest test suite, no new failures expected
3. `npm run build` — TypeScript compilation check
