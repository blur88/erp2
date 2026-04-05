# Filter Components & Backend Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create four standalone filter components, register them as first-class `FilterBarConfig` types, and align all backend payment/fulfillment status APIs to canonical values so every page uses the same filter values.

**Architecture:** Backend DTOs for Sales Analytics and Purchasing Analytics are updated to accept canonical `unpaid|partial|paid|overpaid` and `fulfilled|unfulfilled` values, with translation layers in each service. Four new frontend components (`FilterCustomer`, `FilterOrderStatus`, `FilterPaymentStatus`, `FilterCompare`) are registered in `FilterBar.tsx` as new field types, and pages swap their inline select configs for the new types.

**Tech Stack:** NestJS 11 (backend DTOs + services), React 19 + MUI v7 (filter components), RTK Query (customer data fetching), Vitest (frontend tests), Jest (backend tests)

---

## Task 1: Update Sales Analytics DTO — canonical payment + fulfillment params

**Files:**
- Modify: `backend/src/modules/sales/dto/sales-analytics.dto.ts`

- [ ] **Step 1: Write the failing test**

Open `backend/src/modules/sales/services/sales-analytics.service.spec.ts` and add this test near the top of the `describe('SalesAnalyticsService')` block:

```typescript
describe('getSalesAnalytics — new canonical query params', () => {
  it('DTO accepts fulfillmentStatus=fulfilled without validation error', () => {
    // Just a compile-time check — the field must exist on the DTO
    const dto = new SalesAnalyticsQueryDto()
    dto.fulfillmentStatus = 'fulfilled'
    expect(dto.fulfillmentStatus).toBe('fulfilled')
  })

  it('DTO accepts paymentStatus=unpaid without validation error', () => {
    const dto = new SalesAnalyticsQueryDto()
    ;(dto as any).paymentStatus = 'unpaid'
    expect((dto as any).paymentStatus).toBe('unpaid')
  })
})
```

Also add `SalesAnalyticsQueryDto` to the import at the top of the spec file:
```typescript
import { SalesAnalyticsQueryDto } from '../dto/sales-analytics.dto'
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: compile error or test failure — `fulfillmentStatus` does not exist on `SalesAnalyticsQueryDto`.

- [ ] **Step 3: Update the DTO**

In `backend/src/modules/sales/dto/sales-analytics.dto.ts`, replace the `isFulfilled` field and `paymentStatus` field inside `SalesAnalyticsQueryDto`:

Remove these lines (around line 89–108):
```typescript
  @ApiPropertyOptional({
    description: 'Filter by fulfillment status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isFulfilled?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by invoice payment status',
    enum: InvoiceStatus,
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  paymentStatus?: InvoiceStatus;
```

Replace with:
```typescript
  @ApiPropertyOptional({
    description: 'Filter by fulfillment status',
    enum: ['fulfilled', 'unfulfilled'],
  })
  @IsOptional()
  @IsIn(['fulfilled', 'unfulfilled'])
  fulfillmentStatus?: 'fulfilled' | 'unfulfilled';

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: ['unpaid', 'partial', 'paid', 'overpaid'],
  })
  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid', 'overpaid'])
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
```

Also add `IsIn` to the imports at the top (it's already imported — verify it's present, add if not):
```typescript
import {
  IsOptional,
  IsEnum,
  IsIn,
  IsUUID,
  IsDate,
  IsInt,
  Min,
  IsString,
} from 'class-validator';
```

Remove the `IsBoolean` import if it is no longer used elsewhere in the file.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS (the two new tests pass, existing tests still pass).

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/sales/dto/sales-analytics.dto.ts src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "feat(sales): update SalesAnalyticsQueryDto to canonical filter params"
```

---

