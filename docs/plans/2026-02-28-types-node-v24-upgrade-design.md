# Design: Update @types/node to 24.11.0

**Date**: 2026-02-28
**Status**: Approved

## Summary

Update `@types/node` to `^24.11.0` in both the frontend and backend packages to align TypeScript type definitions with the Node.js 24 LTS runtime (currently running v24.13.1).

## Scope

| Package | Current specifier | Installed | Target |
|---------|------------------|-----------|--------|
| `frontend/package.json` | `^20.10.4` | `20.19.35` | `^24.11.0` |
| `backend/package.json` | `^24.7.0` | `24.10.14` | `^24.11.0` |

## Breaking Changes

### Frontend (v20 → v24) — 2 files require fixes

**Issue**: `NodeJS.Timeout` is a Node.js server-side type. Using it in browser/React code is incorrect but previously worked due to loose type resolution. In v24, this remains technically valid but the correct pattern — already used in `NotificationPanel.tsx` — is `ReturnType<typeof setTimeout>`.

| File | Line(s) | Current | Fix |
|------|---------|---------|-----|
| `src/hooks/useIdleTimer.ts` | 88–90 | `NodeJS.Timeout` | `ReturnType<typeof setTimeout>` |
| `src/pages/sales/CustomersPage.tsx` | 216 | `NodeJS.Timeout` | `ReturnType<typeof setTimeout>` |

**Safe usages** (no changes needed):
- `process.env` — read-only checks, no type breakage
- No direct Node.js module imports in frontend source

### Backend (v24.7 → v24.11) — no breaking changes

- `crypto`: uses modern `createHash`, `randomUUID` — safe
- `Buffer`: uses `Buffer.from()` only — safe
- `EventEmitter`: no custom subclasses — safe
- `process.env`: standard read access — safe
- `util.promisify`: modern pattern — safe

## Verification

After implementation, the following must pass:

1. `cd frontend && npm install && npm run type-check`
2. `cd frontend && npm run test`
3. `cd backend && npm install`
4. `cd backend && npm run test`
