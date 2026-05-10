# Refactor Radar — Design Spec

**Issue:** #193
**Date:** 2026-03-28
**Status:** Approved

---

## Overview

Add a `do_refactor_radar()` function to `maintain.sh` as Step 7. It runs three bash-based detectors using co-occurrence grep logic to identify logical duplication and code bloat patterns that simple copy-paste detectors miss. Output is terminal-only, styled to match existing maintain.sh steps. No new dependencies required.

Scan targets:
- `frontend/src/` — React/TypeScript source
- `backend/src/` — NestJS source

The root folder is excluded (contains only semantic-release tooling, no source files).

---

## Detectors

### 1. State Cluster Detector (Frontend)

**Scans:** `frontend/src/pages/**/*.tsx`

**Logic:** For each file, count how many of these `useState` variable names appear: `dateFrom`, `dateTo`, `loading`, `categories`, `products`, `selectedProduct`, `selectedCategory`. Flag files where ≥3 co-occur in the same file.

**Why co-occurrence matters:** A file mentioning `dateFrom` in an imported interface shouldn't be flagged. Requiring ≥3 signals together ensures the file actually owns the full state cluster pattern.

**Output on finding:**
```
⚠  pages/sales/CustomerOrderHistory.tsx
   Found: dateFrom, dateTo, loading, categories, products, selectedCategory
   → Extract into useReportFilters hook
```

**Guidance:** Suggests extracting into a `useReportFilters` hook. The detected variable names are listed so the developer knows exactly what to extract.

---

### 2. Audit Manualism Detector (Backend)

**Scans:** `backend/src/modules/**/*.controller.ts`

**Logic:** Flag controller files that contain both `@CurrentUser('userId')` AND pass `currentUserId` as an argument to a service call. Count the number of such endpoint occurrences per file.

**Output on finding:**
```
⚠  modules/sales/controllers/customer.controller.ts
   3 endpoints pass currentUserId manually
   → Consider a @CurrentUserAudit() interceptor or shared AuditService
```

**Guidance:** Points toward centralizing via an interceptor or shared AuditService rather than manually threading userId through every endpoint.

---

### 3. Dependency/Bloat Detector (Frontend + Backend)

Two sub-checks run independently.

**Frontend bloat:** Flag `.tsx` files in `frontend/src/pages/` with >10 `useState` calls total — a component managing this much local state is likely doing too much.

**Backend bloat:** Flag `.ts` files in `backend/src/modules/` whose constructor has >5 injected dependencies — a service with this many deps likely has too many responsibilities.

**Output on finding:**
```
Frontend bloat:
  ⚠  pages/inventory/ProductsPage.tsx
     14 useState calls — component may need splitting

Backend bloat:
  ⚠  modules/inventory/controllers/product.controller.ts
     6 constructor dependencies — consider splitting responsibilities
```

**Clean output:**
```
  ✓  No issues found.
```

---

## Integration into maintain.sh

### Step registration

Add to the `run_step` case statement:
```bash
7) do_refactor_radar ;;
```

Add to the steps menu display:
```
7) Refactor Radar (Smart Detection)
```

### Output style

Matches existing maintain.sh conventions:
- Section headers: `BOLD` + `YELLOW`
- Findings: `RED` for `⚠`
- Suggestions (`→`): `CYAN`
- Clean results: `GREEN` for `✓`
- File paths shown relative to `frontend/src/` or `backend/src/`

---

## What This Does Not Do

- Does not modify any source files — detection and guidance only
- Does not write a report file — terminal output only
- Does not use TS-Morph, tsx, or any new runtime dependencies
- Does not scan the root workspace folder

---

## Expected Findings (Based on Current Codebase)

State Cluster: ~13 report pages across `sales/`, `inventory/`, and `purchasing/` are expected to be flagged.

Audit Manualism: Multiple controllers across `sales/`, `inventory/`, and `purchasing/` modules pass `currentUserId` manually.

Bloat: Several large page components (e.g., `CustomerOrderHistory.tsx` at 1676 lines) will exceed the 10-useState threshold.
