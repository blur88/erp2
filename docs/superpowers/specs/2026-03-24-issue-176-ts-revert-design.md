# Design: Issue #176 — Revert TypeScript to 5.9.3, Unblock PR #175

**Date:** 2026-03-24
**Issue:** [#176](https://github.com/blur88/erp2/issues/176)
**PR:** [#175](https://github.com/blur88/erp2/pull/175)
**Branch:** `deps/issue-174-ts6-router-upgrade`
**Scope:** Revert TypeScript 6.0.2 → 5.9.3 in frontend and backend; keep react-router-dom patch bump; defer TS 6 upgrade

---

## Problem

`npm ci` fails on both backend and frontend in CI with a hard ERESOLVE — not a warning:

```
npm error peer typescript@">=4.8.4 <6.0.0" from @typescript-eslint/eslint-plugin@8.57.2
npm error peer typescript@">=4.8.4 <6.0.0" from typescript-eslint@8.57.2
```

`typescript-eslint@8.57.2` (the latest stable release as of 2026-03-24, including all alpha/canary versions) has a hard peer dependency constraint of `typescript <6.0.0`. No published version of typescript-eslint lifts this constraint. The constraint is not a cosmetic warning — it prevents installation entirely, making PR #175 unmergeable in any standards-compliant CI pipeline.

---

## Option Analysis

| | Option 1: Revert TS → 5.9.3 | Option 2: Workaround (`--legacy-peer-deps`) | Option 3: Hold branch open |
|---|---|---|---|
| **CI status** | Green, clean | Green by override | Red until ecosystem ships |
| **Correctness** | Declared peer deps satisfied | Peer contract violated | N/A |
| **Risk** | Minimal — 5.9.3 is stable | Lint/type inconsistencies possible | Blocked on external timeline |
| **Reversibility** | Easy — re-upgrade when ready | Harder to undo if issues emerge | N/A |
| **Closes #174?** | Partially (router bump merged) | Fully, with caveats | No |

### Why not Option 2

Forcing past a peer dep constraint means CI turns green only because the check was bypassed, not because the check passed. If typescript-eslint's internals assume TS <6 behavior, lint could silently produce wrong results or miss errors. `--legacy-peer-deps` permanently weakens the signal quality of CI and creates a branch that is "green by override," not "green by support." This degrades CI integrity for all future changes.

### Why not Option 3

No public typescript-eslint release (stable, RC, alpha, or canary as of 2026-03-24) supports TS 6. The branch stays broken for an unknown duration on an external team's schedule. Issue #174 and PR #175 remain in limbo indefinitely.

---

## Recommendation: Option 1 — Revert TypeScript to 5.9.3

### What changes

| File | Change |
|---|---|
| `backend/package.json` | `"typescript": "6.0.2"` → `"typescript": "5.9.3"` |
| `frontend/package.json` | `"typescript": "6.0.2"` → `"typescript": "5.9.3"` (exact pin) |
| `backend/package-lock.json` | Regenerated via `npm install` |
| `frontend/package-lock.json` | Regenerated via `npm install` |

The `react-router-dom` `7.13.1` → `7.13.2` bump stays untouched.

### TS 6 compatibility fixes — revert policy

Any changes introduced solely to satisfy TS 6 behavior must be reverted **unless** they are backward-compatible with TS 5.9.3 **and** do not alter runtime behavior. Backward-compatible fixes (e.g., tsconfig option changes that are valid under both versions, test pattern improvements) may be retained. Changes that existed only because TS 6 required them must be removed.

### Verification (in order)

1. `cd backend && npm install`
2. `cd frontend && npm install`
3. `cd frontend && npm run type-check`
4. `cd backend && npm run build`
5. `cd frontend && npm run build`
6. `cd frontend && npm run test`
7. `cd backend && npm run test`
8. `npm ci` succeeds in both `backend/` and `frontend/` (CI parity check — this is what originally broke)

### Acceptance Criteria

1. `npm ci` succeeds in both frontend and backend (no ERESOLVE)
2. `npm run type-check` passes in frontend
3. `npm run build` passes in frontend and backend
4. Frontend and backend test suites pass with no new failures
5. No TS 6–only changes remain unless confirmed backward-compatible with TS 5.9.3
6. `react-router-dom` remains at `7.13.2`

---

## Commit Structure

- **Single commit** on the existing branch: `chore(deps): revert TypeScript to 5.9.3, unblock CI (issue #176)`
- **PR #175** now represents only the react-router-dom patch bump; the TypeScript 6 upgrade is deferred. Update title and description to reflect this.
- Supersedes the TS 6 portion of Issue #174; tracked separately for future reattempt.

---

## Issue Housekeeping

- Close Issue #174's TS 6 portion as **deferred — blocked by ecosystem support** with a comment explaining the constraint.
- Issue #176 is resolved by this PR.
- **Revisit trigger:** When typescript-eslint publishes a stable release with a peer dependency range that includes TypeScript 6.x, open a new issue to reattempt the TS 6 upgrade.

---

## Out of Scope

- Any tsconfig modernization
- Any strictness changes
- Any refactoring
- Investigating whether typescript-eslint can be upgraded to a version that already supports TS 6 (none exists as of this date)
