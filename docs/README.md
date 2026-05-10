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
