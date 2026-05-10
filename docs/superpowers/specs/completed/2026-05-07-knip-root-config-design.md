# Knip Root Configuration Fix

**Issue:** #542  
**Date:** 2026-05-07

## Problem

Running `npx knip` at the repo root produces 978 false positives because Knip has no configuration to understand the monorepo structure. It scans `backend/` and `frontend/` as if they were part of the root project, when in fact each has its own `knip.json` and independent entry points. Additionally, `eslint` and `semantic-release` are flagged as unlisted binaries because they are installed at CI runtime via `npm install --no-save` rather than declared in root `package.json`.

## Solution

Create `knip.json` at the repo root (Option A: explicit entry points + ignore sub-projects).

### Entry points

The root project is solely the semantic-release tooling:

- `release.config.cjs` — semantic-release configuration
- `scripts/*.cjs` — release helpers (`release-notes-helpers.cjs`, `backfill-release-notes.cjs`)
- `scripts/__tests__/*.js` — test files for the above

### Ignored paths

- `backend/**` — has its own `knip.json`
- `frontend/**` — has its own `knip.json`

### Ignored binaries

- `eslint` — used in GitHub Actions CI workflow, installed at runtime
- `semantic-release` — used in GitHub Actions release workflow, installed at runtime

## Design

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "release.config.cjs",
    "scripts/*.cjs",
    "scripts/__tests__/*.js"
  ],
  "project": [
    "*.cjs",
    "scripts/**/*.{cjs,js}"
  ],
  "ignore": [
    "backend/**",
    "frontend/**"
  ],
  "ignoreBinaries": [
    "eslint",
    "semantic-release"
  ],
  "ignoreExportsUsedInFile": true
}
```

## Out of scope

- `maintain.sh` — left unchanged
- Backend/frontend knip configs — already clean, no changes needed
- Root `package.json` — no devDependencies to add; binaries are CI-only runtime installs

## Verification

After creating `knip.json`, run `npx knip` from the repo root and confirm zero issues reported.
