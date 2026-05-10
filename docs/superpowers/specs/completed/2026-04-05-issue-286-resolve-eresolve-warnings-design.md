# Design: Resolve npm ERESOLVE Peer Dependency Warnings (Issue #286)

**Date:** 2026-04-05
**Issue:** #286
**Scope:** `backend/package.json` overrides only — no package upgrades, no new deps

---

## Problem

Running `npm update` in `backend/` produces `npm warn ERESOLVE overriding peer dependency`. Additionally, `npm ls` reports a peer dep violation:

```
class-validator@0.15.1 invalid: "^0.13.0 || ^0.14.0" from @nestjs/mapped-types@2.1.0
```

---

## Root Causes

Three overrides are causing the ERESOLVE noise; one peer dep mismatch needs a new override.

### 1. `glob@11.1.0` — Remove

No security CVE found in git history. Added during a dependency upgrade cycle as a deduplication measure. With the override removed, npm resolves each consumer's requested version natively — no conflicts and no warnings.

### 2. `path-to-regexp@8.4.0` → `8.4.2` — Bump

Originally pinned in commit `a10dd4fb9` to fix ReDoS vulns GHSA-j3q9-mxjg-w52f and GHSA-27v5-c462-wpq7 (closes #205). The pin is still required. However `8.4.0` is lower than what `@nestjs/core@11.1.18` and `@nestjs/platform-express@11.1.18` expect (`8.4.2`), causing the override warning. Bumping to `8.4.2` satisfies all consumers:

- `@nestjs/core` / `@nestjs/platform-express` expect `8.4.2` ✓
- `@nestjs/swagger` expects `8.3.0` ✓ (8.4.2 satisfies >=8.3.0)

### 3. `multer@2.1.1` — Remove

`multer@2.1.1` is already declared as a direct dependency in `dependencies`. The override is redundant — npm will use the direct dep version. `@nestjs/platform-express` also resolves `multer@2.1.1` natively. Removing the override eliminates noise with no behaviour change.

### 4. `@nestjs/mapped-types` — Add `2.1.1`

`@nestjs/swagger@11.2.x` bundles `@nestjs/mapped-types@2.1.0`, which declares `class-validator: "^0.13.0 || ^0.14.0"` as a peer dep. The project has `class-validator@0.15.1` installed (the latest release). Rather than downgrade class-validator, override `@nestjs/mapped-types` to `2.1.1`, which relaxes or removes that constraint.

---

## Changes

**File:** `backend/package.json` — `overrides` section only

| Key | Before | After |
|---|---|---|
| `glob` | `"11.1.0"` | *(removed)* |
| `path-to-regexp` | `"8.4.0"` | `"8.4.2"` |
| `multer` | `"2.1.1"` | *(removed)* |
| `@nestjs/mapped-types` | *(absent)* | `"2.1.1"` |

**Unchanged overrides** (all have verified security CVEs — do not remove):
`body-parser`, `tar`, `js-yaml`, `qs`, `file-type`, `lodash`, `picomatch`, `@angular-devkit/core > ajv`

---

## Verification Steps

1. `npm install` — regenerates `package-lock.json`
2. `npm update --dry-run` — should produce zero ERESOLVE warnings
3. `npm ls` — should show no `class-validator` peer dep violation
4. `npm audit` — should remain at 2 vulns (bundled inside npm binary itself, unfixable at project level)
5. `npm run test` — backend test suite passes
