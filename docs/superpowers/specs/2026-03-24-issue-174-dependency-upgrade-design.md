# Design: Issue #174 — Dependency Upgrade

**Date:** 2026-03-24
**Issue:** [#174](https://github.com/blur88/erp2/issues/174)
**Scope:** Minimal compatibility upgrade — no tsconfig modernization, no strictness changes, no refactors

---

## Summary

Upgrade two dependencies in one PR with two isolated commits:

1. `react-router-dom` `7.13.1` → `7.13.2` (frontend patch bump)
2. `typescript` `5.x` → `6.0.2` (frontend + backend major-version upgrade)

---

## Commit 1: react-router-dom patch bump

### Changes
- `frontend/package.json`: `"react-router-dom": "7.13.1"` → `"react-router-dom": "7.13.2"`
- `frontend/package-lock.json`: updated via `npm install`

### Verification (in order)
1. `cd frontend && npm install`
2. `cd frontend && npm run type-check`
3. `cd frontend && npm run build`
4. `cd frontend && npm run test`

### Expected outcome
No code changes required. Patch release — stability and dependency alignment only.

---

## Commit 2: TypeScript 6.0.2 upgrade

### Changes
- `frontend/package.json`: `"typescript": "^5.2.2"` → `"typescript": "6.0.2"` (exact pin)
- `backend/package.json`: `"typescript": "5.9.3"` → `"typescript": "6.0.2"` (exact pin)
- `frontend/package-lock.json`: updated via `npm install`
- `backend/package-lock.json`: updated via `npm install`

### Verification (in order)
1. `cd frontend && npm install`
2. `cd backend && npm install`
3. `cd frontend && npm run type-check`
4. `cd backend && npm run build`
5. `cd frontend && npm run build`
6. `cd frontend && npm run test`
7. `cd backend && npm run test`

### Fix policy
- Fix only errors that block compilation or test pass
- No warnings-only fixes
- No tsconfig option changes unless the compiler hard-fails on a current option
- No code style or refactor changes

### Known TS 6.0 compatibility considerations
| Option | Status | Action |
|---|---|---|
| `baseUrl` without `rootDir` | Deprecated but still supported | No change |
| `emitDecoratorMetadata` | Still supported (NestJS requires it) | No change |
| `target: ES2018` / `ES2020` | Both valid in TS 6.0 | No change |
| `strict: false` | Explicit — new defaults do not apply | No change |

---

## Acceptance Criteria

1. `npm run type-check` passes in frontend
2. `npm run build` passes in frontend
3. `npm run build` passes in backend
4. All frontend tests pass (`npm run test`)
5. All backend tests pass (`npm run test`)
6. No tsconfig options changed (unless compiler hard-fails on a current option)
7. No intentional code changes beyond minimal compatibility fixes required for TypeScript 6.0 compilation or test pass
8. Lockfiles generated with project's normal package manager only — no unrelated dependency updates

---

## Out of Scope

- tsconfig modernization (deprecation cleanup, `baseUrl` removal, target changes)
- Enabling stricter TypeScript flags
- Any refactoring
- Follow-up tsconfig hygiene → track in a separate issue

---

## PR Structure

- **Branch:** `deps/issue-174-ts6-router-upgrade` (or similar)
- **PR title:** `chore(deps): upgrade react-router-dom to 7.13.2 and TypeScript to 6.0.2`
- **Two commits**, each independently bisectable
- **Rollback:** revert commit 2 if TS 6.0 causes unfixable issues; commit 1 is independent and stays
