# Global Search Phase 2 — Permission-Aware Navigation & Search

**Issue:** #144
**Date:** 2026-03-21
**Status:** Approved for implementation

---

## Overview

Phase 1 delivered functional global search across 4 entity types and ~15 static pages. Every authenticated user sees identical results regardless of role — no navigation or record-type filtering exists. Phase 2 fixes this root gap by introducing role-based navigation visibility across both the sidebar and global search, using a shared permission model as the foundation.

**Scope statement:**
Phase 2 introduces role-based navigation visibility across the application. Both the sidebar and global search derive page visibility from a shared permission model, ensuring users only see navigation targets they are authorized to access.

**Out of scope:**
Ranking improvements, recent searches, fuzzy matching, new searchable entities, search analytics, and row-level record filtering. Session invalidation on role change and suspended-user handling are also deferred — search results reflect the role embedded in the current JWT.

---

## Permission Model

### Core principle

- Page visibility mirrors allowed navigation: if a user would not see a page in the sidebar, they do not see it in page search results.
- Record-type search visibility mirrors allowed read/use of that entity type in normal UI/API flows.
- These two rules are related but not identical — Products are searchable by all operational roles even though Inventory management screens are narrower.

### Role definitions

| Role | Identifier |
|---|---|
| Admin | `admin` |
| Manager | `manager` |
| Sales Staff | `sales_staff` |
| Inventory Staff | `inventory_staff` |
| Procurement Staff | `procurement_staff` |

### Role-set constants (used in both frontend and backend configs)

| Constant | Roles |
|---|---|
| `ALL_ROLES` | admin, manager, sales_staff, inventory_staff, procurement_staff |
| `SALES_ROLES` | admin, manager, sales_staff |
| `PROCUREMENT_ROLES` | admin, manager, procurement_staff |
| `INVENTORY_ROLES` | admin, manager, inventory_staff |
| `FINANCE_ROLES` | admin, manager |
| `ADMIN_ONLY` | admin |

### Leaf page visibility (complete)

Every leaf page that appears in the sidebar and/or backend `STATIC_PAGES` must carry an explicit role assignment. The authoritative list:

**Primary**

| Path | Label | Roles |
|---|---|---|
| `/dashboard` | Dashboard | ALL_ROLES |

**Sales**

| Path | Label | Roles |
|---|---|---|
| `/sales` | Sales Overview | SALES_ROLES |
| `/sales/customers` | Customers | SALES_ROLES |
| `/sales/orders` | Sales Orders | SALES_ROLES |
| `/sales/invoices` | Invoices | SALES_ROLES |
| `/sales/payments` | Payments | SALES_ROLES |

**Purchasing**

| Path | Label | Roles |
|---|---|---|
| `/purchasing` | Purchasing Overview | PROCUREMENT_ROLES |
| `/purchasing/suppliers` | Suppliers | PROCUREMENT_ROLES |
| `/purchasing/orders` | Purchase Orders | PROCUREMENT_ROLES |
| `/purchasing/goods-received` | Goods Received | PROCUREMENT_ROLES |
| `/purchasing/vendor-payments` | Vendor Payments | PROCUREMENT_ROLES |

**Inventory**

| Path | Label | Roles |
|---|---|---|
| `/inventory` | Inventory Overview | INVENTORY_ROLES |
| `/inventory/products` | Products | INVENTORY_ROLES |
| `/inventory/categories` | Categories | INVENTORY_ROLES |
| `/inventory/stock-adjustments` | Stock Adjustments | INVENTORY_ROLES |

**Accounting**

| Path | Label | Roles |
|---|---|---|
| `/accounting/dashboard` | Accounting Dashboard | FINANCE_ROLES |
| `/accounting/chart-of-accounts` | Chart of Accounts | FINANCE_ROLES |
| `/accounting/journal-entries` | Journal Entries | FINANCE_ROLES |
| `/accounting/bank-reconciliations` | Bank Reconciliation | FINANCE_ROLES |
| `/accounting/expenses` | Expenses | FINANCE_ROLES |
| `/accounting/fund-transfers` | Fund Transfers | FINANCE_ROLES |
| `/accounting/settlements` | Settlements | FINANCE_ROLES |
| `/accounting/owner-equity` | Owner's Equity | FINANCE_ROLES |
| `/accounting/fiscal-periods` | Fiscal Periods | ADMIN_ONLY |
| `/accounting/account-mappings` | Account Mappings | ADMIN_ONLY |

