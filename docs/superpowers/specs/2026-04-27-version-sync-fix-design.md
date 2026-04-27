# Design: Fix Version Sync Between package.json and GitHub Releases

**Issue:** #461
**Date:** 2026-04-27

## Problem

`backend/package.json` and `frontend/package.json` are stuck at `1.88.5` while the latest GitHub release is `v1.88.10`. This happened because `@semantic-release/git` was removed (commit `3eddfc250`) to unblock releases after it failed to push version-bump commits back to `main` — branch protection requires a PR review for all pushes, including bot commits.

Without `@semantic-release/git`, semantic-release still creates tags and GitHub releases correctly, but the `package.json` version bumps only exist in the CI workspace and are never committed back to the repo. Every release since `v1.88.5` has left the repo files stale.

## Fix

Three steps, in order:

### 1. Immediate version bump

Update `version` in both `backend/package.json` and `frontend/package.json` from `1.88.5` to `1.88.10` to match the current latest release. Also update both `package-lock.json` files (`npm install --package-lock-only` in each directory).

### 2. Migrate branch protection to a Ruleset with bypass actor

Delete the existing classic branch protection rule for `main` and replace it with a GitHub Ruleset. Rulesets support explicit bypass actors, allowing `github-actions[bot]` to push directly to `main` without a PR review — no PAT or GitHub App required, `GITHUB_TOKEN` continues to work as-is.

**Manual step (GitHub UI):**
1. Go to Settings → Rules → Rulesets → New ruleset → New branch ruleset
2. Name: `main protection`
3. Enforcement: Active
4. Target branches: `main`
5. Rules to enable:
   - Require a pull request before merging (1 approving review)
   - Require status checks to pass: `Frontend - Lint, Type Check, Tests` and `Backend - Lint, Unit Tests, E2E Tests` (strict — require branches to be up to date)
6. Bypass actors: add `github-actions[bot]` (role: bypass)
7. Save ruleset
8. Delete the old classic branch protection rule for `main`

This preserves the exact same protection for human contributors while allowing the Actions bot to push the version-bump commit directly.

### 3. Re-add @semantic-release/git

In `package.json` (root), restore the dependency:
```json
"@semantic-release/git": "^10.0.0"
```

In `release.config.cjs`, restore the plugin entry after the `@semantic-release/npm` blocks:
```js
[
  '@semantic-release/git',
  {
    assets: ['backend/package.json', 'frontend/package.json'],
    message: 'chore(release): ${nextRelease.version} [skip ci]',
  },
],
```

`CHANGELOG.md` is intentionally excluded from assets (removed in a prior cleanup).

No changes needed to `.github/workflows/release.yml` — `GITHUB_TOKEN` continues to be used as-is.

## Data Flow After Fix

```
PR merges to main
  → release.yml triggers (using GITHUB_TOKEN = github-actions[bot])
  → semantic-release analyzes commits
  → bumps version in backend/package.json + frontend/package.json (in workspace)
  → @semantic-release/git commits those files back to main
      (allowed: github-actions[bot] is a ruleset bypass actor)
  → creates git tag + GitHub release
  → Docker images built from the tagged commit (package.json versions now correct)
```

## What Is Not Changed

- CI status check requirements remain identical
- PR review requirement (1 approving review) remains for human contributors
- `CHANGELOG.md` remains removed
- Docker build workflow is unchanged
- `release.yml` token unchanged — still uses `GITHUB_TOKEN`
- Frontend `__APP_VERSION__` injection via `npm_package_version` continues to work correctly

## Testing

After implementation:
1. Verify `backend/package.json` and `frontend/package.json` show `1.88.10`
2. Merge a `fix:` or `feat:` commit and confirm the release workflow produces a `chore(release): X.X.X [skip ci]` commit on `main` with bumped `package.json` files
