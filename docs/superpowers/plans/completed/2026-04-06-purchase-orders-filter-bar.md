# Purchase Orders Filter Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `period`, `paymentStatus`, and `status` (GRN status) filters to the Purchase Orders FilterBar, matching the Sales Orders page layout.

**Architecture:** Backend: extend `PurchaseOrderQueryDto` with two new optional fields, then add switch-case filter clauses inside the existing `findAll` query builder (which already left-joins GRNs). Frontend: extend the `PurchaseOrderFilters` interface, `filterConfig`, and `queryParams` mapping in `PurchaseOrdersPage.tsx`, copying the period/dateRange pattern from `OrdersPage.tsx`.

**Tech Stack:** NestJS 11, TypeORM, class-validator, React 19, RTK Query, Material-UI v7, Jest (backend), Vitest (frontend)

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/modules/purchasing/dto/purchase-order.dto.ts` | Add `status` and `paymentStatus` to `PurchaseOrderQueryDto` |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | Add filter clauses in `findAll` |
| `backend/src/modules/purchasing/services/purchase-order.service.spec.ts` | Add tests for new filters |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Update interface, filterConfig, queryParams |

---

### Task 1: Backend — extend `PurchaseOrderQueryDto`

**Files:**
- Modify: `backend/src/modules/purchasing/dto/purchase-order.dto.ts:99-144`

- [ ] **Step 1: Add `status` and `paymentStatus` fields to `PurchaseOrderQueryDto`**

Open `backend/src/modules/purchasing/dto/purchase-order.dto.ts`. Replace the `PurchaseOrderQueryDto` class (lines 99–144) with:

```ts
export class PurchaseOrderQueryDto {
  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search term (order number, supplier name)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter from order date' })
  @IsOptional()
  @IsDateString()
  orderDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to order date' })
  @IsOptional()
  @IsDateString()
  orderDateTo?: string;

  @ApiPropertyOptional({ description: 'Filter by GRN status', enum: ['draft', 'received'] })
  @IsOptional()
  @IsEnum(['draft', 'received'])
  status?: 'draft' | 'received';

  @ApiPropertyOptional({ description: 'Filter by payment status', enum: ['unpaid', 'partial', 'paid', 'overpaid'] })
  @IsOptional()
  @IsEnum(['unpaid', 'partial', 'paid', 'overpaid'])
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';