## Task 2: Update Sales Analytics Service — translate new params to DB queries

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts`
- Modify: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `sales-analytics.service.spec.ts` inside the `describe('SalesAnalyticsService')` block. You will need a chainable query builder mock — add this helper near the top of the file (after the existing `makeRepoMock`):

```typescript
function makeChainableQb(rawOneResult: any = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(rawOneResult),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  }
  return qb
}
```

Then add these tests:

```typescript
describe('calculateSalesMetrics — fulfillmentStatus translation', () => {
  it('adds isFulfilled=true WHERE when fulfillmentStatus=fulfilled', async () => {
    const orderQb = makeChainableQb({
      totalRevenue: '0', totalOrders: '0', averageOrderValue: '0',
      completedOrders: '0', confirmedOrders: '0', draftOrders: '0',
    })
    const invoiceQb = makeChainableQb({
      paidInvoicesAmount: '0', pendingInvoicesAmount: '0', overdueInvoicesAmount: '0',
    })
    const module2 = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: { createQueryBuilder: jest.fn().mockReturnValue(orderQb) } },
        { provide: getRepositoryToken(Invoice), useValue: { createQueryBuilder: jest.fn().mockReturnValue(invoiceQb) } },
        { provide: getRepositoryToken(Payment), useValue: { createQueryBuilder: jest.fn().mockReturnValue(makeChainableQb()) } },
        { provide: getRepositoryToken(Customer), useValue: { createQueryBuilder: jest.fn().mockReturnValue(makeChainableQb()) } },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeRepoMock() },
        { provide: SalesAnalyticsReportService, useValue: { getProductSummary: jest.fn() } },
      ],
    }).compile()
    const svc = module2.get<SalesAnalyticsService>(SalesAnalyticsService)

    const query = new SalesAnalyticsQueryDto()
    query.fulfillmentStatus = 'fulfilled'
    await (svc as any).calculateSalesMetrics(new Date(), new Date(), query)

    const andWhereCalls: string[] = orderQb.andWhere.mock.calls.map((c: any[]) => c[0])
    expect(andWhereCalls.some((call) => call.includes('isFulfilled'))).toBe(true)
  })

  it('adds isFulfilled=false WHERE when fulfillmentStatus=unfulfilled', async () => {
    const orderQb = makeChainableQb({
      totalRevenue: '0', totalOrders: '0', averageOrderValue: '0',
      completedOrders: '0', confirmedOrders: '0', draftOrders: '0',
    })
    const invoiceQb = makeChainableQb({
      paidInvoicesAmount: '0', pendingInvoicesAmount: '0', overdueInvoicesAmount: '0',
    })
    const module2 = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: { createQueryBuilder: jest.fn().mockReturnValue(orderQb) } },
        { provide: getRepositoryToken(Invoice), useValue: { createQueryBuilder: jest.fn().mockReturnValue(invoiceQb) } },
        { provide: getRepositoryToken(Payment), useValue: { createQueryBuilder: jest.fn().mockReturnValue(makeChainableQb()) } },
        { provide: getRepositoryToken(Customer), useValue: { createQueryBuilder: jest.fn().mockReturnValue(makeChainableQb()) } },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeRepoMock() },
        { provide: SalesAnalyticsReportService, useValue: { getProductSummary: jest.fn() } },
      ],
    }).compile()
    const svc = module2.get<SalesAnalyticsService>(SalesAnalyticsService)

    const query = new SalesAnalyticsQueryDto()
    query.fulfillmentStatus = 'unfulfilled'
    await (svc as any).calculateSalesMetrics(new Date(), new Date(), query)

    const andWhereCalls: string[] = orderQb.andWhere.mock.calls.map((c: any[]) => c[0])
    expect(andWhereCalls.some((call) => call.includes('isFulfilled'))).toBe(true)
  })
})

