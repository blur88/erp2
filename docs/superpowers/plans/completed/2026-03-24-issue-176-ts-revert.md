# Issue #176: Revert TypeScript to 5.9.3, Unblock PR #175 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert TypeScript from 6.0.2 back to 5.9.3 in both backend and frontend, undoing all TS 6-specific infrastructure changes, so that `npm ci` passes cleanly in CI without violating the `typescript-eslint` peer dependency constraint.

**Architecture:** All changes are reversals of commit `355d44823`. There are no new features or tests. The bcrypt mock refactor in `auth.service.spec.ts` is the only change from that commit that is intentionally retained (it is backward-compatible with TS 5.9.3 and improves test isolation). All other changes from that commit are reverted exactly.

**Tech Stack:** TypeScript 5.9.3, NestJS 11 (backend), React 19 + Vite (frontend), Jest (backend tests), Vitest (frontend tests), typescript-eslint 8.57.x

---

## File Map

| File | Action | Reason |
|---|---|---|
| `backend/package.json` | Modify | Downgrade `typescript`, revert `build` script |
| `frontend/package.json` | Modify | Downgrade `typescript` |
| `backend/package-lock.json` | Regenerate | Reflects TS 5.9.3 resolution |
| `frontend/package-lock.json` | Regenerate | Reflects TS 5.9.3 resolution |
| `backend/nest-cli.json` | Modify | Revert `webpack: false` → `true`, revert `tsConfigPath` |
| `backend/tsconfig.build.json` | Delete | TS 6-only file, referenced by nothing after `nest-cli.json` is reverted |
| `backend/tsconfig.json` | Modify | Remove `ignoreDeprecations` and `types` added for TS 6 |
| `frontend/tsconfig.json` | Modify | Remove `ignoreDeprecations` added for TS 6 |
| `backend/src/common/security/middleware/security-application.service.ts` | Modify | Revert default import back to namespace import |
| `backend/test/unit/auth.service.spec.ts` | **No change** | Bcrypt mock refactor is retained intentionally |

---

## Task 1: Revert source files

Revert every non-package, non-lockfile file changed in commit `355d44823`, except `auth.service.spec.ts` which is intentionally retained.

**Files:**
- Modify: `backend/nest-cli.json`
- Delete: `backend/tsconfig.build.json`
- Modify: `backend/tsconfig.json`
- Modify: `frontend/tsconfig.json`
- Modify: `backend/src/common/security/middleware/security-application.service.ts`

- [ ] **Step 1: Verify no other file references `tsconfig.build.json`**

Run:
```bash
grep -r "tsconfig.build.json" . --include="*.json" --include="*.yml" --include="*.yaml" --exclude-dir=node_modules --exclude-dir=.git
```

Expected output: only `backend/nest-cli.json` and `backend/package.json` (both being reverted in this task). If any other file shows up, investigate before proceeding.

- [ ] **Step 2: Revert `backend/nest-cli.json`**

Replace the entire file content with:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true,
    "tsConfigPath": "tsconfig.json",
    "typeCheck": false
  }
}
```

> **Why `webpack: true`:** `nest build` uses webpack internally when `"webpack": true` is set. This is required because `ts-loader` is an implicit dependency of `@nestjs/cli` — knip reports it as unused (false positive) but it is needed for the build to work. The TS 6 commit switched to `webpack: false` + an explicit `--builder tsc` flag as a workaround; we revert both here.

- [ ] **Step 3: Delete `backend/tsconfig.build.json`**

```bash
rm backend/tsconfig.build.json
```

This file was created solely for the TS 6 build/test split and has no purpose under TS 5.x.

- [ ] **Step 4: Revert `backend/tsconfig.json`**

Remove `"ignoreDeprecations": "6.0"` (line 12) and `"types": ["node", "jest"]` (line 16).

The file should look like this after the edit:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2018",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false,
    "strict": false,
    "strictPropertyInitialization": false,
    "paths": {
      "@/*": ["src/*"],
      "@modules/*": ["src/modules/*"],
      "@common/*": ["src/common/*"],
      "@config/*": ["src/config/*"],
      "@database/*": ["src/database/*"]
    }
  },
  "exclude": [
    "src/modules/reports/**/*"
  ]
}
```

