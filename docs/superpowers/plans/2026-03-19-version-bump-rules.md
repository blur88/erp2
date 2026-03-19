# Version Bump Rules Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `semantic-release` to trigger patch version bumps on `style:` and `chore:` commits, while preventing the release commit itself from triggering a second bump.

**Architecture:** One config change in `.releaserc.json` — replace the bare `"@semantic-release/commit-analyzer"` string with a two-element array that adds a `releaseRules` option. No workflow files, no application code, no dependencies change.

**Tech Stack:** `semantic-release`, `@semantic-release/commit-analyzer` (already installed)

---

### Task 1: Update `.releaserc.json`

**Files:**
- Modify: `.releaserc.json`

**Spec:** `docs/superpowers/specs/2026-03-19-version-bump-rules-design.md`

- [ ] **Step 1: Verify current state**

  Open `.releaserc.json` and confirm line 4 reads:
  ```json
  "@semantic-release/commit-analyzer",
  ```
  (a bare string, not an array)

- [ ] **Step 2: Apply the change**

  Replace that bare string with the plugin-with-options array. The full updated `plugins` array should read:

  ```json
  "plugins": [
    ["@semantic-release/commit-analyzer", {
      "releaseRules": [
        { "type": "chore", "scope": "release", "release": false },
        { "type": "chore", "release": "patch" },
        { "type": "style", "release": "patch" }
      ]
    }],
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    [
      "@semantic-release/npm",
      {
        "pkgRoot": "backend",
        "npmPublish": false
      }
    ],
    [
      "@semantic-release/npm",
      {
        "pkgRoot": "frontend",
        "npmPublish": false
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md", "backend/package.json", "frontend/package.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]"
      }
    ],
    "@semantic-release/github"
  ]
  ```

- [ ] **Step 3: Validate JSON syntax**

  Run:
  ```bash
  node -e "require('./.releaserc.json'); console.log('valid')"
  ```
  Expected output: `valid`

- [ ] **Step 4: Dry-run semantic-release locally**

  Run:
  ```bash
  npx semantic-release --dry-run --no-ci 2>&1 | head -60
  ```

  This will fail to authenticate with GitHub (no token in local env) but will still parse and load the config. Look for:
  - No JSON parse errors
  - No "Invalid release rule" errors from `commit-analyzer`
  - Output like `Running semantic-release version X.X.X`

  If you see `Invalid release rule` — the `releaseRules` config is malformed. Re-check step 2.

- [ ] **Step 5: Commit**

  ```bash
  git add .releaserc.json
  git commit -m "chore: extend semantic-release to bump patch on style and chore commits"
  ```