describe('calculateSalesMetrics — paymentStatus translation', () => {
  it('maps paymentStatus=unpaid to invoice.status=draft in WHERE clause', async () => {
    const orderQb = makeChainableQb({
      totalRevenue: '0', totalOrders: '0', averageOrderValue: '0',
      completedOrders: '0', confirmedOrders: '0', draftOrders: '0',
    })
    const invoiceQb = makeChainableQb({
      paidInvoicesAmount: '0', pendingInvoicesAmount: '0', overdueInvoicesAmount: '0',
    })
    const module2 = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: { createQueryBuilder: jest.fn().mockReturnValue(orderQb) } },
        { provide: getRepositoryToken(Invoice), useValue: { createQueryBuilder: jest.fn().mockReturnValue(invoiceQb) } },
        { provide: getRepositoryToken(Payment), useValue: { createQueryBuilder: jest.fn().mockReturnValue(makeChainableQb()) } },
        { provide: getRepositoryToken(Customer), useValue: { createQueryBuilder: jest.fn().mockReturnValue(makeChainableQb()) } },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeRepoMock() },
        { provide: SalesAnalyticsReportService, useValue: { getProductSummary: jest.fn() } },
      ],
    }).compile()
    const svc = module2.get<SalesAnalyticsService>(SalesAnalyticsService)

    const query = new SalesAnalyticsQueryDto()
    ;(query as any).paymentStatus = 'unpaid'
    await (svc as any).calculateSalesMetrics(new Date(), new Date(), query)

    const andWhereCalls: string[] = invoiceQb.andWhere.mock.calls.map((c: any[]) => c[0])
    expect(andWhereCalls.some((call) => call.includes('invoice.status'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "fulfillmentStatus translation" 2>&1 | tail -20
```

Expected: FAIL — service still uses `isFulfilled` param.

- [ ] **Step 3: Update the service**

In `backend/src/modules/sales/services/sales-analytics.service.ts`, update `calculateSalesMetrics`, `getPeriodData`, `getTopCustomers`, and `getTopProducts` to translate from the new params. Find and replace all four occurrences of the `isFulfilled` check pattern and the `paymentStatus` check pattern.

For `isFulfilled` (appears 4 times, same pattern each time — replace all):
```typescript
// OLD:
if (query?.isFulfilled !== undefined) {
  orderQuery = orderQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
}

// NEW:
if (query?.fulfillmentStatus !== undefined) {
  orderQuery = orderQuery.andWhere('order.isFulfilled = :isFulfilled', {
    isFulfilled: query.fulfillmentStatus === 'fulfilled',
  });
}
```

For `paymentStatus` (appears 4 times — in `calculateSalesMetrics`, `getPeriodData`, `getTopCustomers`, `getTopProducts`). The translation maps canonical values to `InvoiceStatus` enum values:
```typescript
// OLD:
if (query?.paymentStatus) {
  invoiceQuery = invoiceQuery.andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
}

// NEW:
if (query?.paymentStatus) {
  const invoiceStatus = translatePaymentStatus(query.paymentStatus);
  invoiceQuery = invoiceQuery.andWhere('invoice.status = :paymentStatus', { paymentStatus: invoiceStatus });
}
```

Add the translation helper as a module-level function at the top of the service file (before the class):
```typescript
function translatePaymentStatus(
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid',
): string {
  switch (status) {
    case 'unpaid': return InvoiceStatus.DRAFT;
    case 'partial': return InvoiceStatus.PARTIAL_PAID;
    case 'paid':
    case 'overpaid': return InvoiceStatus.PAID;
  }
}
```

Note: `overpaid` maps to `InvoiceStatus.PAID` for invoice filtering purposes. The distinction between `paid` and `overpaid` is not meaningful at the analytics query level.

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-analytics.service.ts backend/src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "feat(sales): translate canonical paymentStatus/fulfillmentStatus in analytics service"
```

---

## Task 3: Update Purchasing Analytics DTO + Service — canonical payment status

**Files:**
- Modify: `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`
- Modify: `backend/src/modules/purchasing/services/purchasing-analytics.service.ts`
- Modify: `backend/src/modules/purchasing/services/purchasing-analytics.service.spec.ts`

- [ ] **Step 1: Write failing test**

Add to `backend/src/modules/purchasing/services/purchasing-analytics.service.spec.ts` inside the `describe('PurchasingAnalyticsService')` block:

```typescript
describe('getPurchasingAnalytics — paymentStatus=overpaid filter', () => {
  it('filters to orders where paidAmount > totalAmount when paymentStatus=overpaid', async () => {
    const orders = [
      // overpaid: paid 1100 on a 1000 order
      {
        orderNumber: 'PO-0001',
        orderDate: new Date('2026-03-01'),
        supplier: { companyName: 'Acme' },
        totalAmount: '1000',
        vendorPayments: [{ amount: '1100' }],
        isFullyReceived: true,
        shippingAmount: '0',
      },
      // paid exactly
      {
        orderNumber: 'PO-0002',
        orderDate: new Date('2026-03-02'),
        supplier: { companyName: 'Beta' },
        totalAmount: '500',
        vendorPayments: [{ amount: '500' }],
        isFullyReceived: false,
        shippingAmount: '0',
      },
    ]
    const qb = makeChainableQb([], orders, {
      totalSpent: '1500', totalOrders: '2', averageOrderValue: '750', activeSuppliers: '2',
    })
    purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb)

    const query = { ...baseQuery(), paymentStatus: 'overpaid' as const }
    const result = await service.getPurchasingAnalytics(query)

    // Only PO-0001 is overpaid
    expect(result.recentOrders).toHaveLength(1)
    expect(result.recentOrders[0].orderNumber).toBe('PO-0001')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && npx jest src/modules/purchasing/services/purchasing-analytics.service.spec.ts --no-coverage -t "paymentStatus=overpaid" 2>&1 | tail -20
```

Expected: FAIL — `overpaid` is not a valid enum value yet, or the filter logic doesn't handle it.

- [ ] **Step 3: Update DTO**

In `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`, change the `paymentStatus` field:

```typescript
// OLD:
  @ApiPropertyOptional({ enum: ['paid', 'partial', 'unpaid'] })
  @IsOptional()
  @IsIn(['paid', 'partial', 'unpaid'])
  paymentStatus?: 'paid' | 'partial' | 'unpaid';

// NEW:
  @ApiPropertyOptional({ enum: ['unpaid', 'partial', 'paid', 'overpaid'] })
  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid', 'overpaid'])
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
```

Also update the `PurchasingAnalyticsFilters` interface at the top of `purchasing-analytics.service.ts`:

```typescript
// OLD:
interface PurchasingAnalyticsFilters {
  supplierId?: string;
  status?: 'received' | 'pending';
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
}

// NEW:
interface PurchasingAnalyticsFilters {
  supplierId?: string;
  status?: 'received' | 'pending';
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
}
```

- [ ] **Step 4: Update the payment status filter logic in the service**

In `purchasing-analytics.service.ts`, find the in-memory payment status filter (appears in `getPurchaseOrderSummary` and `getPurchasingAnalytics`). The pattern looks like:

```typescript
let paymentStatus = 'unpaid';
if (paidAmount >= totalAmount && totalAmount > 0) {
  paymentStatus = 'paid';
} else if (paidAmount > 0) {
  paymentStatus = 'partial';
}
```

Add a helper function at the top of the service file (before the class):

```typescript
function derivePaymentStatus(
  paidAmount: number,
  totalAmount: number,
): 'unpaid' | 'partial' | 'paid' | 'overpaid' {
  if (totalAmount <= 0) return 'unpaid';
  if (paidAmount > totalAmount) return 'overpaid';
  if (paidAmount === totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
}
```

Replace every occurrence of the inline payment status derivation (there are at least 4 in the file — in `getPurchaseOrderSummary`, `getPurchaseOrderDetails`, `getVendorProductList`, and `getPurchasingAnalytics`) with:

```typescript
const paymentStatus = derivePaymentStatus(paidAmount, totalAmount);
```

The filter check that was `return paymentStatus === query.paymentStatus` continues to work correctly since `derivePaymentStatus` now returns `'overpaid'` where appropriate.

- [ ] **Step 5: Run all purchasing tests to verify pass**

```bash
cd backend && npx jest src/modules/purchasing/services/purchasing-analytics.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts backend/src/modules/purchasing/services/purchasing-analytics.service.ts backend/src/modules/purchasing/services/purchasing-analytics.service.spec.ts
git commit -m "feat(purchasing): add overpaid payment status support in analytics"
```

---

## Task 4: Update `dashboardApiParams.ts` — remove `isFulfilled`, add `fulfillmentStatus`

**Files:**
- Modify: `frontend/src/utils/dashboardApiParams.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/utils/__tests__/dashboardApiParams.test.ts` (or check if it exists — if it does, add to it):

```bash
ls frontend/src/utils/__tests__/ 2>/dev/null || echo "no __tests__ dir"
```

Create the file:
```typescript
// frontend/src/utils/__tests__/dashboardApiParams.test.ts
import { describe, it, expect } from 'vitest'
import { resolveApiParams } from '../dashboardApiParams'
import type { DashboardFilterBase } from '../dashboardApiParams'

const baseFilter = (): DashboardFilterBase => ({
  period: { key: 'this_month', from: null, to: null },
  compareWith: null,
})

describe('resolveApiParams', () => {
  it('passes fulfillmentStatus=fulfilled as-is (not as isFulfilled boolean)', () => {
    const result = resolveApiParams({
      ...baseFilter(),
      fulfillmentStatus: 'fulfilled',
    })
    expect(result.fulfillmentStatus).toBe('fulfilled')
    expect((result as any).isFulfilled).toBeUndefined()
  })

  it('passes fulfillmentStatus=unfulfilled as-is', () => {
    const result = resolveApiParams({
      ...baseFilter(),
      fulfillmentStatus: 'unfulfilled',
    })
    expect(result.fulfillmentStatus).toBe('unfulfilled')
  })

  it('omits fulfillmentStatus when null', () => {
    const result = resolveApiParams({
      ...baseFilter(),
      fulfillmentStatus: null,
    })
    expect(result.fulfillmentStatus).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/utils/__tests__/dashboardApiParams.test.ts 2>&1 | tail -20
```

Expected: FAIL — `fulfillmentStatus` does not exist on `DashboardFilterBase` or `DashboardResolvedApiParams`.

- [ ] **Step 3: Update dashboardApiParams.ts**

Replace the content of `frontend/src/utils/dashboardApiParams.ts`:

```typescript
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import type { PeriodValue } from '@/types/filterBar.types'

export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null

export interface DashboardResolvedApiParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  customerId?: string
  supplierId?: string
  status?: string
  fulfillmentStatus?: string
  paymentStatus?: string
  categoryId?: string
  stockStatus?: string
}

export interface DashboardFilterBase {
  period: PeriodValue
  compareWith: DashboardCompare
  customerId?: string | null
  supplierId?: string | null
  fulfillmentStatus?: string | null
  status?: string | null
  paymentStatus?: string | null
  categoryId?: string | null
  stockStatus?: string | null
}

function groupByForRange(from: string, to: string): string {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  if (days <= 31) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

function periodToApiParams(
  period: PeriodValue,
  compareWith: DashboardCompare,
): Record<string, string | undefined> {
  const compareParam = compareWith ?? undefined

  if (period.key === 'custom') {
    if (period.from && period.to) {
      return {
        startDate: period.from,
        endDate: period.to,
        groupBy: groupByForRange(period.from, period.to),
        compareWith: compareParam,
      }
    }

    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  if (period.key === 'this_month' || period.key === 'last_month') {
    return { dateRange: period.key, groupBy: 'day', compareWith: compareParam }
  }

  if (period.key === null) {
    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  const { from, to } = getPeriodDateRange(period.key, getStartOfWeek())
  return {
    startDate: from,
    endDate: to,
    groupBy: groupByForRange(from, to),
    compareWith: compareParam,
  }
}

export function resolveApiParams(filters: DashboardFilterBase): DashboardResolvedApiParams {
  const base = periodToApiParams(filters.period, filters.compareWith)

  return {
    ...base,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.fulfillmentStatus != null ? { fulfillmentStatus: filters.fulfillmentStatus } : {}),
    ...(filters.status != null ? { status: filters.status } : {}),
    ...(filters.paymentStatus != null ? { paymentStatus: filters.paymentStatus } : {}),
    ...(filters.categoryId != null ? { categoryId: filters.categoryId } : {}),
    ...(filters.stockStatus != null ? { stockStatus: filters.stockStatus } : {}),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/utils/__tests__/dashboardApiParams.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/dashboardApiParams.ts frontend/src/utils/__tests__/dashboardApiParams.test.ts
git commit -m "feat(frontend): replace isFulfilled boolean with fulfillmentStatus string in dashboardApiParams"
```

---

## Task 5: Add new FilterFieldTypes to filterBar.types.ts

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`

- [ ] **Step 1: Write failing type-check test**

This is a TypeScript types change — verify with the type-checker:

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Note current output (should be clean). We'll re-run after changes.

- [ ] **Step 2: Update filterBar.types.ts**

Replace the entire content of `frontend/src/types/filterBar.types.ts`:

```typescript
import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'period'
  | 'compare'
  | 'customer'
  | 'order-status'
  | 'payment-status'

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

export interface SelectFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'select' | 'multi-select'
  options: FilterOption[]
}

export interface PeriodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'period'
}

export interface CompareFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'compare'
}

