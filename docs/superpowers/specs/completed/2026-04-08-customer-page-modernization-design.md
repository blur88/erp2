# Customer Page Modernization Design

**Date:** 2026-04-08  
**Issue:** #310  
**Files affected:**
- `frontend/src/pages/sales/components/CustomerContextHeader.tsx`
- `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

---

## Problem

The Customer page deviates from the modernized UI patterns established in the Sales Orders and Purchase Orders pages:

1. `CustomerContextHeader` uses a single-column table; `OrderContextHeader` uses a 2-column grid.
2. `CustomerWorkspaceCard` has `overflow: 'auto'` on the outer Paper, causing tabs to scroll out of view.
3. The workspace card duplicates contact info and shows large `SalesStatsCards` that push the action tables below the fold.

---

## Design

### 1. CustomerContextHeader — 2-column grid layout

Match `OrderContextHeader` exactly: same `Paper` wrapper, same title bar (Edit + Delete icon buttons), same `GridLegacy` 2-column layout, same `detailTableSx` / `labelCellSx` / `valueCellSx` style constants.

**Left column — "Customer Information"**

| Label | Value |
|---|---|
| Type | "Business" or "Individual" (plain text) |
| Status | "Active" (`success.main`) or "Inactive" (`text.disabled`) — plain colored text, no chips |
| Phone | text or `—` |
| Email | text or `—` |
| Price List | text or `—` |

**Right column — "Account Summary"**

| Label | Value |
|---|---|
| Total Orders | number |
| Total Sales | `formatCurrency(...)` |
| Avg Order Value | `formatCurrency(...)` |
| First Purchase | `formatDate(...)` or `—` |
| Last Purchase | `formatDate(...)` or `—` |

All data comes directly from the `Customer` object — no extra API calls. Alternating `grey.50` row backgrounds match order header style. No chips anywhere.

### 2. CustomerWorkspaceCard — scroll fix + simplification

**Scroll fix:** Match `OrderWorkspaceCard` flex pattern:
- Outer `Paper`: `flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'`
- Tabs bar: fixed at top
- `TabPanel`: `flex: 1, overflow: 'auto', display: value === index ? 'flex' : 'none', flexDirection: 'column'`

**Removed:**
- Status/Type chips at top
- Phone/address block
- `SalesStatsCards` (all 4 stat cards)
- Overview tab and all its content
- Statistics API call (`/customers/:id/statistics`) and all related state (`statistics`, `loading`, `error`, `setLoading`)
- `SalesStatsCards` and `StatItem` imports
- `LocationOn`, `Phone`, `Star`, `TrendingUp` icon imports

**Kept:**
- Orders tab (tab index `0`) — lazy-loaded, table unchanged
- Invoices tab (tab index `1`) — lazy-loaded, total outstanding summary + table unchanged

**Tab index shift:** Overview was `0`, Orders was `1`, Invoices was `2`. After removal: Orders is `0`, Invoices is `1`. Update `useEffect` conditions and `ordersLoaded`/`invoicesLoaded` guards accordingly.

### 3. No new API calls

`averageOrderValue`, `totalOrders`, `totalSales`, `firstPurchaseDate`, `lastPurchaseDate` are all present on the `Customer` type and returned by the existing customers list/detail endpoints. The statistics endpoint is fully removed from the workspace card.

---

## Testing

- Verify tabs stay pinned when Orders or Invoices list is long enough to scroll.
- Verify header renders correct values for Type, Status, Price List (null case shows `—`).
- Verify First/Last Purchase show `—` when not set.
- No existing tests cover these components directly — no test changes required.
