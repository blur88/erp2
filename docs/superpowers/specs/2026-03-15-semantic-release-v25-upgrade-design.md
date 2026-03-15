# Design: semantic-release v25 Upgrade (Issue #103)

**Date:** 2026-03-15
**Issue:** #103
**Status:** Approved

## Overview

Upgrade `semantic-release` and its core plugins to their latest major versions for improved stability and modern Node.js support.

## Changes

### 1. `package.json` — version range bumps

| Package | From | To |
|---|---|---|
| `semantic-release` | `^24.0.0` | `^25.0.3` |
| `@semantic-release/github` | `^10.0.0` | `^12.0.0` |
| `@semantic-release/npm` | `^12.0.0` | `^13.0.0` |

Other plugins (`@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`) are unchanged.

### 2. `.github/workflows/release.yml` — GitHub token permissions

Add `issues: write` and `pull-requests: write` to the `release` job permissions block (required by `@semantic-release/github` v12):

```yaml
jobs:
  release:
    permissions:
      contents: write
      issues: write
      pull-requests: write
```

### 3. `package-lock.json` — regenerate

Run `npm install` at the repo root after updating `package.json` to pull the new versions and update the lockfile.

## Out of Scope

- **OIDC / npm Trusted Publishing** — not applicable; both packages have `npmPublish: false`
- **Node.js version** — CI already uses Node 24, which exceeds the v22.14.0 minimum
- **`.releaserc.json`** — no changes needed
- **`ci.yml`** — no changes needed

## Testing

Verify via a dry-run after merging:

```bash
npx semantic-release --dry-run
```