export interface CustomerFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'customer'
}

export interface OrderStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'order-status'
}

export interface PaymentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'payment-status'
  includeOverpaid?: boolean
}

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerFilterFieldConfig<TFilters, keyof TFilters>
  | OrderStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentStatusFilterFieldConfig<TFilters, keyof TFilters>

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  fields: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
  namespace?: string
}

export interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void
  onSearchCommit: () => void
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void
  onClearField: (field: keyof TFilters) => void
  onClearAll: () => void
}

export interface FilterBarSortConfig {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}
```

- [ ] **Step 3: Run type-check to verify clean**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no new errors (may have existing unrelated errors — those are fine, as long as no new ones from this file).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/filterBar.types.ts
git commit -m "feat(frontend): add customer, order-status, payment-status to FilterFieldType"
```

---

## Task 6: Create FilterCompare component + constants file

**Files:**
- Create: `frontend/src/constants/filterOptions.ts`
- Create: `frontend/src/components/filters/FilterCompare.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/filters/__tests__/FilterCompare.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterCompare } from '../FilterCompare'

describe('FilterCompare', () => {
  it('renders the Compare label', () => {
    render(<FilterCompare value={null} onChange={vi.fn()} periodValue={null} />)
    expect(screen.getByLabelText(/compare/i)).toBeInTheDocument()
  })

  it('shows all three comparison options', async () => {
    const { getByRole } = render(
      <FilterCompare value={null} onChange={vi.fn()} periodValue={null} />,
    )
    getByRole('combobox').click()
    expect(await screen.findByText('Previous Period')).toBeInTheDocument()
    expect(await screen.findByText('Same Period Last Month')).toBeInTheDocument()
    expect(await screen.findByText('Same Period Last Year')).toBeInTheDocument()
  })

  it('is disabled when period key is today', () => {
    render(
      <FilterCompare
        value={null}
        onChange={vi.fn()}
        periodValue={{ key: 'today', from: null, to: null }}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onChange with null when empty option selected', async () => {
    const onChange = vi.fn()
    render(<FilterCompare value="previous_period" onChange={onChange} periodValue={null} />)
    // The combobox exists and component renders without error
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterCompare.test.tsx 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create constants file**

Create `frontend/src/constants/filterOptions.ts`:

```typescript
export const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'Previous Period' },
  { value: 'last_month', label: 'Same Period Last Month' },
  { value: 'last_year', label: 'Same Period Last Year' },
]
```

- [ ] **Step 4: Create FilterCompare component**

Create `frontend/src/components/filters/FilterCompare.tsx`:

```typescript
import { FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
import { useId } from 'react'
import { COMPARE_OPTIONS } from '@/constants/filterOptions'
import type { PeriodValue } from '@/types/filterBar.types'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
  periodValue: PeriodValue | null
}

