# Sales Orders Filter Bar Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Sales Orders filter bar with period, fulfillment status, and broader search (customer + product name), and move the Sort button into the reusable `FilterBar` component.

**Architecture:** Backend `findAll` gets an extended search WHERE clause in the main query (join already present) and a hybrid customer-join + EXISTS-subquery approach in the count query to avoid fan-out. Frontend adds two filter fields to `OrdersPage`, extends `FilterBar` with an optional `sort` prop, and removes the standalone Sort button from both `OrdersPage` and `PurchaseOrdersPage`.

**Tech Stack:** NestJS 11 (TypeORM query builder), React 19, MUI v7, RTK Query, Vitest (frontend), Jest (backend)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/src/modules/sales/services/sales-order-query.service.ts` | Modify | Extend search clause in main query + count query |
| `backend/src/modules/sales/services/sales-order-query.service.spec.ts` | Modify | Add search-by-customer and search-by-product tests |
| `frontend/src/types/filterBar.types.ts` | Modify | Add `FilterBarSortConfig` interface |
| `frontend/src/components/filters/FilterBar.tsx` | Modify | Add optional `sort` prop + render Sort button |
| `frontend/src/pages/sales/OrdersPage.tsx` | Modify | Add `period` + `fulfillmentStatus` filters, date range mapping, pass `sort` to FilterBar |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Modify | Pass `sort` to FilterBar, remove standalone button |
| `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` | Modify | Add `fulfillmentStatus` + `period` URL restore tests |

---

## Task 1: Extend backend search — main query

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order-query.service.ts:117-121`

- [ ] **Step 1: Write the failing test**

Open `backend/src/modules/sales/services/sales-order-query.service.spec.ts` and add a new `describe('findAll')` block after the existing test. The test mocks `createQueryBuilder` to capture the search clause.

```typescript
describe('findAll', () => {
  function makeQueryBuilder() {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
    }
    return qb
  }

  it('searches customer name with ILIKE', async () => {
    const qb = makeQueryBuilder()
    salesOrderRepository.createQueryBuilder.mockReturnValue(qb)

    await service.findAll({ search: 'Acme' })

    const andWhereCalls: string[] = qb.andWhere.mock.calls.map((c: any[]) => c[0])
    const searchCall = andWhereCalls.find((c) => typeof c === 'string' && c.includes('customer.name ILIKE'))
    expect(searchCall).toBeDefined()
  })

  it('searches product name with ILIKE in main query', async () => {
    const qb = makeQueryBuilder()
    salesOrderRepository.createQueryBuilder.mockReturnValue(qb)

    await service.findAll({ search: 'Widget' })

    const andWhereCalls: string[] = qb.andWhere.mock.calls.map((c: any[]) => c[0])
    const searchCall = andWhereCalls.find((c) => typeof c === 'string' && c.includes('product.name ILIKE'))
    expect(searchCall).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-order-query.service.spec.ts --no-coverage
```

Expected: 2 new tests FAIL — `customer.name ILIKE` and `product.name ILIKE` not found in `andWhere` calls.

- [ ] **Step 3: Extend the main query search clause**

In `backend/src/modules/sales/services/sales-order-query.service.ts`, find the search block (around line 117) and replace:

```typescript
    if (search) {
      queryBuilder = queryBuilder.andWhere('order.orderNumber ILIKE :search', {
        search: `%${search}%`,
      });
    }
```

With:

```typescript
    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(order.orderNumber ILIKE :search OR customer.name ILIKE :search OR product.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-order-query.service.spec.ts --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-order-query.service.ts \
        backend/src/modules/sales/services/sales-order-query.service.spec.ts
git commit -m "feat(sales): extend order search to include customer and product name"
```

---

## Task 2: Extend backend search — count query

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order-query.service.ts:160-178`
- Modify: `backend/src/modules/sales/services/sales-order-query.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a test to the `describe('findAll')` block that verifies the count does not inflate when a product matches multiple items:

```typescript
  it('uses EXISTS subquery in count so an order with multiple matching items counts as 1', async () => {
    const mainQb = makeQueryBuilder()
    const countQb = makeQueryBuilder()
    let callCount = 0
    salesOrderRepository.createQueryBuilder.mockImplementation(() => {
      callCount++
      // first call = main query, second call = count query
      return callCount === 1 ? mainQb : countQb
    })

    await service.findAll({ search: 'Widget' })

    const countAndWhereCalls: string[] = countQb.andWhere.mock.calls.map((c: any[]) => c[0])
    const existsCall = countAndWhereCalls.find(
      (c) => typeof c === 'string' && c.includes('EXISTS'),
    )
    expect(existsCall).toBeDefined()
  })
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend && npx jest src/modules/sales/services/sales-order-query.service.spec.ts --no-coverage
```

Expected: new test FAILS — no EXISTS found in count query `andWhere` calls.

- [ ] **Step 3: Extend the count query search clause**

