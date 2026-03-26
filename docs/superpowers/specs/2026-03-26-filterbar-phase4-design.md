# FilterBar Phase 4 — Rollout & Polish Design Spec

**Issue:** #188
**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Phase 4 extends the shared FilterBar system to the 5 remaining list pages and addresses polish items identified in post-merge review. The approach is shared component polish first, then sequential page-by-page migration.

**Sequence:**
1. Shared component polish + `ListSkeleton`
2. Customers
3. Suppliers
4. Payments (includes backend fix)
5. Stock Adjustments
6. User Management

---

## Section 1: Shared Component Polish

Three targeted changes to existing FilterBar components. All pages inherit immediately.

### Reset Button

**File:** `frontend/src/components/filters/FilterBar.tsx`

Change the Reset button from plain text to outlined:

```tsx
<Button
  size="small"
  variant="outlined"
  color="inherit"
  sx={{ ml: 1 }}
  onClick={handlers.onClearAll}
>
  Reset
</Button>
```

- `variant="outlined"` — secondary action hierarchy, not destructive
- `color="inherit"` — neutral, does not compete with primary actions
- `sx={{ ml: 1 }}` — consistent spacing from "More Filters" button
- Visibility gate (`hasActiveFilters`) is unchanged

### Chip Row Spacing

**File:** `frontend/src/components/filters/ActiveFilterChips.tsx`

Change `sx={{ pt: 1 }}` to `sx={{ mt: '7px' }}` on the chip container Stack. The existing `flexWrap="wrap"` and `useFlexGap` props already handle multi-chip wrapping correctly — no additional changes needed.

### More Filters Badge

Already implemented as `<Badge badgeContent={activeCount}>` in `MoreFiltersButton.tsx`. No changes required.

---

## Section 2: Loading Pattern Standardization

### New Component: `ListSkeleton`

**File:** `frontend/src/components/common/ListSkeleton.tsx`

A shared skeleton component that renders inside a `TableContainer`/`Table` shell, preserving header row height and approximate row height so layout dimensions don't shift when real data arrives.

**Props:**
- `rows` (default: 8) — number of skeleton rows
- `columns` (default: 4) — number of skeleton cells per row

Uses `<Skeleton variant="rectangular">` for cells to match table rhythm.

### Loading Rules

Applied to all 5 rollout pages:

| State | Condition | Behavior |
|-------|-----------|----------|
| Initial / filter change | `isLoading \|\| (isFetching && !data)` | Render `<ListSkeleton>` replacing the table |
| Background refetch | `isFetching && data` | Keep existing table visible; apply `opacity: 0.6` + small inline `<CircularProgress size={16}>` in the table toolbar area |

**Do not use:**
- Full-screen centered spinners for list layouts
- Blank state before data arrives
- Per-page ad hoc loading logic

### Scope

Applied to the 5 rollout pages in this issue. Existing pages (Products, Orders, Purchase Orders) receive the same treatment in a follow-up cleanup — out of scope for issue #188.

**Split-panel pages:** `ListSkeleton` targets the list panel only. Detail panels keep existing empty/skeleton state.

---

## Section 3: Page Rollout Configs

All pages use the shared `FilterBar` + `useFilterBar` system with URL persistence. Pages with no advanced filters omit the drawer (`config.advanced.length === 0` → no "More Filters" button rendered).

### isActive Null Semantics

For all status toggle filters: `null` = no filter, `true` = Active only, `false` = Inactive only. The `onClearField` handler resets to `null` (the configured default), enforced by the existing system.

### Date Range paramKey

All date range fields use an explicit `paramKey` to avoid fallback to generic field names.

---

### Customers

**Endpoint:** `GET /sales/customers` (`QueryCustomersDto`)

| Layer | Field | Type | Backend param |
|-------|-------|------|---------------|
| Search | — | search | `search` |
| Quick | Status | select | `isActive: true\|false\|null` |
| Advanced | Type | select | `type: CustomerType` |

- Search placeholder: "Search by name or phone..."
- Status options: Active → `isActive: true`, Inactive → `isActive: false`
- Type options: Individual (`individual`), Business (`business`)
- URL param keys: `status`, `type`

---

### Suppliers

**Endpoint:** `GET /purchasing/suppliers` (`SupplierQueryDto`)