> **Why remove `types`:** It was added as part of the TS 6 tsconfig split strategy. It was not present prior to the TS 6 changes and is not required for correct type resolution under TS 5.9.3 with a single `tsconfig.json` covering all files.

- [ ] **Step 5: Revert `frontend/tsconfig.json`**

Remove `"ignoreDeprecations": "6.0"` (currently line 24, in the `/* Path mapping */` section).

Before:
```json
    /* Path mapping */
    "ignoreDeprecations": "6.0",
    "baseUrl": ".",
```

After:
```json
    /* Path mapping */
    "baseUrl": ".",
```

- [ ] **Step 6: Revert `security-application.service.ts` compression import**

Change line 4:
```ts
import compression from 'compression';
```
back to:
```ts
import * as compression from 'compression';
```

> **Why:** The TS 6 commit switched to a default import to resolve a TS 6 module resolution issue. Under TS 5.9.3 without `esModuleInterop` configured for this module, the namespace import form (`* as`) is correct.

- [ ] **Step 7: Verify `auth.service.spec.ts` is unchanged**

Run:
```bash
git diff HEAD -- backend/test/unit/auth.service.spec.ts
```

Expected: no output (no changes). The bcrypt mock refactor from commit `355d44823` is intentionally retained.

---

## Task 2: Downgrade TypeScript in package.json files

**Files:**
- Modify: `backend/package.json` (typescript version + build script)
- Modify: `frontend/package.json` (typescript version)

- [ ] **Step 1: Revert `backend/package.json` typescript version**

Change:
```json
"typescript": "6.0.2"
```
to:
```json
"typescript": "5.9.3"
```

- [ ] **Step 2: Revert `backend/package.json` build script**

Change line 9:
```json
"build": "nest build --builder tsc --path tsconfig.build.json",
```
to:
```json
"build": "nest build",
```

> **Why:** The `--builder tsc --path tsconfig.build.json` flags were introduced alongside `tsconfig.build.json` to use tsc directly instead of webpack. With `webpack: true` restored in `nest-cli.json`, `nest build` uses webpack again and the explicit flags are not needed.

- [ ] **Step 3: Revert `frontend/package.json` typescript version**

Change:
```json
"typescript": "6.0.2",
```
to:
```json
"typescript": "5.9.3",
```

---

## Task 3: Regenerate lockfiles and verify clean install

**Files:**
- Regenerate: `backend/package-lock.json`
- Regenerate: `frontend/package-lock.json`

- [ ] **Step 1: Regenerate backend lockfile**

```bash
cd backend && npm install
```

This resolves TypeScript to 5.9.3 and updates the lockfile.

- [ ] **Step 2: Regenerate frontend lockfile**

```bash
cd frontend && npm install
```

- [ ] **Step 3: Verify `npm ci` passes (CI parity check) — backend**

Delete `node_modules` first to simulate a clean CI environment:
```bash
cd backend && rm -rf node_modules && npm ci
```

Expected: clean install with no ERESOLVE or peer dependency errors. This is the original failure mode — it must pass.

- [ ] **Step 4: Verify `npm ci` passes — frontend**

```bash
cd frontend && rm -rf node_modules && npm ci
```

Expected: clean install with no ERESOLVE or peer dependency errors.

- [ ] **Step 5: Verify TypeScript version in the dependency tree**

```bash
cd backend && npm ls typescript
cd frontend && npm ls typescript
```

Expected: only `typescript@5.9.3` listed. No `6.x` entries anywhere in the tree.

---

## Task 4: Run full verification suite

All commands run from the repo root unless noted.

- [ ] **Step 1: Frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0 with no errors.

- [ ] **Step 2: Backend build**

```bash
cd backend && npm run build
```

Expected: exits 0. Produces `backend/dist/`.

- [ ] **Step 3: Frontend build**

```bash
cd frontend && npm run build
```

Expected: exits 0. Produces `frontend/dist/`.

- [ ] **Step 4: Backend lint**

```bash
cd backend && npm run lint
```

Expected: exits 0. This directly proves typescript-eslint works cleanly at TS 5.9.3 — it was the root cause of the CI failure.

- [ ] **Step 5: Frontend lint**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 6: Frontend tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass. No new failures vs. pre-TS6 baseline.

