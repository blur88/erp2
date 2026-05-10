# Dependency Upgrades — TS 5.9.3 Baseline

**Issue:** #177
**Date:** 2026-03-31
**Status:** Approved

## Context

Issue #177 originally tracked a full TypeScript 6.0.2 upgrade. A previous attempt (PR #175) was reverted due to `typescript-eslint` v8 blocking TS 6.x (`<6.0.0`). Since then, `typescript-eslint` has relaxed its upper bound to `<6.1.0`, making TS 6.0.2 technically compatible — but `ts-jest@29.x` (the backend test runner) still has `typescript: >=4.3 <6` as a peer dependency, and no v30 has been released.

**Decision:** Upgrade all packages that can safely move to latest while keeping TypeScript at 5.9.3. Defer the TypeScript upgrade itself until ts-jest v30 ships.

## Packages Not Changing

- `typescript` — stays at `5.9.3` (blocked by ts-jest peer dep `<6`)
- `ts-jest` — already at latest (`29.4.6`)
- `ts-loader` — already at latest (`9.5.4`)
- All `tsconfig.json` files — no changes needed (TS version unchanged)

## Backend (`backend/package.json`)

| Package | From | To | Notes |
|---|---|---|---|
| `@typescript-eslint/eslint-plugin` | `^8.46.0` | `^8.58.0` | peer dep now `<6.1.0`, 5.9.3 ✓ |
| `@typescript-eslint/parser` | `^8.46.0` | `^8.58.0` | same |
| `ts-node` | `^10.9.1` | `^10.9.2` | patch, no TS upper bound |

## Frontend (`frontend/package.json`)

| Package | From | To | Notes |
|---|---|---|---|
| `typescript-eslint` | `^8.56.1` | `^8.58.0` | peer dep `<6.1.0`, 5.9.3 ✓ |
| `vitest` | `^4.0.18` | `^4.1.2` | compatible with vite `^8` |
| `@vitest/coverage-v8` | `^4.0.18` | `^4.1.2` | must match vitest version |
| `@vitest/ui` | `^4.0.18` | `^4.1.2` | must match vitest version |
| `vite` | `^8.0.0` | `^8.0.3` | patch |
| `@vitejs/plugin-react` | `^6.0.0` | `^6.0.1` | patch |
| `@tanstack/react-query` | `^5.8.4` | `^5.96.0` | large jump, peer dep react `^18\|^19` ✓ |
| `@tanstack/react-query-devtools` | `^5.85.5` | `^5.96.0` | must match react-query version |

## Verification Steps

1. `cd backend && npm install`
2. `cd backend && npm run build` — confirm no build errors
3. `cd backend && npm run lint` — confirm no new lint errors
4. `cd backend && npm run test` — confirm all tests pass
5. `cd frontend && npm install`
6. `cd frontend && npm run type-check` — confirm no type errors
7. `cd frontend && npm run lint` — confirm no new lint errors
8. `cd frontend && npx vitest run src/store/api/inventoryApi.test.ts` — spot-check a representative test

## Future Work

Once `ts-jest` v30 is released with TypeScript 6.x support, re-open or create a new issue to complete the full TS 6.0.2 (or later) upgrade, including tsconfig changes documented in issue #177.