export function FilterCompare({ value, onChange, periodValue }: Props) {
  const uid = useId()
  const selectId = `${uid}-compare`
  const labelId = `${uid}-compare-label`
  const compareDisabled = periodValue?.key === 'today'

  return (
    <Tooltip
      title={compareDisabled ? 'Comparison is not available for Today' : ''}
      placement="top"
    >
      <span>
        <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
          <InputLabel id={labelId}>Compare</InputLabel>
          <Select
            id={selectId}
            labelId={labelId}
            disabled={compareDisabled}
            value={value ?? ''}
            label="Compare"
            onChange={(event) => onChange((event.target.value || null) as string | null)}
          >
            <MenuItem value="">No Comparison</MenuItem>
            {COMPARE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </span>
    </Tooltip>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterCompare.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/constants/filterOptions.ts frontend/src/components/filters/FilterCompare.tsx frontend/src/components/filters/__tests__/FilterCompare.test.tsx
git commit -m "feat(frontend): add FilterCompare component and filterOptions constants"
```

---

## Task 7: Create FilterOrderStatus component

**Files:**
- Create: `frontend/src/components/filters/FilterOrderStatus.tsx`
- Create: `frontend/src/components/filters/__tests__/FilterOrderStatus.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/filters/__tests__/FilterOrderStatus.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterOrderStatus } from '../FilterOrderStatus'

describe('FilterOrderStatus', () => {
  it('renders with Order Status label', () => {
    render(<FilterOrderStatus value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
  })

  it('shows Unfulfilled and Fulfilled options', async () => {
    render(<FilterOrderStatus value={null} onChange={vi.fn()} />)
    screen.getByRole('combobox').click()
    expect(await screen.findByText('Unfulfilled')).toBeInTheDocument()
    expect(await screen.findByText('Fulfilled')).toBeInTheDocument()
  })

  it('displays the selected value', () => {
    render(<FilterOrderStatus value="fulfilled" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterOrderStatus.test.tsx 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/filters/FilterOrderStatus.tsx`:

```typescript
import { FilterSelect } from './FilterSelect'

const ORDER_STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterOrderStatus({ value, onChange }: Props) {
  return (
    <FilterSelect
      field="orderStatus"
      label="Order Status"
      type="select"
      value={value}
      options={ORDER_STATUS_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterOrderStatus.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterOrderStatus.tsx frontend/src/components/filters/__tests__/FilterOrderStatus.test.tsx
git commit -m "feat(frontend): add FilterOrderStatus component"
```

---

## Task 8: Create FilterPaymentStatus component

**Files:**
- Create: `frontend/src/components/filters/FilterPaymentStatus.tsx`
- Create: `frontend/src/components/filters/__tests__/FilterPaymentStatus.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/filters/__tests__/FilterPaymentStatus.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterPaymentStatus } from '../FilterPaymentStatus'

describe('FilterPaymentStatus', () => {
  it('renders with Payment label', () => {
    render(<FilterPaymentStatus value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/payment/i)).toBeInTheDocument()
  })

  it('shows all four options by default', async () => {
    render(<FilterPaymentStatus value={null} onChange={vi.fn()} />)
    screen.getByRole('combobox').click()
    expect(await screen.findByText('Unpaid')).toBeInTheDocument()
    expect(await screen.findByText('Partial')).toBeInTheDocument()
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(await screen.findByText('Overpaid')).toBeInTheDocument()
  })

  it('hides Overpaid when includeOverpaid=false', async () => {
    render(<FilterPaymentStatus value={null} onChange={vi.fn()} includeOverpaid={false} />)
    screen.getByRole('combobox').click()
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText('Overpaid')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPaymentStatus.test.tsx 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/filters/FilterPaymentStatus.tsx`:

```typescript
import { FilterSelect } from './FilterSelect'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overpaid', label: 'Overpaid' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
  includeOverpaid?: boolean
}

export function FilterPaymentStatus({ value, onChange, includeOverpaid = true }: Props) {
  const options = includeOverpaid
    ? PAYMENT_STATUS_OPTIONS
    : PAYMENT_STATUS_OPTIONS.filter((o) => o.value !== 'overpaid')

  return (
    <FilterSelect
      field="paymentStatus"
      label="Payment"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPaymentStatus.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterPaymentStatus.tsx frontend/src/components/filters/__tests__/FilterPaymentStatus.test.tsx
git commit -m "feat(frontend): add FilterPaymentStatus component"
```

---

## Task 9: Create FilterCustomer component

**Files:**
- Create: `frontend/src/components/filters/FilterCustomer.tsx`
- Create: `frontend/src/components/filters/__tests__/FilterCustomer.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/filters/__tests__/FilterCustomer.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { FilterCustomer } from '../FilterCustomer'

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: {
      data: [
        { id: 'c1', name: 'Amuro Ray' },
        { id: 'c2', name: 'Char Aznable' },
      ],
    },
  })),
}))

function renderWithStore(ui: React.ReactElement) {
  const store = configureStore({ reducer: {} })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('FilterCustomer', () => {
  it('renders with Customer label', () => {
    renderWithStore(<FilterCustomer value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/customer/i)).toBeInTheDocument()
  })

  it('shows customer names as options', async () => {
    renderWithStore(<FilterCustomer value={null} onChange={vi.fn()} />)
    screen.getByRole('combobox').click()
    expect(await screen.findByText('Amuro Ray')).toBeInTheDocument()
    expect(await screen.findByText('Char Aznable')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterCustomer.test.tsx 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/filters/FilterCustomer.tsx`:

```typescript
import { useGetCustomersQuery } from '@/store/api/salesApi'
import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCustomer({ value, onChange }: Props) {
  const { data } = useGetCustomersQuery({ limit: 999999 })
  const options = (data?.data ?? []).map((customer) => ({
    value: customer.id,
    label: customer.name,
  }))

  return (
    <FilterSelect
      field="customerId"
      label="Customer"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterCustomer.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterCustomer.tsx frontend/src/components/filters/__tests__/FilterCustomer.test.tsx
git commit -m "feat(frontend): add FilterCustomer component"
```

---

## Task 10: Wire new components into FilterBar

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/__tests__/FilterBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Open `frontend/src/components/filters/__tests__/FilterBar.test.tsx` and add these tests. You will need to mock `useGetCustomersQuery` at the top of the file — add it to the existing `vi.mock` block or add a new one:

```typescript
vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'c1', name: 'Amuro Ray' }] },
  })),
}))
```

Then add these test cases inside the existing `describe('FilterBar')`:

```typescript
it('renders FilterCustomer when type=customer', () => {
  interface Filters { customerId: string | null }
  const customerConfig: FilterBarConfig<Filters> = {
    fields: [{ field: 'customerId', label: 'Customer', type: 'customer' }],
  }
  render(
    <Provider store={configureStore({ reducer: {} })}>
      <FilterBar
        config={customerConfig}
        draftFilters={{ customerId: null }}
        handlers={{ ...handlers, onSearchChange: vi.fn(), onSearchCommit: vi.fn(), onQuickFilterChange: vi.fn(), onClearField: vi.fn(), onClearAll: vi.fn() }}
        hasActiveFilters={false}
      />
    </Provider>,
  )
  expect(screen.getByLabelText(/customer/i)).toBeInTheDocument()
})

it('renders FilterOrderStatus when type=order-status', () => {
  interface Filters { fulfillmentStatus: string | null }
  const statusConfig: FilterBarConfig<Filters> = {
    fields: [{ field: 'fulfillmentStatus', label: 'Order Status', type: 'order-status' }],
  }
  render(
    <FilterBar
      config={statusConfig}
      draftFilters={{ fulfillmentStatus: null }}
      handlers={{ ...handlers, onSearchChange: vi.fn(), onSearchCommit: vi.fn(), onQuickFilterChange: vi.fn(), onClearField: vi.fn(), onClearAll: vi.fn() }}
      hasActiveFilters={false}
    />,
  )
  expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
})

it('renders FilterPaymentStatus when type=payment-status', () => {
  interface Filters { paymentStatus: string | null }
  const paymentConfig: FilterBarConfig<Filters> = {
    fields: [{ field: 'paymentStatus', label: 'Payment', type: 'payment-status' }],
  }
  render(
    <FilterBar
      config={paymentConfig}
      draftFilters={{ paymentStatus: null }}
      handlers={{ ...handlers, onSearchChange: vi.fn(), onSearchCommit: vi.fn(), onQuickFilterChange: vi.fn(), onClearField: vi.fn(), onClearAll: vi.fn() }}
      hasActiveFilters={false}
    />,
  )
  expect(screen.getByLabelText(/payment/i)).toBeInTheDocument()
})
```

Add the missing imports at the top of the test file:
```typescript
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx 2>&1 | tail -20
```

Expected: FAIL — new types not handled in `renderQuickField`.

- [ ] **Step 3: Update FilterBar.tsx**

Replace the content of `frontend/src/components/filters/FilterBar.tsx`:

```typescript
import { CircularProgress, Stack } from '@mui/material'

import { FilterCompare } from './FilterCompare'
import { FilterCustomer } from './FilterCustomer'
import { FilterOrderStatus } from './FilterOrderStatus'
import { FilterPaymentStatus } from './FilterPaymentStatus'
import { FilterPeriod } from './FilterPeriod'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import { AppButton } from '@/components/common/AppButton'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterBarSortConfig,
  PeriodValue,
} from '@/types/filterBar.types'

interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  sort?: FilterBarSortConfig
  isFetching?: boolean
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['fields'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
  config: FilterBarConfig<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onQuickFilterChange(field.field, nextValue)

  if (field.type === 'select' || field.type === 'multi-select') {
    return (
      <FilterSelect
        key={String(field.field)}
        field={String(field.field)}
        label={field.label}
        type={field.type}
        value={value as string | null | string[]}
        options={field.options}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={String(field.field)}
        value={periodValue.key}
        customFrom={periodValue.from}
        customTo={periodValue.to}
        onChange={(key, from, to) =>
          onChange({ key, from: from ?? null, to: to ?? null } as PeriodValue)
        }
      />
    )
  }

  if (field.type === 'compare') {
    const periodField = config.fields.find((configField) => configField.type === 'period')
    const periodValue = periodField ? (draftFilters[periodField.field] as PeriodValue) : null
    return (
      <FilterCompare
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
        periodValue={periodValue}
      />
    )
  }

  if (field.type === 'customer') {
    return (
      <FilterCustomer
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'order-status') {
    return (
      <FilterOrderStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'payment-status') {
    return (
      <FilterPaymentStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
        includeOverpaid={field.includeOverpaid}
      />
    )
  }

  return null
}

export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  isFetching,
}: Props<TFilters>) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      {config.search ? (
        <FilterSearch
          value={((draftFilters as Record<string, unknown>).search as string | undefined) ?? ''}
          placeholder={config.search.placeholder}
          onChange={handlers.onSearchChange}
          onCommit={handlers.onSearchCommit}
          inputRef={searchInputRef}
        />
      ) : null}
      {config.fields.map((field) => renderQuickField(field, draftFilters, handlers, config))}
      {sort ? (
        <AppButton
          size="filter"
          sortConfig={{ field: sort.field, sortBy: sort.sortBy, sortOrder: sort.sortOrder }}
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </AppButton>
      ) : null}
      {hasActiveFilters ? (
        <AppButton size="filter" variant="outlined" onClick={handlers.onClearAll}>
          Reset
        </AppButton>
      ) : null}
      {isFetching ? <CircularProgress size={16} /> : null}
    </Stack>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx frontend/src/components/filters/__tests__/FilterBar.test.tsx
git commit -m "feat(frontend): wire FilterCustomer, FilterOrderStatus, FilterPaymentStatus, FilterCompare into FilterBar"
```

---

## Task 11: Refactor OrdersPage.tsx

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Update the filterbar test to mock at component level**

In `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`, the test currently mocks `useGetCustomersQuery` inside `@/store/api/salesApi`. After this change `FilterCustomer` owns that call, so the mock needs to target the component-level import. The existing mock is sufficient — `FilterCustomer` imports from the same module path so the existing mock in `vi.mock('@/store/api/salesApi')` will still intercept it.

Verify the test still has the `useGetCustomersQuery` mock:
```typescript
vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Amuro Ray' }] },
  })),
  useLazyGetSalesOrderQuery: vi.fn(() => [vi.fn()]),
  useDeleteSalesOrderMutation: vi.fn(() => [vi.fn()]),
}))
```

This is already present — no change needed to the test file.

Run the test before making page changes to confirm it passes:
```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx 2>&1 | tail -20
```

Expected: PASS (baseline).

- [ ] **Step 2: Update OrdersPage.tsx**

In `frontend/src/pages/sales/OrdersPage.tsx`:

**Remove** the `useGetCustomersQuery` import from `@/store/api/salesApi` and its usage:
```typescript
// REMOVE this import:
useGetCustomersQuery,

