# Sidebar Navigation Refactoring — Design Spec

**Issue:** #124
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Simplify the sidebar navigation by renaming groups for clarity and flattening the Analytics section to reduce unnecessary nesting.

---

## Changes

### 1. Accounting Section — Rename Group

**File:** `frontend/src/components/common/Sidebar.tsx`

- `id: 'accounting-reports'` — unchanged
- `title: 'Accounting Reports'` → `title: 'Reports'`

**Reason:** The parent section is already "Accounting", so "Accounting Reports" is redundant.

---

### 2. Analytics Section — Rename + Flatten

**File:** `frontend/src/components/common/Sidebar.tsx`

- Section `id: 'analytics'` — unchanged
- Section `title: 'Analytics'` → `title: 'Reports'`
- Remove the `id: 'reports'` wrapper item entirely
- Promote its 3 children to direct items in the section

**Child title changes (IDs unchanged):**

| id | Before | After |
|---|---|---|
| `sales-reports` | `Sales Reports` | `Sales` |
| `purchasing-reports` | `Purchasing Reports` | `Purchasing` |
| `inventory-reports` | `Inventory Reports` | `Inventory` |

**Resulting structure:**
```
Reports                          (id: analytics)
  ├── Sales                      (id: sales-reports)
  │     └── [sub-items unchanged]
  ├── Purchasing                 (id: purchasing-reports)
  │     └── [sub-items unchanged]
  └── Inventory                  (id: inventory-reports)
        └── [sub-items unchanged]
```

**Reason:** Reduces one level of nesting; "Reports" is implicit from section name. Renaming "Analytics" to "Reports" aligns with user mental model (these are report views, not analytics dashboards).

---

### 3. Test Updates

**File:** `frontend/src/components/common/__tests__/Sidebar.test.tsx`

**`'renders accounting as its own top-level section'`**
- `expect(sectionHeaders).toContain('Analytics')` → `toContain('Reports')`
- `expect(sectionHeaders.indexOf('Accounting')).toBeLessThan(sectionHeaders.indexOf('Analytics'))` → replace `'Analytics'` with `'Reports'` in the `indexOf` call

**`'renders reports as a parent group in analytics section'`**
- Rename test to `'renders sales, purchasing, and inventory directly under reports section'`
- Remove: assertion for `'Reports'` button, click on `'Reports'`, and the `waitFor` expand assertion
- Add: assert `screen.getByRole('button', { name: 'Sales' })`, `screen.getByRole('button', { name: 'Purchasing' })`, and `screen.getByRole('button', { name: 'Inventory' })` are in the document (they are direct collapsed items, no click needed to reveal them)
- The three items (`Sales`, `Purchasing`, `Inventory`) are top-level collapsed buttons in the section — their sub-items are not visible without clicking, but the buttons themselves are always rendered

**`'renders accounting reports as a parent group after accounting'`**
- Change button query: `'Accounting Reports'` → `'Reports'`

---

## Out of Scope

- No routing/path changes
- No new files or components
- No changes to sub-item titles or IDs
- No backend changes
- `id: 'analytics'` is intentionally left unchanged — it is referenced in the collapsed-sidebar divider rendering logic at lines 1171 and 1193 of `Sidebar.tsx` (`['analytics', 'system'].includes(section.id)`). Do not rename this id.

---

## Verification

- [ ] Accounting section shows "Reports" (not "Accounting Reports") as the group label
- [ ] Analytics section is titled "Reports"
- [ ] Sales, Purchasing, Inventory appear directly under Reports (no intermediate wrapper)
- [ ] Sub-items within each group are unchanged
- [ ] All sidebar tests pass
