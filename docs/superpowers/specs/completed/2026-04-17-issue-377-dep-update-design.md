# Design: Dependency Update — Issue #377

## Summary

Bump three stale dependencies to their latest stable versions. No API changes, no new features, no migrations required.

## Changes

| Package | From | To | Location |
|---|---|---|---|
| `typescript` | 6.0.2 | 6.0.3 | backend + frontend |
| `@mui/x-date-pickers` | 9.0.0 | 9.0.2 | frontend |
| `eslint-plugin-react-hooks` | 7.1.0-canary-98ce535f-20260226 | 7.1.0 | frontend |

## Release Notes Highlights

- **TypeScript 6.0.3**: Maintenance patch — refined type-checking for function expressions in generic calls, updated DOM types.
- **@mui/x-date-pickers 9.0.2**: Patch — bug fixes for focus management and AM/PM handling.
- **eslint-plugin-react-hooks 7.1.0**: Stable release of the canary — stabilizes ESM support, tightens flat config types.

## Verification

Full frontend test suite is skipped (these are patch/minor bumps with no breaking changes). Verification steps:

**Backend:**
1. `npm install`
2. `npm run build`
3. `npm run lint`
4. `npm run test`

**Frontend:**
1. `npm install`
2. `npm run type-check`
3. `npm run lint`

**Manual spot-check:**
- Open any date picker in the UI (e.g., in Sales or Purchasing)
- Verify focus/blur transitions are smooth and AM/PM toggling works correctly

## Delivery

Single PR on a feature branch, `Closes #377`.