**Reports — Sales**

| Path | Label | Roles |
|---|---|---|
| `/reports/sales/product-summary` | Product Summary | SALES_ROLES |
| `/reports/sales/product-details` | Product Details | SALES_ROLES |
| `/reports/sales/order-summary` | Order Summary | SALES_ROLES |
| `/reports/sales/order-profit` | Order Profit | SALES_ROLES |
| `/reports/sales/customer-payment-summary` | Payment Summary | SALES_ROLES |
| `/reports/sales/payment-by-order` | Payment by Order | SALES_ROLES |
| `/reports/sales/payment-details` | Payment Details | SALES_ROLES |
| `/reports/sales/order-history` | Order History | SALES_ROLES |
| `/reports/sales/product-customer` | Product Customers | SALES_ROLES |

**Reports — Purchasing**

| Path | Label | Roles |
|---|---|---|
| `/reports/purchasing/order-summary` | Order Summary | PROCUREMENT_ROLES |
| `/reports/purchasing/order-details` | Order Details | PROCUREMENT_ROLES |
| `/reports/purchasing/order-status` | Order Status | PROCUREMENT_ROLES |
| `/reports/purchasing/payment-details` | Payment Details | PROCUREMENT_ROLES |
| `/reports/purchasing/vendor-purchase-list` | Vendor Products | PROCUREMENT_ROLES |

**Reports — Inventory**

| Path | Label | Roles |
|---|---|---|
| `/reports/inventory/summary` | Inventory Summary | INVENTORY_ROLES |
| `/reports/inventory/historical` | Historical Inventory | INVENTORY_ROLES |
| `/reports/inventory/movement-summary` | Movement Summary | INVENTORY_ROLES |
| `/reports/inventory/price-list` | Product Price List | INVENTORY_ROLES |
| `/reports/inventory/product-cost` | Product Cost Report | INVENTORY_ROLES |

**Reports — Accounting**

| Path | Label | Roles |
|---|---|---|
| `/accounting/reports/trial-balance` | Trial Balance | FINANCE_ROLES |
| `/accounting/reports/balance-sheet` | Balance Sheet | FINANCE_ROLES |
| `/accounting/reports/profit-loss` | Profit & Loss | FINANCE_ROLES |
| `/accounting/reports/general-ledger` | General Ledger | FINANCE_ROLES |
| `/accounting/reports/account-activity` | Account Activity | FINANCE_ROLES |

**Administration**

| Path | Label | Roles |
|---|---|---|
| `/settings/company` | Company Settings | ADMIN_ONLY |
| `/settings/price-costing` | Inventory Costing | ADMIN_ONLY |
| `/settings/regional` | Regional | ADMIN_ONLY |
| `/settings/price-lists` | Price Lists | ADMIN_ONLY |
| `/settings/payment-methods` | Payment Methods | ADMIN_ONLY |
| `/settings/print` | Print Settings | ADMIN_ONLY |
| `/settings/document-numbers` | Document Numbers | ADMIN_ONLY |
| `/settings/users` | Users | ADMIN_ONLY |
| `/settings/roles` | Roles & Permissions | ADMIN_ONLY |
| `/settings/security` | Security | ADMIN_ONLY |
| `/settings/backup` | Backup & Restore | ADMIN_ONLY |
| `/audit-logs` | Audit Logs | ADMIN_ONLY |

**Grouping rule for parent sections:** A parent section (Sales, Purchasing, Inventory, Accounting, Reports, Settings) is visible if and only if at least one of its leaf children is visible to the user's role. No parent item has both a `path` and `children` in the current sidebar — parent visibility is entirely child-derived.

### Record-type search visibility

| Entity | Searchable by |
|---|---|
| Customers | SALES_ROLES |
| Products | ALL_ROLES (all 5 roles) |
| Sales Orders | SALES_ROLES |
| Purchase Orders | PROCUREMENT_ROLES |

**Note on Products:** Products are shared master data referenced by sales orders, purchase orders, and inventory operations. Product search is broader than inventory page access — record-type search access does not have to mirror page/module access 1:1 when an entity is shared across workflows.

---

## Architecture

### Approach: Role arrays on existing nav config

Both sidebar and backend search filter from explicit `roles: UserRole[]` arrays defined on each nav item / static page entry. This is a shared permission model expressed through matching static config on frontend and backend. The two constants must stay aligned — there is no runtime sync mechanism. For ~55 static nav items this is low maintenance risk, but the alignment is a manual contract.