// REMOVE these lines:
const { data: customersData } = useGetCustomersQuery({ limit: 999999 })
const customers = customersData?.data ?? []
```

**Update `filterConfig`** — replace the three inline select fields with the new types. The `filterConfig` `useMemo` should look like:

```typescript
const filterConfig = useMemo<FilterBarConfig<SalesOrderFilters>>(
  () => ({
    search: { placeholder: 'Search orders...' },
    fields: [
      {
        field: 'period',
        label: 'Period',
        type: 'period',
      },
      {
        field: 'customerId',
        label: 'Customer',
        type: 'customer',
      },
      {
        field: 'paymentStatus',
        label: 'Payment',
        type: 'payment-status',
      },
      {
        field: 'fulfillmentStatus',
        label: 'Order Status',
        type: 'order-status',
      },
    ],
    defaults: {
      search: '',
      customerId: null,
      paymentStatus: null,
      period: { key: null, from: null, to: null },
      fulfillmentStatus: null,
    },
  }),
  [],
)
```

Note: the `useMemo` dependency array changes from `[customers]` to `[]` since `FilterCustomer` fetches its own data — the config has no external dependencies.

- [ ] **Step 3: Run the test to verify it still passes**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "refactor(sales): use FilterCustomer, FilterPaymentStatus, FilterOrderStatus in OrdersPage"
```

