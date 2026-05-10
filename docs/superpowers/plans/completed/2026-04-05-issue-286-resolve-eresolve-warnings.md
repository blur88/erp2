# Issue #286: Resolve npm ERESOLVE Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all `npm warn ERESOLVE overriding peer dependency` warnings and the `class-validator` peer dep violation in the backend by making four targeted changes to the `overrides` section of `backend/package.json`.

**Architecture:** Three redundant/stale overrides are removed or corrected, and one new override is added to resolve a `@nestjs/mapped-types` / `class-validator` peer dep mismatch. No packages are upgraded or added — only `package.json` overrides and the regenerated `package-lock.json` change.

**Tech Stack:** Node.js / npm overrides, NestJS 11

---

### Task 1: Update `backend/package.json` overrides

**Files:**
- Modify: `backend/package.json` (lines 94–104, the `overrides` block)

- [ ] **Step 1: Make the four override changes**

Open `backend/package.json`. Find the `"overrides"` section (currently around line 91). Apply these four changes:

1. **Remove** the `"glob"` key entirely
2. **Bump** `"path-to-regexp"` from `"8.4.0"` to `"8.4.2"`
3. **Remove** the `"multer"` key entirely
4. **Add** `"@nestjs/mapped-types": "2.1.1"`

The overrides section should look exactly like this after the edit:

```json
  "overrides": {
    "body-parser": "2.2.1",
    "tar": "7.5.4",
    "js-yaml": "4.1.1",
    "qs": "6.14.2",
    "file-type": "21.3.2",
    "path-to-regexp": "8.4.2",
    "lodash": "^4.18.1",
    "@angular-devkit/core": {
      "ajv": "8.18.0"
    },
    "picomatch": ">=4.0.4",
    "@nestjs/mapped-types": "2.1.1"
  },
```

- [ ] **Step 2: Regenerate the lock file**

```bash
cd backend && npm install
```

Expected: completes with no `ERESOLVE` warnings. The `package-lock.json` will be updated.

- [ ] **Step 3: Verify no ERESOLVE warnings**

```bash
cd backend && npm update --dry-run 2>&1
```

Expected output contains **no** `npm warn ERESOLVE` lines. It should end with something like:

```
up to date in Xs
152 packages are looking for funding
```

- [ ] **Step 4: Verify no class-validator peer dep violation**

```bash
cd backend && npm ls 2>&1 | grep -i "class-validator"
```

Expected: no output (no violation). If you see `invalid:` in the output, the `@nestjs/mapped-types` override did not apply correctly — double-check the spelling in `package.json`.

- [ ] **Step 5: Verify audit is unchanged**

```bash
cd backend && npm audit 2>&1 | tail -5
```

Expected: still exactly `2 vulnerabilities (1 moderate, 1 high)` — both inside `node_modules/npm` itself (npm's own bundled deps, unfixable at project level). If the count has gone up, something went wrong.

- [ ] **Step 6: Run the backend test suite**

```bash
cd backend && npm run test -- --no-coverage 2>&1 | tail -10
```

Expected: all tests pass. Any failures here are pre-existing and unrelated to this change — confirm by checking `git stash && npm run test` if unsure, then `git stash pop`.

- [ ] **Step 7: Commit**

```bash
cd backend && git add package.json package-lock.json
git commit -m "fix(deps): resolve ERESOLVE peer dep warnings (closes #286)

- Remove glob override (no CVE, was deduplication artifact)
- Bump path-to-regexp 8.4.0 → 8.4.2 (satisfies @nestjs/core + keeps ReDoS fix)
- Remove multer override (redundant with direct dep)
- Add @nestjs/mapped-types 2.1.1 override (fixes class-validator 0.15.1 peer dep mismatch)"
```