In `sales-order-query.service.ts`, the count query is built starting around line 160. First, add a `leftJoin` on customer right after the `.select(...)` call:

```typescript
    const countQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.deletedAt IS NULL')
      .select('COUNT(order.id)', 'count')
      .leftJoin('order.customer', 'customer');
```

Then replace the existing search block in the count query (around line 176):

```typescript
    if (search) {
      countQuery.andWhere('order.orderNumber ILIKE :search', { search: `%${search}%` });
    }
```

With:

```typescript
    if (search) {
      countQuery.andWhere(
        `(order.orderNumber ILIKE :search
          OR customer.name ILIKE :search
          OR EXISTS (
            SELECT 1 FROM sales_order_items i
            JOIN products p ON p.id = i."productId"
            WHERE i."salesOrderId" = order.id
            AND p.name ILIKE :search
          ))`,
        { search: `%${search}%` },
      );
    }
```

- [ ] **Step 4: Run the tests to confirm they all pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-order-query.service.spec.ts --no-coverage
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-order-query.service.ts \
        backend/src/modules/sales/services/sales-order-query.service.spec.ts
git commit -m "fix(sales): use EXISTS subquery in count to prevent fan-out on product name search"
```

---

## Task 3: Add `FilterBarSortConfig` type + extend `FilterBar` with `sort` prop

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Add `FilterBarSortConfig` to types**

Open `frontend/src/types/filterBar.types.ts` and add at the end of the file:

```typescript
export interface FilterBarSortConfig {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}
```

- [ ] **Step 2: Extend `FilterBar` with the `sort` prop**

Open `frontend/src/components/filters/FilterBar.tsx`. Add the new imports at the top alongside the existing MUI imports:

```typescript
import { ArrowDownward as ArrowDownIcon, ArrowUpward as ArrowUpIcon, Sort as SortIcon } from '@mui/icons-material'
import type { FilterBarSortConfig } from '@/types/filterBar.types'
```

Extend the `Props` interface to include the optional `sort` prop:

```typescript
interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  sort?: FilterBarSortConfig
}
```

Update the function signature to destructure `sort`:

```typescript
export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
}: Props<TFilters>) {
```

Add the Sort button after the Reset button inside the `Stack`:

```tsx
      {hasActiveFilters ? (
        <Button size="small" variant="outlined" color="inherit" sx={{ ml: 1 }} onClick={handlers.onClearAll}>
          Reset
        </Button>
      ) : null}
      {sort ? (
        <Button
          size="small"
          variant={sort.sortBy === sort.field ? 'contained' : 'outlined'}
          color={sort.sortBy === sort.field ? 'primary' : 'inherit'}
          startIcon={
            sort.sortBy === sort.field
              ? sort.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />
              : <SortIcon />
          }
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </Button>
      ) : null}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors related to `FilterBar` or `filterBar.types`.

- [ ] **Step 4: Run existing FilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: All existing tests PASS (the `sort` prop is optional so nothing breaks).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/filterBar.types.ts \
        frontend/src/components/filters/FilterBar.tsx
git commit -m "feat(filterBar): add optional sort prop with active/inactive button styling"
```

---

## Task 4: Update `OrdersPage` — new filters, date range mapping, sort prop

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`

- [ ] **Step 1: Write the failing tests**

Open `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` and add two new tests inside the existing `describe` block:

```typescript
  it('restores fulfillmentStatus=fulfilled from URL and passes it to the query', () => {
    renderPage('/?fulfillmentStatus=fulfilled')
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fulfillmentStatus: 'fulfilled',
      }),
    )
  })

  it('restores period=this_week from URL and resolves to fromDate/toDate in the query', () => {
    renderPage('/?period=this_week')
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

Expected: 2 new tests FAIL — `fulfillmentStatus` and `fromDate`/`toDate` not present in query args.

- [ ] **Step 3: Update `OrdersPage.tsx`**

Open `frontend/src/pages/sales/OrdersPage.tsx`.

**Add imports** (alongside the existing `useCallback`, `useEffect`, etc.):

```typescript
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import type { PeriodValue } from '@/types/filterBar.types'
```

**Replace the `SalesOrderFilters` interface:**

```typescript
interface SalesOrderFilters {
  search: string
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  period: PeriodValue
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
}
```

**Replace the `filterConfig` fields array** (keep `search` and `customerId`/`paymentStatus`, add `period` and `fulfillmentStatus`):

```typescript
  const filterConfig = useMemo<FilterBarConfig<SalesOrderFilters>>(
    () => ({
      search: { placeholder: 'Search orders...' },
      fields: [
        {
          field: 'customerId',
          label: 'Customer',
          type: 'select',
          options: customers.map((customer) => ({ value: customer.id, label: customer.name })),
        },
        {
          field: 'paymentStatus',
          label: 'Payment',
          type: 'select',
          options: [
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial' },
            { value: 'paid', label: 'Paid' },
            { value: 'overpaid', label: 'Overpaid' },
          ],
        },
        {
          field: 'period',
          label: 'Period',
          type: 'period',
        },
        {
          field: 'fulfillmentStatus',
          label: 'Fulfillment',
          type: 'select',
          options: [
            { value: 'unfulfilled', label: 'Unfulfilled' },
            { value: 'fulfilled', label: 'Fulfilled' },
          ],
        },
      ],
      defaults: {
        search: '',
        customerId: null,
        paymentStatus: null,
        fulfillmentStatus: null,
      },
    }),
    [customers],
  )
```

**Add date range mapping** — insert this after the `useFilterBar` call and before `orderQueryArgs`:

```typescript
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const p = appliedFilters.period
    if (!p || p.key === 'custom') {
      return { fromDate: p?.from ?? undefined, toDate: p?.to ?? undefined }
    }
    const r = getPeriodDateRange(p.key, weekStartsOn)
    return { fromDate: r.from, toDate: r.to }
  }, [appliedFilters.period, weekStartsOn])