- [ ] **Step 7: Backend tests**

```bash
cd backend && npm run test
```

Expected: all tests pass. Note: Jest output will include expected error-path log lines from passing tests — this is normal.

- [ ] **Step 8: Confirm no unintended TS 6 residue**

```bash
git diff 355d44823^ HEAD -- $(git show --format="" --name-only 355d44823 | grep -v package-lock)
```

Expected output: only the `auth.service.spec.ts` diff should appear (the retained bcrypt mock refactor). Every other file touched by commit `355d44823` should now match the state before that commit. If any other diffs appear, investigate and revert.

---

## Task 5: Commit and update PR/issues

- [ ] **Step 1: Stage all changes**

```bash
git add backend/package.json frontend/package.json \
  backend/package-lock.json frontend/package-lock.json \
  backend/nest-cli.json backend/tsconfig.json frontend/tsconfig.json \
  backend/src/common/security/middleware/security-application.service.ts
git rm backend/tsconfig.build.json
```

- [ ] **Step 2: Verify staged diff**

```bash
git diff --staged --stat
```

Expected: the 9 modified/deleted files listed above. `backend/test/unit/auth.service.spec.ts` must NOT appear in the staged diff.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(deps): revert TypeScript 6.0.2 → 5.9.3 to satisfy typescript-eslint peer deps (unblock CI, issue #176)"
```

- [ ] **Step 4: Update PR #175 title**

```bash
gh pr edit 175 --title "chore(deps): bump react-router-dom from 7.13.1 to 7.13.2"
```

- [ ] **Step 5: Update PR #175 body**

```bash
gh pr edit 175 --body "$(cat <<'EOF'
## Summary

Bump \`react-router-dom\` \`7.13.1\` → \`7.13.2\` (frontend patch bump).

The TypeScript 6.0.2 upgrade originally included in this PR has been reverted and deferred. \`typescript-eslint@8.57.x\` declares a hard peer dependency of \`typescript <6.0.0\`, which causes \`npm ci\` to ERESOLVE-fail in CI. No published version of typescript-eslint (stable, RC, alpha, or canary as of 2026-03-24) supports TS 6. The TS 6 upgrade is tracked separately for reattempt once ecosystem support lands.

Resolves #176.
The TS 6 portion of #174 is deferred — see issue comment.
EOF
)"
```

- [ ] **Step 6: Comment on Issue #174 to defer the TS 6 portion**

```bash
gh issue comment 174 --body "$(cat <<'EOF'
**TS 6 upgrade deferred — blocked by ecosystem support.**

\`typescript-eslint@8.57.x\` (the version resolved from the declared \`^8.56.1\` / \`^8.46.0\` ranges) has a hard peer dependency of \`typescript >=4.8.4 <6.0.0\`. This causes \`npm ci\` to ERESOLVE-fail — not a warning, a complete install failure. No published version of typescript-eslint (stable, RC, alpha, or canary as of 2026-03-24) lifts this constraint.

The TypeScript version has been reverted to 5.9.3 in PR #175 to unblock CI (issue #176).

**Revisit trigger:** When typescript-eslint publishes a stable release with a peer dependency range that includes TypeScript 6.x, open a new issue to reattempt the upgrade.
EOF
)"
```

---

## Acceptance Checklist

Before considering this complete, confirm all of the following:

- [ ] `npm ci` passes in `backend/` (no ERESOLVE)
- [ ] `npm ci` passes in `frontend/` (no ERESOLVE)
- [ ] `npm run type-check` passes in frontend
- [ ] `npm run build` passes in backend
- [ ] `npm run build` passes in frontend
- [ ] `npm run lint` passes in backend
- [ ] `npm run lint` passes in frontend
- [ ] `npm run test` passes in frontend (no new failures)
- [ ] `npm run test` passes in backend (no new failures)
- [ ] `npm ls typescript` shows only `5.9.3` in both backend and frontend trees
- [ ] `git diff 355d44823^` confirms no unintended TS 6 residue (only `auth.service.spec.ts` bcrypt change retained)
- [ ] `react-router-dom` is `7.13.2` in `frontend/package.json`
- [ ] PR #175 title and body updated to reflect router-only scope
- [ ] Issue #174 has a comment explaining TS 6 deferral with revisit trigger
