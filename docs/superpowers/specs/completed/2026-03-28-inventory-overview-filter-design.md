# Inventory Overview Filter — Design Spec

**Date:** 2026-03-28
**Branch:** feat/inventory-overview-filter
**Issue:** #195

## Objective

Align the Inventory Overview page with Sales and Purchasing Overview pages by adding the standard `DashboardFilterBar` (Period, Comparison, Custom Range) and a new time-aware backend endpoint.

## Decisions Made

| Question | Decision | Rationale |
|---|---|---|
| Inventory Value with filter | Always show current snapshot | It's a balance-sheet number; rename context makes it clear |
| Recent Movements table | Filter to selected period | Consistent with Purchasing pattern; show empty state if none |
| Second panel (alongside movements) | Low Stock Alerts (snapshot) | Most actionable for inventory managers |
| Trend chart | Stock movements in/out over time | Two datasets, reuses movement data, no historical reconstruction |
| Implementation approach | Option 1: add to existing `InventoryAnalyticsController` | Clean separation, correct home, follows Purchasing pattern exactly |

---

## Backend

### New file: `backend/src/modules/inventory/dto/inventory-analytics.dto.ts`

Re-exports `DateRange` and `GroupByPeriod` from `@/common/dto/analytics.dto`.

**Query DTO:**
```ts
class InventoryAnalyticsQueryDto {
  dateRange?: DateRange
  startDate?: Date
  endDate?: Date
  compareWith?: 'previous_period' | 'last_month' | 'last_year'
  groupBy?: GroupByPeriod
}
```

**Response DTOs:**
```ts
class InventoryMetricsDto {
  totalProducts: number       // snapshot
  totalCategories: number     // snapshot
  inventoryValue: number      // snapshot (cost × qty today)
  lowStockCount: number       // snapshot (stockQuantity <= 10)
  outOfStockCount: number     // snapshot (stockQuantity <= 0)
  stockMovementsIn: number    // period-filtered sum of positive qty movements
  stockMovementsOut: number   // period-filtered sum of abs(negative qty) movements
}

class InventoryPeriodDataDto {
  period: string              // e.g. "2026-03-01"
  movementsIn: number
  movementsOut: number
}

class InventoryPeriodBlockDto {
  metrics: InventoryMetricsDto
  periodData: InventoryPeriodDataDto[]
  periodStart: string
  periodEnd: string
}

class LowStockAlertDto {
  productId: string
  productName: string
  categoryName: string
  stockQuantity: number
  status: 'low_stock' | 'out_of_stock'
}

class RecentMovementDto {
  movementDate: string
  productName: string
  movementType: string
  quantity: number
  referenceNumber: string
}

class InventoryAnalyticsResponseDto {
  current: InventoryPeriodBlockDto
  comparison?: InventoryPeriodBlockDto
  lowStockAlerts: LowStockAlertDto[]    // top 10, snapshot
  recentMovements: RecentMovementDto[]  // top 5 within period
}
```

### `InventoryAnalyticsService.getInventoryDashboardAnalytics(query)`

Steps:
1. **Resolve date range** — handle `dateRange` enum vs explicit `startDate`/`endDate`; default to this month. Same logic as `PurchasingAnalyticsService`.
2. **Snapshot metrics** — query `Product` (active, not deleted) for counts and value. Low-stock threshold hardcoded at `10` (matches existing `getDashboardStats`).
3. **Period movements** — query `StockMovement WHERE movementDate BETWEEN periodStart AND periodEnd`. Sum positive qty → `stockMovementsIn`, sum abs(negative qty) → `stockMovementsOut`.
4. **Period data (trend)** — `DATE_TRUNC(groupBy, movementDate)` GROUP BY, return `{ period, movementsIn, movementsOut }[]`.
5. **Comparison block** — if `compareWith` set, resolve comparison range and repeat steps 3–4. Snapshot metrics are identical in both blocks.
6. **Low stock alerts** — `Product WHERE stockQuantity <= 10 AND deletedAt IS NULL ORDER BY stockQuantity ASC LIMIT 10`. Map: `stockQuantity <= 0` → `out_of_stock`, else → `low_stock`.
7. **Recent movements** — `StockMovement WHERE movementDate BETWEEN periodStart AND periodEnd ORDER BY movementDate DESC LIMIT 5`, join `Product`. Resolve `referenceNumber` via `COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, '-')` — same join pattern as `getProductCost`.