  @ApiPropertyOptional({ description: 'Sort by field', default: 'orderDate' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'orderDate';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
```

- [ ] **Step 2: Commit**

```bash
cd backend
git add src/modules/purchasing/dto/purchase-order.dto.ts
git commit -m "feat(purchasing): add status and paymentStatus to PurchaseOrderQueryDto"
```

---

### Task 2: Backend — add filter clauses in `findAll`

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts:257-343`
- Test: `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Open `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`. Find the existing `findAll` describe block (or add one). Add the following tests:

```ts
describe('findAll - paymentStatus filter', () => {
  it('filters unpaid orders (paidAmount = 0)', async () => {
    const result = await service.findAll({ paymentStatus: 'unpaid' });
    result.orders.forEach(o => {
      expect(Number(o.paidAmount)).toBe(0);
    });
  });

  it('filters partial orders (paidAmount > 0 and < totalAmount)', async () => {
    const result = await service.findAll({ paymentStatus: 'partial' });
    result.orders.forEach(o => {
      expect(Number(o.paidAmount)).toBeGreaterThan(0);
      expect(Number(o.paidAmount)).toBeLessThan(Number(o.totalAmount));
    });
  });

  it('filters paid orders (paidAmount >= totalAmount)', async () => {
    const result = await service.findAll({ paymentStatus: 'paid' });
    result.orders.forEach(o => {
      expect(Number(o.paidAmount)).toBeGreaterThanOrEqual(Number(o.totalAmount));
    });
  });

  it('filters overpaid orders (paidAmount > totalAmount)', async () => {
    const result = await service.findAll({ paymentStatus: 'overpaid' });
    result.orders.forEach(o => {
      expect(Number(o.paidAmount)).toBeGreaterThan(Number(o.totalAmount));
    });
  });
});

describe('findAll - status filter', () => {
  it('filters orders with draft GRN', async () => {
    const result = await service.findAll({ status: 'draft' });
    result.orders.forEach(o => {
      const grn = (o as any).goodsReceivedNotes?.[0];
      expect(grn?.status).toBe('draft');
    });
  });

  it('filters orders with received GRN', async () => {
    const result = await service.findAll({ status: 'received' });
    result.orders.forEach(o => {
      const grn = (o as any).goodsReceivedNotes?.[0];
      expect(grn?.status).toBe('received');
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage
```

Expected: tests fail because the filters aren't implemented yet.

- [ ] **Step 3: Add filter clauses in `findAll`**

In `backend/src/modules/purchasing/services/purchase-order.service.ts`, update the destructuring at the top of `findAll` (around line 260) and add the filter clauses after the date filters (around line 303).

Replace the destructuring:
```ts
const {
  page,
  limit,
  search,
  supplierId,
  orderDateFrom,
  orderDateTo,
  sortBy = 'orderDate',
  sortOrder = 'DESC',
} = query;
```

With:
```ts
const {
  page,
  limit,
  search,
  supplierId,
  orderDateFrom,
  orderDateTo,
  status,
  paymentStatus,
  sortBy = 'orderDate',
  sortOrder = 'DESC',
} = query;
```

Then after the existing date filter block (after the `orderDateTo` `andWhere` call, before `// Apply sorting`), add:

```ts
    if (paymentStatus) {
      switch (paymentStatus) {
        case 'unpaid':
          queryBuilder.andWhere('(po.paidAmount = 0 OR po.paidAmount IS NULL)');
          break;
        case 'partial':
          queryBuilder.andWhere(
            'po.paidAmount > 0 AND po.paidAmount < po.totalAmount',
          );
          break;
        case 'paid':
          queryBuilder.andWhere(
            'po.paidAmount >= po.totalAmount AND po.paidAmount > 0',
          );
          break;
        case 'overpaid':
          queryBuilder.andWhere('po.paidAmount > po.totalAmount');
          break;
      }
    }

    if (status) {
      queryBuilder.andWhere('grns.status = :grnStatus', { grnStatus: status });
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend
npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/modules/purchasing/services/purchase-order.service.ts \
        src/modules/purchasing/services/purchase-order.service.spec.ts
git commit -m "feat(purchasing): add paymentStatus and status filters to findAll"
```

---

### Task 3: Frontend — update `PurchaseOrdersPage`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

- [ ] **Step 1: Add imports**

At the top of `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`, add these imports (alongside existing imports):

```ts
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
```

Remove the existing `import type { FilterBarConfig } from '@/types/filterBar.types'` line (it's already there — just extend it to include `PeriodValue`).

- [ ] **Step 2: Update `PurchaseOrderFilters` interface**

Replace:
```ts
interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
}
```

With:
```ts
interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  period: PeriodValue
  status: 'draft' | 'received' | null
}
```

- [ ] **Step 3: Update `filterConfig`**

Replace:
```ts
  const filterConfig = useMemo<FilterBarConfig<PurchaseOrderFilters>>(
    () => ({
      search: { placeholder: 'Search purchase orders...' },
      fields: [
        {
          field: 'supplierId',
          label: 'Supplier',
          type: 'supplier',
        },
      ],
      defaults: {
        search: '',
        supplierId: null,
      },
    }),
    [],
  )
```

With:
```ts
  const filterConfig = useMemo<FilterBarConfig<PurchaseOrderFilters>>(
    () => ({
      search: { placeholder: 'Search purchase orders...' },
      fields: [
        {
          field: 'period',
          label: 'Period',
          type: 'period',
        },
        {
          field: 'supplierId',
          label: 'Supplier',
          type: 'supplier',
        },
        {
          field: 'paymentStatus',
          label: 'Payment',
          type: 'payment-status',
        },
        {
          field: 'status',
          label: 'Order Status',
          type: 'purchasing-status',
        },
      ],
      defaults: {
        search: '',
        supplierId: null,
        paymentStatus: null,
        period: { key: null, from: null, to: null },
        status: null,
      },
    }),
    [],
  )
```

- [ ] **Step 4: Add `dateRange` computation and update `queryParams`**

After the `filterBar` line:
```ts
const filterBar = useFilterBar(filterConfig)
```

Add:
```ts
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = filterBar.appliedFilters.period
    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])
```

Then replace the existing `queryParams` `useMemo`:
```ts
  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
  }), [filterBar.appliedFilters, pageState.sorting.sortBy, pageState.sorting.sortOrder])
```

With:
```ts
  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    paymentStatus: filterBar.appliedFilters.paymentStatus || undefined,
    status: filterBar.appliedFilters.status || undefined,
    orderDateFrom: dateRange.fromDate,
    orderDateTo: dateRange.toDate,
  }), [filterBar.appliedFilters, dateRange, pageState.sorting.sortBy, pageState.sorting.sortOrder])
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "feat(purchasing): add period, paymentStatus, and status filters to PurchaseOrdersPage"
```

---

### Task 4: Verify end-to-end

- [ ] **Step 1: Run backend tests**

```bash
cd backend
npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend type-check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run targeted frontend tests**

```bash
cd frontend
npx vitest run src/components/filters/__tests__/FilterPurchasingStatus.test.tsx
npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Smoke test in browser**

Start the app (`docker compose up -d` or `cd backend && npm run start:dev` + `cd frontend && npm run dev`). Navigate to Purchase Orders. Verify:
- Period, Supplier, Payment, and Order Status filters appear in the filter bar
- Selecting a period filters by date range
- Selecting a payment status (e.g. Unpaid) returns only orders with paidAmount = 0
- Selecting Draft returns orders whose GRN is in draft status
- Selecting Received returns orders whose GRN is received
- Reset button clears all filters
