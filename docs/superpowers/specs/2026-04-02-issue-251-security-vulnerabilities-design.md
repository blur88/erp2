---
title: Issue #251 — Security Vulnerability Resolution
date: 2026-04-02
issue: https://github.com/blur88/erp2/issues/251
---

# Security Vulnerability Resolution (Issue #251)

## Summary

Resolve all high and moderate npm security vulnerabilities in the root and backend directories without introducing breaking changes.

## Vulnerabilities

### Root Directory (`semantic-release` workspace)

| Package | Severity | Issue |
|---|---|---|
| `picomatch` | High | ReDoS via extglob quantifiers (GHSA-c2c7-rcm5-vvqj) |
| `brace-expansion` | Moderate | Zero-step sequence causes DoS (GHSA-f886-m6hf-6m8v) |

Both are dev-only sub-dependencies of `semantic-release`. `npm audit fix` resolves them safely.

### Backend Directory (NestJS)

| Package | Severity | Issue |
|---|---|---|
| `lodash@<=4.17.23` | High | Code injection via `_.template` (GHSA-r5fr-rjxr-66jc) |
| `lodash@<=4.17.23` | Moderate | Prototype pollution via `_.unset`/`_.omit` (GHSA-f23m-r3pf-42rh) |
| `@nestjs/config` | High | Via lodash (transitive) |
| `@nestjs/swagger` | High | Via lodash (transitive) |

`lodash` is not imported directly in any backend source file — it is a transitive dependency of `@nestjs/config`, `@nestjs/swagger`, `@nestjs/cli`, `bull`, and `archiver`.

## Approach

### Root: Deferred (upstream blocker)

`picomatch` and `brace-expansion` are bundled inside `npm@11.12.1`, which is pulled by
`@semantic-release/npm@13.1.5`. Bundled dependencies cannot be overridden from outside the
package — npm `overrides` in `package.json` only affect the top-level dependency resolution
tree, not the private bundled tree inside `node_modules/npm/node_modules/`.

`npm@11.12.1` is the latest published version as of 2026-04-02. No fix is available until npm
publishes a new release with patched versions of `brace-expansion` (needs >=5.0.5) and
`picomatch` (needs >=4.0.4) in its bundled tree.

**Impact:** Dev/CI-only. `npm audit --omit=dev` returns 0 vulnerabilities. These packages are
only executed during the `semantic-release` publish step in CI — not in production, not in
the Docker image. Risk is low and limited to CI environment.

**Action:** Monitor npm releases. When `npm` ships a version with patched bundled deps,
`@semantic-release/npm` will pick it up automatically on the next `npm install`.

### Backend: npm `overrides`

Add an `overrides` block to `backend/package.json` to pin lodash to `^4.18.1` (the first patched release above the vulnerable `<=4.17.23` range):

```json
"overrides": {
  "lodash": "^4.18.1"
}
```

Then run `npm install` to apply the override.

**Why overrides, not a direct version bump**: `@nestjs/config` is currently at `v4.0.3` and `@nestjs/swagger` at `v11.2.6`. The npm audit "fix available" suggestion of downgrading to `v1.1.5` / `v2.5.1` are major version regressions that would break the application. The `overrides` field forces all transitive consumers to the patched lodash version without touching any direct dependencies.

## Verification

1. `npm audit` in root → expect 0 vulnerabilities
2. `npm audit` in backend → expect 0 vulnerabilities
3. `cd backend && npm run test` → all tests pass

## Risk

Low. lodash is not used directly in backend source. Upgrading from `4.17.23` to `4.18.1` is a patch-level change with no API changes. The override only affects transitive resolution; all direct dependency versions remain unchanged.