**Frontend owns:** UI rendering (sidebar filters items from auth state, no network request).
**Backend owns:** Security enforcement (search endpoint filters pages and entity results server-side).
Both must agree; backend is authoritative for discoverability.

---

## Section 1 — Frontend Changes

### 1a. Extract nav config

Move `menuSections` out of `Sidebar.tsx` into `frontend/src/config/navigation.ts`.

Each leaf `MenuItem` gains a required `roles: UserRole[]` field. Always explicit — use the named role-set constants from the permission model above, never an empty array. Dashboard uses `ALL_ROLES` (all 5 roles explicitly).

Parent/group items do not carry a `roles` field. In the current sidebar, no parent item has both a `path` and `children` — parent visibility is derived entirely from filtered children.

### 1b. Sidebar filtering

`getFilteredMenuSections` and `filterMenuItems` live in `frontend/src/config/navigation.ts` alongside the nav config (not embedded in `Sidebar.tsx`). This keeps the sidebar presentational and makes the filtering logic independently testable.

```ts
export function getFilteredMenuSections(sections: MenuSection[], role: UserRole): MenuSection[] {
  return sections
    .map(section => ({
      ...section,
      items: filterMenuItems(section.items, role),
    }))
    .filter(section => section.items.length > 0);
}

export function filterMenuItems(items: MenuItem[], role: UserRole): MenuItem[] {
  return items
    .map(item => {
      if (item.children?.length) {
        const filtered = filterMenuItems(item.children, role);
        return filtered.length > 0 ? { ...item, children: filtered } : null;
      }
      return item.roles.includes(role) ? item : null;
    })
    .filter((item): item is MenuItem => item !== null);
}
```

`Sidebar.tsx` imports `getFilteredMenuSections` from `navigation.ts` and calls it with the role from auth state.

**Flyout code path:** The collapsed-rail flyout Popper (lines ~706 and ~1304 of `Sidebar.tsx`) reads from `menuSections` directly to locate items and render their children. After extraction, the flyout must read from the same filtered result — not the raw exported constant — so that role-filtered items do not reappear in flyout menus. Pass `filteredSections` (the output of `getFilteredMenuSections`) to the flyout lookup, or ensure the flyout's item lookup searches `filteredSections` rather than the raw `menuSections` constant.

### 1c. SearchModal

No permission-logic changes are needed in `SearchModal`. It continues rendering the backend-filtered results it receives. Page filtering is handled server-side.

---

## Section 2 — Backend Changes

### 2a. Static pages config

`STATIC_PAGES` in `search.service.ts` gains a `roles: UserRole[]` field on each entry, using the leaf page visibility table above as the authoritative source.

Role-set constants are defined once in `search.permissions.ts` and imported into `search.service.ts` — they are not redefined in the service file. `STATIC_PAGES` uses the same exported constants (`ALL_ROLES`, `SALES_ROLES`, etc.) as the `canSearch*` helpers.

`searchPages()` signature becomes `searchPages(query: string, user: JwtUser)`. The existing call site inside `SearchService.search()` (currently `this.searchPages(trimmed)` passed through `safeSearch`) must be updated to `this.searchPages(trimmed, user)`, with `user` threaded through from the top-level `search(query, user)` call.

**Route authority:** The sidebar config (`navigation.ts`) is the frontend authority for route strings. Backend `STATIC_PAGES` routes must match it exactly.

**Route reconciliation:** The existing `STATIC_PAGES` entries in `search.service.ts` contain some routes and labels that differ from the leaf page visibility table above (e.g., `/customers` vs `/sales/customers`, `/inventory/adjustments` vs `/inventory/stock-adjustments`). When adding `roles` fields, simultaneously reconcile each existing entry's route and label against the leaf page visibility table; mismatches must be corrected in the same PR.

**Searchable page set:** Every visible leaf sidebar page is searchable. The full leaf page visibility table above is also the complete `STATIC_PAGES` definition — after route reconciliation, the two sets are identical.

Before running keyword matching, filter to accessible pages only:

```ts
const accessible = STATIC_PAGES.filter(p => p.roles.includes(user.role));
// keyword matching runs on accessible only
```

### 2b. Permission helpers

New file: `backend/src/modules/search/search.permissions.ts`

