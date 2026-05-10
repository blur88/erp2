# Docs Reorganization Design

**Issue:** #206  
**Date:** 2026-05-10

## Goal

Tidy the `docs/` folder: consolidate root-level files into logical subdirectories, move all completed superpowers plans/specs into their `completed/` subdirectories, and update `docs/README.md` to reflect the actual structure.

## Target Structure

```
docs/
├── README.md                          # updated
├── archive/                           # unchanged
├── design/
│   ├── color-palette.md               # renamed from COLOR_PALETTE.md
│   └── ui.md                          # moved from root
├── deployment/
│   └── DEPLOYMENT_CHECKLIST.md        # moved from root
├── modules/
│   └── price-lists/
│       ├── PRICE_LIST_API.md
│       ├── PRICE_LIST_DEPLOYMENT_GUIDE.md
│       ├── PRICE_LIST_SUMMARY.md
│       └── PRICE_LIST_USER_GUIDE.md
└── superpowers/
    ├── plans/
    │   └── completed/                 # all plans moved here
    └── specs/
        └── completed/                 # all specs moved here
```

## Changes

### 1. Root file cleanup
- Create `docs/design/`; move `ui.md` and rename `COLOR_PALETTE.md` → `color-palette.md` into it. Both are frontend design-system references and belong together.
- Create `docs/deployment/`; move `DEPLOYMENT_CHECKLIST.md`.
- Create `docs/modules/price-lists/`; move all four `PRICE_LIST_*.md` files.

### 2. Superpowers plans/specs
- Move all files currently in `docs/superpowers/plans/` (Mar 18 – May 10 2026) into `docs/superpowers/plans/completed/`. Existing completed/ contents are preserved.
- Move all files currently in `docs/superpowers/specs/` (Mar 18 – May 10 2026) into `docs/superpowers/specs/completed/`. Existing completed/ contents are preserved.

### 3. README update
- Rewrite `docs/README.md` directory tree to match new structure.
- Update all internal links to point to new file locations.

## Delivery

Single commit, closes issue #206.