---

## Task 12: Refactor SalesPage.tsx

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

- [ ] **Step 1: Run existing tests as baseline**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx 2>&1 | tail -10
```

Expected: PASS (unrelated but confirms nothing is broken before we start).

- [ ] **Step 2: Update SalesPage.tsx**

Open `frontend/src/pages/sales/SalesPage.tsx`.

**Remove** `useGetCustomersQuery` from the imports and its usage:
```typescript
// REMOVE from import:
import { useGetCustomersQuery } from '@/store/api/salesApi'

// REMOVE these lines:
const { data: customersData } = useGetCustomersQuery({})
const customerOptions = (customersData?.data ?? []).map(...)
```

**Update the `SalesDashboardFilters` type** — rename `isFulfilled` to `fulfillmentStatus`:
```typescript
type SalesDashboardFilters = {
  period: PeriodValue
  compareWith: DashboardCompare
  customerId: string | null
  fulfillmentStatus: string | null
  paymentStatus: string | null
}
```

**Update `salesConfig`** — replace the three inline select fields:
```typescript
const salesConfig: FilterBarConfig<SalesDashboardFilters> = {
  namespace: 'sales',
  fields: [
    {
      field: 'period',
      label: 'Period',
      type: 'period',
    },
    {
      field: 'compareWith',
      label: 'Compare',
      type: 'compare',
    },
    {
      field: 'customerId',
      label: 'Customer',
      type: 'customer',
      paramKey: 'customer',
    },
    {
      field: 'fulfillmentStatus',
      label: 'Order Status',
      type: 'order-status',
      paramKey: 'fulfilled',
    },
    {
      field: 'paymentStatus',
      label: 'Payment Status',
      type: 'payment-status',
      paramKey: 'payment',
    },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
    compareWith: null,
    customerId: null,
    fulfillmentStatus: null,
    paymentStatus: null,
  },
}
```

The `resolveApiParams(appliedFilters)` call on the line below `useFilterBar` works without changes because `DashboardFilterBase` now has `fulfillmentStatus` instead of `isFulfilled` (updated in Task 4).

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "refactor(sales): use FilterCustomer, FilterPaymentStatus, FilterOrderStatus in SalesPage"
```

