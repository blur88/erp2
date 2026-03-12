# Design: CLAUDE.md Update (Issue #69)

**Date:** 2026-03-11
**Issue:** [#69](https://github.com/blur88/erp2/issues/69) — docs: update CLAUDE.md with current project state

## Summary

Update CLAUDE.md to reflect the actual current state of the project, and fix a companion bug in `backend/tsconfig.json` where `PurchasingModule` is incorrectly excluded from TypeScript compilation.

## Changes

### 1. Project Overview — version bumps

- React 18 → **React 19** (actual: 19.2.4)
- PostgreSQL → **PostgreSQL 18.3**
- Redis 8 → **Redis 8.6**
- MUI v7 major version stays (already correct)

### 2. Architecture — add RTK Query mention

Add bullet to Non-obvious decisions:

> Frontend API calls use RTK Query (`frontend/src/store/api/`); `ApiService` (Axios) is the underlying transport layer.

### 3. Gotchas — remove stale account_mappings entry

Remove the "Accounting schema" gotcha about the manual `ALTER TABLE` fix. Migration `1770200000000-FixAccountMappingDescriptionNullable.ts` handles this automatically for all new installs.

### 4. tsconfig.json — remove purchasing exclusion (bug fix)

`backend/tsconfig.json` incorrectly excludes `src/modules/purchasing/**/*`. PurchasingModule is fully active (imported in `app.module.ts`, has controllers/services/dto). Remove the exclusion so IDE type-checking works correctly for this module.

The `src/modules/reports/**/*` exclusion stays — there is no active reports module.

## Delivery

Two commits, one PR:
1. `fix(backend): remove purchasing module from tsconfig exclude`
2. `docs: update CLAUDE.md with current project state (closes #69)`