```

**Replace `orderQueryArgs`:**

```typescript
  const orderQueryArgs = useMemo(() => ({
    sortBy,
    sortOrder,
    search: appliedFilters.search || undefined,
    customerId: appliedFilters.customerId || undefined,
    paymentStatus: appliedFilters.paymentStatus || undefined,
    fulfillmentStatus: appliedFilters.fulfillmentStatus || undefined,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
  }), [appliedFilters, sortBy, sortOrder, dateRange])
```

**Replace the JSX filter section** — find the `<Stack direction={isMobile ? 'column' : 'row'} ...>` block that wraps `FilterBar` and the Sort `Button` (lines ~211-229) and replace the entire block with:

```tsx
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={pageState.searchInputRef}
          sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: handleSort }}
        />
      </Box>
```

Also remove the unused `isMobile`, `useMediaQuery`, `useTheme` imports if they are no longer referenced elsewhere in the file — check first before removing.

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx \
        frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
git commit -m "feat(sales): add period and fulfillmentStatus filters to OrdersPage, move sort into FilterBar"
```

---

## Task 5: Update `PurchaseOrdersPage` — move Sort into FilterBar

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

- [ ] **Step 1: Read the current JSX filter section**

The sort stack is at lines ~187-209. It looks like:

```tsx
<Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'center'} sx={{ mb: 3 }}>
  <Box sx={{ flex: 1 }}>
    <FilterBar
      config={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
    />
  </Box>
  <Button
    variant={pageState.sorting.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
    size="small"
    startIcon={pageState.sorting.sortBy === 'orderNumber'
      ? pageState.sorting.sortOrder === 'desc'
        ? <ArrowDownIcon />
        : <ArrowUpIcon />
      : <SortIcon />}
    onClick={() => handleSort('orderNumber')}
  >
    Sort
  </Button>
</Stack>
```

- [ ] **Step 2: Replace the filter section JSX**

Replace the entire `Stack` block above with:

```tsx
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={filterBar.draftFilters}
          handlers={filterBar.handlers}
          hasActiveFilters={filterBar.hasActiveFilters}
          searchInputRef={pageState.searchInputRef}
          sort={{
            field: 'orderNumber',
            sortBy: pageState.sorting.sortBy,
            sortOrder: pageState.sorting.sortOrder,
            onSort: handleSort,
          }}
        />
      </Box>
```

Remove the now-unused imports `ArrowDownward`, `ArrowUpward`, `Sort` (SortIcon), `Stack`, `Button` if they are no longer referenced anywhere else in the file — check first.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: No errors.

- [ ] **Step 4: Run the purchase orders filter bar test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```

Expected: All existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "feat(purchasing): move sort button into FilterBar on PurchaseOrdersPage"
```

---

## Self-Review Checklist

After writing this plan I verified:

1. **Spec coverage:**
   - ✅ Extended search: order number + customer name + product name — Task 1
   - ✅ COUNT fan-out fix with EXISTS — Task 2
   - ✅ `FilterBarSortConfig` type + `FilterBar` sort prop — Task 3
   - ✅ `period` filter + date range mapping — Task 4
   - ✅ `fulfillmentStatus` filter — Task 4
   - ✅ Sort button moved from `OrdersPage` — Task 4
   - ✅ Sort button moved from `PurchaseOrdersPage` — Task 5
   - ✅ Reset button unchanged (already works with new fields) — no task needed
   - ✅ Button styling: Sort active = `contained/primary`, inactive = `outlined/inherit` — Task 3

2. **Placeholders:** None — all steps have exact code.

3. **Type consistency:**
   - `FilterBarSortConfig` defined in Task 3, used in Task 3 (`FilterBar.tsx`) and referenced in Tasks 4 + 5 via the `sort` prop shape.
   - `PeriodValue` imported from `@/types/filterBar.types` in Task 4 — matches type defined in that file.
   - `getPeriodDateRange`, `getStartOfWeek` imported from `@/utils/dateRange` in Task 4 — both exported from that file.
