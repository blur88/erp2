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
| `semantic-release` | `^24.0.0` | `^25.0.0` |
| `@semantic-release/github` | `^10.0.0` | `^12.0.0` |
| `@semantic-release/npm` | `^12.0.0` | `^13.0.0` |

**Notes:**
- `@semantic-release/github` v11 exists but is intentionally skipped — issue #103 targets v12 specifically as the current stable release.
- `@semantic-release/npm` v13 is upgraded as part of this change because it is a peer dependency compatibility requirement of `semantic-release` v25 (v12 is not supported alongside v25).

Other plugins (`@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`) are unchanged.

### 2. `.github/workflows/release.yml` — GitHub token permissions

The `release.yml` workflow has two jobs: `release` (runs semantic-release) and `build-and-push` (builds Docker images). Only the `release` job needs updating.

Add `issues: write` and `pull-requests: write` to the `release` job permissions block (required by `@semantic-release/github` v12). `contents: write` is already present in the job block — only the two new entries need to be added. The workflow also has a top-level `permissions: contents: read` block, but job-level permissions override it, so only the job block needs updating.

Note: `statuses: write` is **not** required — `@semantic-release/github` v12 removed commit status posting.

```yaml
jobs:
  release:
    permissions:
      contents: write
      issues: write
      pull-requests: write
```

### 3. `package-lock.json` — regenerate

Run `npm install` at the repo root (under Node 24, matching CI) after updating `package.json`. Only the root `package-lock.json` is affected — `semantic-release` is a root-level devDependency and is not present in `backend/` or `frontend/`.

## Out of Scope

- **OIDC / npm Trusted Publishing** — not applicable; both packages have `npmPublish: false`
- **Node.js version** — CI already uses Node 24, which exceeds the v22.14.0 minimum
- **`.releaserc.json`** — no changes needed
- **`ci.yml`** — no changes needed

## Testing

There is no dedicated dry-run job in this workflow. Verification happens in two stages:

1. **Pre-merge (local):** Run with `GITHUB_TOKEN` exported in your shell:
   ```bash
   GITHUB_TOKEN=<your-token> npx semantic-release --dry-run
   ```
   A successful dry-run prints the next computed version number and lists the GitHub release steps it would take (create release, comment on issues/PRs) without executing them. Without `GITHUB_TOKEN`, it will fail with a credentials error.

2. **Post-merge (CI):** Push to `main` and observe the `release` workflow run in GitHub Actions. The first real release after the upgrade confirms the permissions and plugin versions are working correctly.