```ts
export const ALL_ROLES = [...];
export const PRODUCT_SEARCH_ROLES = [
  UserRole.ADMIN, UserRole.MANAGER,
  UserRole.INVENTORY_STAFF, UserRole.SALES_STAFF, UserRole.PROCUREMENT_STAFF,
];

export function canSearchCustomers(role: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF].includes(role);
}

export function canSearchProducts(role: UserRole): boolean {
  return PRODUCT_SEARCH_ROLES.includes(role);  // all 5 roles
}

export function canSearchSalesOrders(role: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF].includes(role);
}

export function canSearchPurchaseOrders(role: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.MANAGER, UserRole.PROCUREMENT_STAFF].includes(role);
}
```

### 2c. Domain service guards

Each domain `searchGlobal(query, user)` method gains an early exit at the top:

```ts
// CustomerService
if (!canSearchCustomers(user.role)) return [];

// ProductService
if (!canSearchProducts(user.role)) return [];

// SalesOrderService
if (!canSearchSalesOrders(user.role)) return [];

// PurchaseOrderService
if (!canSearchPurchaseOrders(user.role)) return [];
```

### 2d. No contract changes

No backend API contract or orchestration changes are introduced. The endpoint signature, response shape, and `SearchService.search()` orchestration are unchanged. Existing row-level filtering (soft-delete) within domain services is unchanged. Domain services only gain an early role-based access check.

---

## Section 3 — Testing

### Frontend unit tests (`filterMenuItems`)

- For each of the 5 roles, assert the exact set of visible top-level sections
- For each role, assert specific leaf routes are present or absent:
  - Admin sees `/audit-logs`; Sales Staff does not
  - Procurement Staff sees `/purchasing`; Sales Staff does not
  - All roles see `/dashboard`
  - Sales Staff sees `/sales/customers`; Inventory Staff does not
- Assert parent sections collapse when all children are filtered out for a given role

### Backend unit tests

- `canSearch*` helpers: all 5 roles × 4 entity types = 20 cases; assert expected boolean
- `searchPages(query, user)`:
  - assert inaccessible pages are excluded from results
  - assert accessible pages matching the query are included

### Integration tests (`GET /search/global`)

One authenticated request per role. Assert both absence and presence:

- **Sales Staff** searching `"cust"` → returns customer results; assert no accounting pages
- **Procurement Staff** searching `"po"` → returns purchase order results; assert no sales results
- **Inventory Staff** searching `"prod"` → returns product results
- **Admin** searching `"audit"` → returns Audit Logs page
- **Products specifically** (regression guard): Sales Staff, Procurement Staff, and Inventory Staff all receive product results when searching a product term — this is the cross-role special case most likely to regress
- **Denied entity cases** (explicit absence): Inventory Staff searching `"cust"` returns no customer records; Sales Staff searching `"purchase"` returns no purchase order records

### What is not expanded

Existing row-level filtering behavior (soft-delete exclusion) is not expanded in this phase and remains covered by Phase 1 tests.

---

## Files Changed

### Frontend
| File | Change |
|---|---|
| `frontend/src/config/navigation.ts` | New file — extracted nav config with `roles` on each leaf item; exports `getFilteredMenuSections` and `filterMenuItems` |
| `frontend/src/components/common/Sidebar.tsx` | Import `getFilteredMenuSections` from `navigation.ts`; replace no-op filter call; update flyout Popper lookup (lines ~706 and ~1304) to use filtered sections |

### Backend
| File | Change |
|---|---|
| `backend/src/modules/search/search.permissions.ts` | New file — role-set constants + `canSearch*` helpers |
| `backend/src/modules/search/search.service.ts` | Add `roles` to `STATIC_PAGES`; update `searchPages` to accept `user` and filter by role; update `safeSearch` call site to pass `user` |
| `backend/src/modules/sales/services/customer.service.ts` | Add role guard at top of `searchGlobal` |
| `backend/src/modules/inventory/services/product.service.ts` | Add role guard at top of `searchGlobal` |
| `backend/src/modules/sales/services/sales-order.service.ts` | Add role guard at top of `searchGlobal` |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | Add role guard at top of `searchGlobal` |

### Tests
| File | Change |
|---|---|
| `frontend/src/config/navigation.test.ts` | New — `filterMenuItems` role-matrix tests |
| `backend/src/modules/search/search.permissions.spec.ts` | New — `canSearch*` helper tests |
| `backend/src/modules/search/search.service.spec.ts` | Update — `searchPages` role filtering tests |
| `backend/test/search.e2e-spec.ts` | New or update — integration tests per role |
