# Version Sync Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `backend/package.json` and `frontend/package.json` being stuck at `1.88.5` while the latest release is `v1.88.10`, and prevent this from happening again by restoring `@semantic-release/git` with a GitHub Ruleset bypass for `github-actions[bot]`.

**Architecture:** Three sequential steps — (1) manual GitHub UI Ruleset migration, (2) immediate version bump in both `package.json` files with lockfile updates, (3) re-add `@semantic-release/git` to root `package.json` and `release.config.cjs` so future releases auto-commit version bumps back to `main`.

**Tech Stack:** semantic-release, `@semantic-release/git`, npm, GitHub Rulesets

---

## ⚠️ Manual Prerequisite (Do This First)

Before running any code tasks, migrate branch protection to a Ruleset in the GitHub UI:

1. Go to `https://github.com/blur88/erp2/settings/rules` → **New ruleset** → **New branch ruleset**
2. **Name:** `main protection`
3. **Enforcement status:** Active
4. **Target branches:** Add target → Include by pattern → `main`
5. **Bypass list:** Add bypass → search `github-actions` → select **github-actions[bot]** → Role: bypass
6. **Rules — enable these:**
   - ✅ Require a pull request before merging
     - Required approvals: `1`
     - Dismiss stale reviews: off
     - Require review from code owners: off
     - Require last push approval: off
   - ✅ Require status checks to pass
     - Require branches to be up to date: ✅
     - Add status checks: `Frontend - Lint, Type Check, Tests` and `Backend - Lint, Unit Tests, E2E Tests`
7. Click **Create** to save the ruleset
8. Go to `https://github.com/blur88/erp2/settings/branches` → delete the old **main** classic branch protection rule

Only proceed to the tasks below after the Ruleset is active and the classic rule is deleted.

---

### Task 1: Bump package.json versions to 1.88.10

**Files:**
- Modify: `backend/package.json` (line 3 — `"version"` field)
- Modify: `frontend/package.json` (line 3 — `"version"` field)
- Modify: `backend/package-lock.json` (auto-updated by npm)
- Modify: `frontend/package-lock.json` (auto-updated by npm)

- [ ] **Step 1: Update backend/package.json version**

In `backend/package.json`, change:
```json
"version": "1.88.5",
```
to:
```json
"version": "1.88.10",
```

- [ ] **Step 2: Update frontend/package.json version**

In `frontend/package.json`, change:
```json
"version": "1.88.5",
```
to:
```json
"version": "1.88.10",
```

- [ ] **Step 3: Update backend lockfile**

```bash
cd /home/blur/erp2/backend && npm install --package-lock-only
```

Expected: lockfile updated, no packages installed, exits 0.

- [ ] **Step 4: Update frontend lockfile**

```bash
cd /home/blur/erp2/frontend && npm install --package-lock-only
```

Expected: lockfile updated, no packages installed, exits 0.

- [ ] **Step 5: Verify versions**

```bash
grep '"version"' /home/blur/erp2/backend/package.json /home/blur/erp2/frontend/package.json
```

Expected output:
```
/home/blur/erp2/backend/package.json:  "version": "1.88.10",
/home/blur/erp2/frontend/package.json:  "version": "1.88.10",
```

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add backend/package.json frontend/package.json backend/package-lock.json frontend/package-lock.json
git commit -m "chore(release): bump package versions to 1.88.10 to match latest release"
```

---

### Task 2: Re-add @semantic-release/git

**Files:**
- Modify: `package.json` (root — add `@semantic-release/git` dependency)
- Modify: `release.config.cjs` (add `@semantic-release/git` plugin entry)
- Modify: `package-lock.json` (root — auto-updated by npm install)

- [ ] **Step 1: Add @semantic-release/git to root package.json**

In `/home/blur/erp2/package.json`, change:
```json
{
  "name": "erp2-release",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "semantic-release": "^25.0.0",
    "@semantic-release/github": "^12.0.0",
    "@semantic-release/npm": "^13.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0"
  }
}
```
to:
```json
{
  "name": "erp2-release",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "semantic-release": "^25.0.0",
    "@semantic-release/git": "^10.0.0",
    "@semantic-release/github": "^12.0.0",
    "@semantic-release/npm": "^13.0.0",
    "@semantic-release/commit-analyzer": "^13.0.0",
    "@semantic-release/release-notes-generator": "^14.0.0"
  }
}
```

- [ ] **Step 2: Install the package**

```bash
cd /home/blur/erp2 && npm install
```

Expected: `@semantic-release/git` installed, `package-lock.json` updated, exits 0.

- [ ] **Step 3: Add @semantic-release/git plugin to release.config.cjs**

In `/home/blur/erp2/release.config.cjs`, change the end of the plugins array from:
```js
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'frontend',
        npmPublish: false,
      },
    ],
    '@semantic-release/github',
  ],
};
```
to:
```js
    [
      '@semantic-release/npm',
      {
        pkgRoot: 'frontend',
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['backend/package.json', 'frontend/package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
    '@semantic-release/github',
  ],
};
```

- [ ] **Step 4: Verify release.config.cjs plugin order**

```bash
grep -n "semantic-release" /home/blur/erp2/release.config.cjs
```

Expected output shows plugins in this order:
```
@semantic-release/commit-analyzer
@semantic-release/release-notes-generator
@semantic-release/npm  (backend)
@semantic-release/npm  (frontend)
@semantic-release/git
@semantic-release/github
```

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add package.json package-lock.json release.config.cjs
git commit -m "fix(ci): restore @semantic-release/git to commit version bumps back to main

github-actions[bot] is now a bypass actor on the main ruleset,
so the bot can push the chore(release) commit directly without a PR.

Closes #461"
```

---

## Verification

After both tasks are complete and the PR is merged:

1. Confirm `package.json` versions show `1.88.10`:
```bash
grep '"version"' backend/package.json frontend/package.json
```

2. After the next real `fix:` or `feat:` PR merges, watch the Actions tab — the release job should produce a `chore(release): X.X.X [skip ci]` commit directly on `main`, and both `backend/package.json` and `frontend/package.json` in the repo should show the new version.