### `InventoryAnalyticsController`

Add one endpoint at the top (before existing report endpoints — NestJS route order matters):

```ts
@Get('dashboard')
async getDashboardAnalytics(
  @Query() query: InventoryAnalyticsQueryDto,
): Promise<InventoryAnalyticsResponseDto>
```

No changes to existing endpoints.

---

## Frontend

### New file: `frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts`

Mirrors `usePurchasingAnalytics.ts` exactly — abort-controller pattern, same state shape. Calls `GET /inventory/analytics/dashboard`.

Types defined inline:
```ts
InventoryMetrics
InventoryPeriodDataPoint { period, movementsIn, movementsOut }
InventoryPeriodBlock { metrics, periodData, periodStart, periodEnd }
LowStockAlert { productId, productName, categoryName, stockQuantity, status }
RecentMovement { movementDate, productName, movementType, quantity, referenceNumber }
InventoryAnalyticsData { current, comparison?, lowStockAlerts, recentMovements }
InventoryAnalyticsParams { dateRange?, startDate?, endDate?, groupBy?, compareWith? }
```

### `InventoryPage.tsx` changes

**Remove:**
- `useGetDashboardStatsQuery`, `useGetStockMovementsQuery`, `useGetOutOfStockProductsQuery` imports and calls

**Add:**
- `useDashboardFilters('inventory')` for filter state
- `useInventoryAnalytics(resolvedApiParams)` for data
- `DashboardFilterBar` between `PageHeader` and stats cards (same props wiring as `PurchasingPage`)

**Stats cards (4 cards):**
| Card | Value | Delta |
|---|---|---|
| Total Products | snapshot | none |
| Inventory Value | snapshot | none (label: "current") |
| Stock In | period-filtered | comparison delta if set |
| Stock Out | period-filtered | comparison delta if set |

**Trend chart:** Replace existing Bar (category breakdown) with a Line chart — two datasets: `movementsIn` and `movementsOut` over `periodData`. The Doughnut (stock health) chart stays unchanged, sourced from snapshot metrics.

**Recent Movements table:** Sourced from `data.recentMovements` (period-filtered top 5). Same columns as today. Empty state: "No movements in this period."

**Low Stock Alerts panel:** Replace "Out of Stock Items" with combined list from `data.lowStockAlerts`. Chip per item: `out_of_stock` → error color, `low_stock` → warning color.

---

## Data Flow

```
useDashboardFilters('inventory')
  → resolvedApiParams
  → useInventoryAnalytics(resolvedApiParams)
    → GET /inventory/analytics/dashboard
    → InventoryAnalyticsController#getDashboardAnalytics
    → InventoryAnalyticsService#getInventoryDashboardAnalytics
    → { current, comparison?, lowStockAlerts, recentMovements }
  → InventoryPage renders
```

---

## Edge Cases

- **No movements in period:** `periodData = []`, trend chart shows empty state. Recent movements shows "No movements in this period."
- **Comparison period:** Snapshot metrics identical in both blocks. Delta chips only on Stock In / Stock Out cards.
- **"Today" period:** Single bucket, `groupBy: 'day'`. Comparison disabled by `DashboardFilterBar` (already handled).
- **Custom range:** `groupBy` auto-selected by `useDashboardFilters` (≤31d → day, ≤90d → week, else month).
- **Low stock threshold:** Hardcoded at `10` — no per-product threshold field on `Product` entity.

## No DB Migration Required

All data sourced from existing `stock_movements` and `products` tables.

## Files Changed

| File | Change |
|---|---|
| `backend/src/modules/inventory/dto/inventory-analytics.dto.ts` | **New** |
| `backend/src/modules/inventory/services/inventory-analytics.service.ts` | Add `getInventoryDashboardAnalytics` method |
| `backend/src/modules/inventory/controllers/inventory-analytics.controller.ts` | Add `GET dashboard` endpoint |
| `frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts` | **New** |
| `frontend/src/pages/inventory/InventoryPage.tsx` | Refactor to use new hook + filter bar |
