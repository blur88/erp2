# Docs Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the `docs/` folder per issue #206 — consolidate root-level files, archive all completed superpowers plans/specs, update the README, and gitignore future planning docs.

**Architecture:** Pure file-system reorganization with no code changes. All moves are `git mv` so history is preserved. Gitignore added last, after all files are committed to their final locations.

**Tech Stack:** git, bash

---

## File Map

**Created:**
- `docs/design/` (new directory)
- `docs/deployment/` (new directory)
- `docs/modules/price-lists/` (new directory)

**Moved/renamed:**
- `docs/COLOR_PALETTE.md` → `docs/design/color-palette.md`
- `docs/ui.md` → `docs/design/ui.md`
- `docs/DEPLOYMENT_CHECKLIST.md` → `docs/deployment/DEPLOYMENT_CHECKLIST.md`
- `docs/PRICE_LIST_API.md` → `docs/modules/price-lists/PRICE_LIST_API.md`
- `docs/PRICE_LIST_DEPLOYMENT_GUIDE.md` → `docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md`
- `docs/PRICE_LIST_SUMMARY.md` → `docs/modules/price-lists/PRICE_LIST_SUMMARY.md`
- `docs/PRICE_LIST_USER_GUIDE.md` → `docs/modules/price-lists/PRICE_LIST_USER_GUIDE.md`
- All `docs/superpowers/plans/*.md` → `docs/superpowers/plans/completed/`
- All `docs/superpowers/specs/*.md` → `docs/superpowers/specs/completed/`

**Modified:**
- `docs/README.md` — rewritten to reflect new structure
- `.gitignore` — add entries for `docs/superpowers/plans/` and `docs/superpowers/specs/`

---

### Task 1: Move root-level docs into subdirectories

**Files:**
- Move: `docs/COLOR_PALETTE.md` → `docs/design/color-palette.md`
- Move: `docs/ui.md` → `docs/design/ui.md`
- Move: `docs/DEPLOYMENT_CHECKLIST.md` → `docs/deployment/DEPLOYMENT_CHECKLIST.md`
- Move: `docs/PRICE_LIST_*.md` → `docs/modules/price-lists/`

- [ ] **Step 1: Create new directories**

```bash
mkdir -p docs/design docs/deployment docs/modules/price-lists
```

- [ ] **Step 2: Move design files**

```bash
git mv docs/COLOR_PALETTE.md docs/design/color-palette.md
git mv docs/ui.md docs/design/ui.md
```

- [ ] **Step 3: Move deployment file**

```bash
git mv docs/DEPLOYMENT_CHECKLIST.md docs/deployment/DEPLOYMENT_CHECKLIST.md
```

- [ ] **Step 4: Move price-list files**

```bash
git mv docs/PRICE_LIST_API.md docs/modules/price-lists/PRICE_LIST_API.md
git mv docs/PRICE_LIST_DEPLOYMENT_GUIDE.md docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md
git mv docs/PRICE_LIST_SUMMARY.md docs/modules/price-lists/PRICE_LIST_SUMMARY.md
git mv docs/PRICE_LIST_USER_GUIDE.md docs/modules/price-lists/PRICE_LIST_USER_GUIDE.md
```

- [ ] **Step 5: Verify moves**

```bash
git status
```

Expected: 7 renames shown, no untracked files, no deletions.

- [ ] **Step 6: Commit**

```bash
git commit -m "docs: reorganize root-level files into design/, deployment/, modules/"
```

---

### Task 2: Move all superpowers plans to completed/

**Files:**
- Move: all `docs/superpowers/plans/*.md` → `docs/superpowers/plans/completed/`

- [ ] **Step 1: Move all plan files**

```bash
find docs/superpowers/plans -maxdepth 1 -name "*.md" | xargs -I{} git mv {} docs/superpowers/plans/completed/
```

- [ ] **Step 2: Verify**

```bash
ls docs/superpowers/plans/
```

Expected: only `completed/` and `README.md` (if it exists) remain at the top level. No loose `.md` files.

```bash
ls docs/superpowers/plans/completed/ | wc -l
```