| Layer | Field | Type | Backend param |
|-------|-------|------|---------------|
| Search | — | search | `search` |
| Quick | Status | select | `isActive: true\|false\|null` |
| Advanced | Type | select | `type: SupplierType` |

- Search placeholder: "Search by company name..."
- Status options: Active → `isActive: true`, Inactive → `isActive: false`
- Type options: Local (`local`), International (`international`)
- URL param keys: `status`, `type`
- Mirror of Customers config

---

### Payments

**Endpoint:** `GET /sales/payments` (`QueryPaymentsDto`)

| Layer | Field | Type | Backend param |
|-------|-------|------|---------------|
| Search | — | search | `search` |
| Quick | Date Range | date-range | `fromDate`/`toDate`, `paramKey: 'paymentDate'` |
| Advanced | Customer | select (async) | `customerId` |

- Search placeholder: "Search by payment number or customer..."
- URL param keys: `paymentDate_from`, `paymentDate_to`, `customerId`
- Customer selector options loaded from `useGetCustomersQuery`
- Customer chip label: customer name (resolved via `chipFormatter`), never the UUID

#### Context Preset (from Customer Profile)

When navigated from a customer profile page (via router state):

- `customerId` is preset in filter state on mount
- Chip rendered as **locked**: `variant="filled"`, no `onDelete` prop (no × button)
- Filter is still reflected in URL (shareable, reload-safe)
- Clearing the preset requires navigating away (back to customer profile or general Payments page)
- Locked chip is visually distinct from removable chips

#### Backend Fix Required

`payment.service.ts` `findAll` currently ignores the `search` DTO param. Add:

```typescript
if (query.search) {
  queryBuilder.andWhere(
    '(payment.paymentNumber ILIKE :search OR customer.name ILIKE :search)',
    { search: `%${query.search}%` }
  );
}
```

The `customer` join already exists in `findAll`'s query builder. This unblocks search on the Payments FilterBar without schema changes.

---

### Stock Adjustments

**Endpoint:** `GET /inventory/stock-adjustments` (`QueryStockAdjustmentsDto`)

| Layer | Field | Type | Backend param |
|-------|-------|------|---------------|
| Search | — | search | `search` |
| Quick | Status | select | `status: StockAdjustmentStatus` |
| Advanced | Date Range | date-range | `fromDate`/`toDate`, `paramKey: 'adjustmentDate'` |

- Search placeholder: "Search by adjustment number or notes..."
- Status options: Draft (`draft`), Completed (`completed`)
- URL param keys: `status`, `adjustmentDate_from`, `adjustmentDate_to`

---

### User Management

**Endpoint:** `GET /users` (`QueryUsersDto`)

| Layer | Field | Type | Backend param |
|-------|-------|------|---------------|
| Search | — | search | `search` |
| Quick | Role | select | `role: UserRole` |
| Quick | Status | select | `status: UserStatus` |
| Advanced | — | — | none |

- Search placeholder: "Search by name, email, or username..."
- Role options: Admin, Manager, Staff, Viewer (from `UserRole` enum)
- Status options: Active, Inactive, Suspended (from `UserStatus` enum)
- No advanced filters → "More Filters" button not rendered
- URL param keys: `role`, `status`
- No context presets

---

## Section 4: Edge Cases & Constraints

### Payments Locked Chip

When `customerId` is context-preset:
- No `onDelete` prop on the chip → no × button rendered
- `variant="filled"` visually distinguishes it from removable chips
- URL still reflects the filter value
- The filter cannot be cleared inline — navigating away is the intended exit

### Customer Selector Display

The `customerId` advanced filter chip must display the customer **name**, not the UUID. Use `chipFormatter` in the filter config to resolve the label from the loaded customer list.

### URL Robustness

Invalid URL values (deleted customer IDs, unrecognised enum values) fall back silently to the default (null/unset). No error state shown for stale URL params.

### No New Backend Fields

No DTOs are changed in this issue except the one-line search fix in `payment.service.ts`. All other filter fields are already declared in their respective query DTOs.

---

## Out of Scope for Issue #188

- Loading pattern retrofit to existing pages (Products, Orders, Purchase Orders) — follow-up
- Saved filters, default filters per role — architectural goals noted in issue, deferred
- Analytics/reporting filter reuse — deferred
- URL robustness edge cases (partial date ranges, manual URL edits) — monitored, not built
