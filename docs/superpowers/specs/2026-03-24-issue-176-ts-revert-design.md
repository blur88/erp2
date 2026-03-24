# Design: Issue #176 — Revert TypeScript to 5.9.3, Unblock PR #175

**Date:** 2026-03-24
**Issue:** [#176](https://github.com/blur88/erp2/issues/176)
**PR:** [#175](https://github.com/blur88/erp2/pull/175)
**Branch:** `deps/issue-174-ts6-router-upgrade`
**TS 6 upgrade commit:** `355d44823`
**Scope:** Revert TypeScript 6.0.2 → 5.9.3 in frontend and backend; keep react-router-dom patch bump; defer TS 6 upgrade

---

## Problem

`npm ci` fails on both backend and frontend in CI with a hard ERESOLVE — not a warning:

```
npm error peer typescript@">=4.8.4 <6.0.0" from @typescript-eslint/eslint-plugin@8.57.2
npm error peer typescript@">=4.8.4 <6.0.0" from typescript-eslint@8.57.2
```

Both packages declare `"typescript-eslint": "^8.56.1"` (frontend) and `"@typescript-eslint/eslint-plugin": "^8.46.0"` (backend), which resolve to `8.57.2` at lockfile time. That version has a hard peer dependency constraint of `typescript <6.0.0`. The constraint is not a cosmetic warning — it prevents installation entirely, making PR #175 unmergeable in any standards-compliant CI pipeline.

No published version of typescript-eslint (stable, RC, alpha, or canary as of 2026-03-24) lifts this constraint.

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

All changes are relative to commit `355d44823` (the TS 6 upgrade). The react-router-dom bump (commit `717ff718a`) is untouched.

| File | Change |
|---|---|
| `backend/package.json` | `"typescript": "6.0.2"` → `"typescript": "5.9.3"` |
| `frontend/package.json` | `"typescript": "6.0.2"` → `"typescript": "5.9.3"` (exact pin) |
| `backend/package-lock.json` | Regenerated via `npm install` |
| `frontend/package-lock.json` | Regenerated via `npm install` |
| `backend/nest-cli.json` | Revert: `"webpack": false` → `"webpack": true`; `"tsConfigPath": "tsconfig.build.json"` → `"tsConfigPath": "tsconfig.json"` |
| `backend/tsconfig.build.json` | **Delete** — this file was created for TS 6 and has no purpose under TS 5.x. Before deleting, confirm no other config references it: `grep -r "tsconfig.build.json" . --include="*.json" --include="*.yml" --include="*.yaml" --exclude-dir=node_modules` — expected: only `nest-cli.json` (which is being reverted anyway) |
| `backend/tsconfig.json` | Remove `"ignoreDeprecations": "6.0"` (TS 6-specific, invalid under 5.x); remove `"types": ["node", "jest"]` (added as part of the TS 6 split — see note below) |
| `frontend/tsconfig.json` | Remove `"ignoreDeprecations": "6.0"` (TS 6-specific, invalid under 5.x) |
| `backend/src/common/security/middleware/security-application.service.ts` | **Revert** — see note below |
| `backend/test/unit/auth.service.spec.ts` | **Retain** — see note below |

> **`security-application.service.ts` note:** The TS 6 commit changed `import * as compression from 'compression'` → `import compression from 'compression'`. This was introduced to fix a TS 6 module resolution issue. Under TS 5.9.3 the original `* as` import is correct. Revert to `import * as compression from 'compression'`.

> **`auth.service.spec.ts` note:** The bcrypt mock refactor (switching from `jest.spyOn(bcrypt, ...)` to `jest.mock('bcrypt', ...)` + `mockedBcrypt`) is backward-compatible with TS 5.9.3 and improves test isolation (module-level mock vs. per-test spy, with explicit `mockReset()` between tests). **Retain this change** — it is a valid improvement that does not depend on TS 6 behavior.

> **`backend/tsconfig.json` `types` note:** The `"types": ["node", "jest"]` option was added as part of the build/test tsconfig split strategy for TS 6. It was not present prior to the TS 6 changes and is not required for correct type resolution under TS 5.9.3 with a single `tsconfig.json` covering all files. Remove it.

### Verification (in order)

1. `cd backend && npm ci` — confirm no ERESOLVE (this is the original failure; must pass first)
2. `cd frontend && npm ci` — same
3. `cd frontend && npm run type-check`
4. `cd backend && npm run build`
5. `cd frontend && npm run build`
6. `cd backend && npm run lint`
7. `cd frontend && npm run lint`
8. `cd frontend && npm run test`
9. `cd backend && npm run test`

> **Step 1–2 note:** `npm ci` requires a clean environment (no existing `node_modules`) to be a true CI parity check. Run from a directory where `node_modules` either does not exist or has been deleted. After regenerating lockfiles via `npm install`, delete `node_modules` and run `npm ci` to confirm the lockfile installs cleanly from scratch.

> **Lint note (steps 6–7):** Since the root cause was a `typescript-eslint` peer dep conflict, confirming ESLint runs cleanly after the revert provides direct evidence the fix worked at the tool level, not just at the install level.

### Acceptance Criteria

1. `npm ci` succeeds in both `backend/` and `frontend/` with no ERESOLVE or peer dep warnings
2. `npm run type-check` passes in frontend
3. `npm run build` passes in frontend and backend
4. Frontend and backend test suites pass with no new failures
5. No file from commit `355d44823` retains changes unless explicitly listed as "Retain" in the table above — verify with `git diff 355d44823^ HEAD -- $(git show --format="" --name-only 355d44823 | grep -v package-lock)`
6. `react-router-dom` remains at `7.13.2` in `frontend/package.json`
7. `npm ls typescript` shows only `5.9.3` across the entire dependency tree (no transitive TS 6.x copy pulled in by a nested dependency)
8. No runtime behavior changes compared to pre-TS6 state (manually verify key flows such as login, JWT refresh, and a representative API call if CI alone is insufficient confidence)

---

## Commit Structure

- **Single commit** on the existing branch: `chore(deps): revert TypeScript 6.0.2 → 5.9.3 to satisfy typescript-eslint peer deps (unblock CI, issue #176)`
- **PR #175** now represents only the react-router-dom patch bump; the TypeScript 6 upgrade is deferred. Update PR title and description to reflect this.
- Supersedes the TS 6 portion of Issue #174; tracked separately for future reattempt.

---

## Issue Housekeeping

- Close Issue #174's TS 6 portion as **deferred — blocked by ecosystem support** with a comment explaining the typescript-eslint peer dep constraint.
- Issue #176 is resolved by this PR.
- **Revisit trigger:** When typescript-eslint publishes a stable release with a peer dependency range that includes TypeScript 6.x, open a new issue to reattempt the TS 6 upgrade.

---

## Out of Scope

- Any tsconfig modernization
- Any strictness changes
- Any refactoring
- Investigating whether typescript-eslint can be upgraded to a version that already supports TS 6 (none exists as of this date)