Expected: a number significantly larger than before (all historical plans now here).

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: move all superpowers plans to completed/"
```

---

### Task 3: Move all superpowers specs to completed/

**Files:**
- Move: all `docs/superpowers/specs/*.md` → `docs/superpowers/specs/completed/`

- [ ] **Step 1: Move all spec files**

```bash
find docs/superpowers/specs -maxdepth 1 -name "*.md" | xargs -I{} git mv {} docs/superpowers/specs/completed/
```

- [ ] **Step 2: Verify**

```bash
ls docs/superpowers/specs/
```

Expected: only `completed/` remains at the top level. No loose `.md` files.

```bash
ls docs/superpowers/specs/completed/ | wc -l
```

Expected: a number significantly larger than before (all historical specs now here).

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: move all superpowers specs to completed/"
```

---

### Task 4: Update docs/README.md

**Files:**
- Modify: `docs/README.md`

- [ ] **Step 1: Rewrite README.md**

Replace the entire contents of `docs/README.md` with the following (the directory tree uses plain indented text, not a fenced block):

```
# ERP System Documentation

## Directory Structure

    docs/
    ├── README.md                        # This file
    ├── archive/                         # Historical reports and phase summaries
    ├── design/
    │   ├── color-palette.md             # Color palette and theming rules
    │   └── ui.md                        # UI design system reference
    ├── deployment/
    │   └── DEPLOYMENT_CHECKLIST.md      # Deployment checklist
    ├── modules/
    │   └── price-lists/
    │       ├── PRICE_LIST_API.md        # API reference
    │       ├── PRICE_LIST_DEPLOYMENT_GUIDE.md  # Deployment procedures
    │       ├── PRICE_LIST_SUMMARY.md    # High-level overview
    │       └── PRICE_LIST_USER_GUIDE.md # End-user manual
    └── superpowers/
        ├── plans/completed/             # All completed implementation plans (gitignored at root)
        └── specs/completed/             # All completed design specs (gitignored at root)

## Design System

Frontend design references:

- [design/color-palette.md](./design/color-palette.md) — Color palette and theming rules
- [design/ui.md](./design/ui.md) — UI component standards and design system reference

## Deployment

- [deployment/DEPLOYMENT_CHECKLIST.md](./deployment/DEPLOYMENT_CHECKLIST.md) — Deployment checklist

## Price List Module

Reference documentation for the Price List module (implemented Jan 2026):

- [modules/price-lists/PRICE_LIST_SUMMARY.md](./modules/price-lists/PRICE_LIST_SUMMARY.md) — High-level overview
- [modules/price-lists/PRICE_LIST_API.md](./modules/price-lists/PRICE_LIST_API.md) — API reference
- [modules/price-lists/PRICE_LIST_USER_GUIDE.md](./modules/price-lists/PRICE_LIST_USER_GUIDE.md) — End-user manual
- [modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md](./modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md) — Deployment procedures

## Superpowers Plans & Specs

Completed plans and specs live in docs/superpowers/plans/completed/ and docs/superpowers/specs/completed/. Active planning docs are local-only (gitignored) to prevent repository flooding. Only finalized architectural documents are committed.
```

- [ ] **Step 2: Verify the file looks correct**

```bash
cat docs/README.md
```

Expected: new structure tree shown, all links updated, no references to old root-level paths.

- [ ] **Step 3: Commit**

```bash
git add docs/README.md
git commit -m "docs: update README to reflect new directory structure"
```

---

### Task 5: Gitignore superpowers plans and specs directories

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add gitignore entries**

Open `.gitignore` and add the following block after the existing entries (e.g., at the end of the file):

```
# Superpowers planning docs — local-only, not committed (see docs/README.md)
docs/superpowers/plans/*.md
docs/superpowers/specs/*.md
```

Note: using `*.md` rather than the full directory path so the `completed/` subdirectories remain tracked.

- [ ] **Step 2: Verify no currently-tracked files are now ignored**

```bash
git status
```

Expected: only `.gitignore` shows as modified. No tracked files should be newly shown as deleted or ignored — all loose `.md` files were already moved to `completed/` in Tasks 2 and 3.

- [ ] **Step 3: Confirm gitignore works for a test file**

```bash
touch docs/superpowers/plans/test-ignore-check.md
git status
```

Expected: `test-ignore-check.md` does NOT appear in `git status` (it is ignored).

```bash
rm docs/superpowers/plans/test-ignore-check.md
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore superpowers plans/specs to prevent repo flooding

Closes #206"
```
