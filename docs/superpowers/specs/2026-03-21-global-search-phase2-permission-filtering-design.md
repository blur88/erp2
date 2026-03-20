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
Ranking improvements, recent searches, fuzzy matching, new searchable entities, search analytics, and row-level record filtering. These are deferred to subsequent phases.

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

### Page / navigation visibility

| Page / Section | Roles with access |
|---|---|
| Dashboard | All 5 roles |
| Sales (orders, list) | Admin, Manager, Sales Staff |
| Customers | Admin, Manager, Sales Staff |
| Purchasing (orders, list) | Admin, Manager, Procurement Staff |
| Suppliers | Admin, Manager, Procurement Staff |
| Inventory (stock, adjustments) | Admin, Manager, Inventory Staff |
| Products | Admin, Manager, Inventory Staff |
| Accounting, Journal Entries | Admin, Manager |
| Reports — Sales | Admin, Manager, Sales Staff |
| Reports — Purchasing | Admin, Manager, Procurement Staff |
| Reports — Inventory | Admin, Manager, Inventory Staff |
| Reports — Accounting | Admin, Manager |
| Settings | Admin |
| Audit Logs | Admin |
| Users / Access | Admin |

Parent sections are visible if and only if at least one child item is visible to the user's role.

### Record-type search visibility

| Entity | Searchable by |
|---|---|
| Customers | Admin, Manager, Sales Staff |
| Products | Admin, Manager, Inventory Staff, Sales Staff, Procurement Staff |
| Sales Orders | Admin, Manager, Sales Staff |
| Purchase Orders | Admin, Manager, Procurement Staff |

**Note on Products:** Products are shared master data referenced by sales orders, purchase orders, and inventory operations. Product search is therefore broader than inventory page access. This is intentional — record-type search access does not have to mirror page/module access 1:1 when an entity is shared across workflows.

---

## Architecture

### Approach: Role arrays on existing nav config

Both sidebar and backend search filter from explicit `roles: UserRole[]` arrays defined on each nav item / static page entry. This is a shared permission model expressed through matching static config on frontend and backend. The two constants must stay aligned — there is no runtime sync mechanism. For ~15 static nav items this maintenance burden is acceptable.

**Frontend owns:** UI rendering (sidebar filters items from auth state, no network request).
**Backend owns:** Security enforcement (search endpoint filters pages and entity results server-side).
Both must agree; backend is authoritative for discoverability.

---

## Section 1 — Frontend Changes

### 1a. Extract nav config

Move `menuSections` out of `Sidebar.tsx` into `frontend/src/config/navigation.ts`.

Each leaf `MenuItem` gains a required `roles: UserRole[]` field. Always explicit — never empty or omitted. Dashboard uses all 5 roles listed explicitly.

Parent/group items do not carry their own `roles` field; their visibility is derived entirely from their children.

If a parent item is also a directly clickable route (not just a group), it must carry its own `roles` field in addition to having children — its route-level visibility is independent of child filtering.

### 1b. Sidebar filtering

Replace the current no-op `getFilteredMenuSections()` in `Sidebar.tsx` with:

```ts
function getFilteredMenuSections(sections: MenuSection[], role: UserRole): MenuSection[] {
  return sections
    .map(section => ({
      ...section,
      items: filterMenuItems(section.items, role),
    }))
    .filter(section => section.items.length > 0);
}

function filterMenuItems(items: MenuItem[], role: UserRole): MenuItem[] {
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

The sidebar calls `getFilteredMenuSections(menuSections, user.role)` using role from auth state.

### 1c. SearchModal

No permission-logic changes are needed in `SearchModal`. It continues rendering the backend-filtered results it receives. Page filtering is handled server-side.

---

## Section 2 — Backend Changes

### 2a. Static pages config

`STATIC_PAGES` in `search.service.ts` gains a `roles: UserRole[]` field on each entry, using the page visibility table above.

Define reusable role-set constants at the top of the file:

```ts
const ALL_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF, UserRole.INVENTORY_STAFF, UserRole.PROCUREMENT_STAFF];
const SALES_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF];
const PROCUREMENT_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.PROCUREMENT_STAFF];
const INVENTORY_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.INVENTORY_STAFF];
const FINANCE_ROLES = [UserRole.ADMIN, UserRole.MANAGER];
const ADMIN_ONLY = [UserRole.ADMIN];
```

`searchPages()` signature becomes `searchPages(query: string, user: JwtUser)`. Before running keyword matching, filter to accessible pages only:

```ts
const accessible = STATIC_PAGES.filter(p => p.roles.includes(user.role));
// keyword matching runs on accessible only
```

### 2b. Permission helpers

New file: `backend/src/modules/search/search.permissions.ts`

```ts
export const PRODUCT_SEARCH_ROLES = [
  UserRole.ADMIN, UserRole.MANAGER,
  UserRole.INVENTORY_STAFF, UserRole.SALES_STAFF, UserRole.PROCUREMENT_STAFF,
];

export function canSearchCustomers(role: UserRole): boolean {
  return [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF].includes(role);
}

export function canSearchProducts(role: UserRole): boolean {
  return PRODUCT_SEARCH_ROLES.includes(role);
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
- For each role, assert specific leaf routes are present or absent (not only top-level):
  - Admin sees Audit Logs; Sales Staff does not
  - Procurement Staff sees Purchasing; Sales Staff does not
  - All roles see Dashboard
- Assert parent sections collapse when all children are filtered out for a given role

### Backend unit tests

- `canSearch*` helpers: all 5 roles × 4 entity types = 20 cases; assert expected boolean
- `searchPages(query, user)`:
  - assert inaccessible pages are excluded from results
  - assert accessible pages matching the query are included

### Integration tests (`GET /search/global`)

One authenticated request per role. Assert:

- **Absence:** forbidden entity types return no results; inaccessible pages are absent
- **Presence:** expected results are returned (e.g., Sales Staff searching `"cust"` returns customer results; Procurement Staff searching `"po"` returns purchase order results; Admin searching `"audit"` returns Audit Logs page)
- **Products specifically:** Sales Staff, Procurement Staff, and Inventory Staff all receive product results (this is the special case most likely to regress)

### What is not expanded

Existing row-level filtering behavior (soft-delete exclusion) is not expanded in this phase and remains covered by Phase 1 tests.

---

## Files Changed

### Frontend
| File | Change |
|---|---|
| `frontend/src/config/navigation.ts` | New file — extracted nav config with `roles` on each leaf item |
| `frontend/src/components/common/Sidebar.tsx` | Import from navigation.ts; replace no-op filter with `getFilteredMenuSections` |

### Backend
| File | Change |
|---|---|
| `backend/src/modules/search/search.permissions.ts` | New file — `canSearch*` helpers |
| `backend/src/modules/search/search.service.ts` | Add `roles` to `STATIC_PAGES`; update `searchPages` to accept and filter by `user` |
| `backend/src/modules/sales/services/customer.service.ts` | Add role guard at top of `searchGlobal` |
| `backend/src/modules/inventory/services/product.service.ts` | Add role guard at top of `searchGlobal` |
| `backend/src/modules/sales/services/sales-order.service.ts` | Add role guard at top of `searchGlobal` |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | Add role guard at top of `searchGlobal` |

### Tests
| File | Change |
|---|---|
| `frontend/src/config/navigation.test.ts` | New — filterMenuItems role-matrix tests |
| `backend/src/modules/search/search.permissions.spec.ts` | New — canSearch* helper tests |
| `backend/src/modules/search/search.service.spec.ts` | Update — searchPages role filtering tests |
| `backend/test/search.e2e-spec.ts` | New or update — integration tests per role |