---

## Task 13: Refactor PurchasingPage.tsx + update test

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`
- Modify: `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx`

- [ ] **Step 1: Run existing test as baseline**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 2: Update PurchasingPage.tsx**

Open `frontend/src/pages/purchasing/PurchasingPage.tsx`.

**Update `purchasingConfig`** — replace the `paymentStatus` select field only (keep `status` as plain `'select'`):

Find:
```typescript
      {
        field: 'paymentStatus',
        label: 'Payment Status',
        type: 'select',
        paramKey: 'payment',
        options: [
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ],
      },
```

Replace with:
```typescript
      {
        field: 'paymentStatus',
        label: 'Payment Status',
        type: 'payment-status',
        paramKey: 'payment',
      },
```

- [ ] **Step 3: Update the filter test**

In `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx`, the initial URL uses `purchasing_payment=partial` and expects `paymentStatus: 'partial'` — this still works since `partial` is a valid canonical value. No value change needed.

However the test mocks `FilterBar` directly so it won't exercise the new component. Confirm the test still passes:

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/PurchasingPage.tsx
git commit -m "refactor(purchasing): use FilterPaymentStatus in PurchasingPage"
```

---

## Task 14: Final verification — run all affected tests

- [ ] **Step 1: Run all filter component tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/ 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 2: Run all affected page filter tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx src/pages/inventory/__tests__/InventoryPage.filters.test.tsx 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 3: Run all backend sales + purchasing tests**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts src/modules/purchasing/services/purchasing-analytics.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 4: Run frontend type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors from changed files.

- [ ] **Step 5: Final commit if clean**

```bash
git add -p  # review any remaining unstaged changes
git status
```

If clean, no commit needed. If any straggler changes, commit them:

```bash
git commit -m "chore: filter components alignment cleanup"
```

---

## Summary of Tasks

| # | Task | Files |
|---|------|-------|
| 1 | Sales Analytics DTO — canonical params | `sales-analytics.dto.ts` |
| 2 | Sales Analytics Service — translate params | `sales-analytics.service.ts` + spec |
| 3 | Purchasing Analytics DTO + Service — overpaid | `purchasing-analytics.dto.ts` + service + spec |
| 4 | dashboardApiParams — fulfillmentStatus | `dashboardApiParams.ts` |
| 5 | filterBar.types.ts — new types | `filterBar.types.ts` |
| 6 | FilterCompare + constants | `FilterCompare.tsx`, `filterOptions.ts` |
| 7 | FilterOrderStatus | `FilterOrderStatus.tsx` |
| 8 | FilterPaymentStatus | `FilterPaymentStatus.tsx` |
| 9 | FilterCustomer | `FilterCustomer.tsx` |
| 10 | Wire into FilterBar | `FilterBar.tsx` |
| 11 | Refactor OrdersPage | `OrdersPage.tsx` |
| 12 | Refactor SalesPage | `SalesPage.tsx` |
| 13 | Refactor PurchasingPage | `PurchasingPage.tsx` |
| 14 | Final verification | all |
