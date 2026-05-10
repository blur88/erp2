# Knip Root Config Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `knip.json` at the repo root so `npx knip` reports zero issues instead of 978 false positives.

**Architecture:** A single `knip.json` defines the root project scope (semantic-release tooling only), ignores `backend/` and `frontend/` sub-projects (each with their own knip config), and silences the two CI-only binaries that are never in `package.json`.

**Tech Stack:** Knip 5, JSON config

---

### Task 1: Create root knip.json and verify

**Files:**
- Create: `knip.json`

- [ ] **Step 1: Create the config file**

Create `/home/blur/erp2/knip.json` with this exact content:

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

- [ ] **Step 2: Run Knip to verify zero issues**

Run from the repo root:
```bash
npx knip
```

Expected output: no output (exit 0), or a message like `✓ No issues found`.

If there are remaining issues, check what files/binaries are flagged and add them to the appropriate `ignore`, `ignoreBinaries`, or `ignoreDependencies` array.

- [ ] **Step 3: Commit**

```bash
git add knip.json
git commit -m "chore: add root knip.json to fix 978 false positives (issue #542)

Closes #542"
```
