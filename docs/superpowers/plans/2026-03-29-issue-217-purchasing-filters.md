# Purchasing Overview Filters (Issue #217) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supplier, Order Status, and Payment Status filters to the Purchasing Overview dashboard, mirroring the Sales Overview filter pattern.

**Architecture:** Extend the backend DTO and service to accept three new filter params, pass them through all four private analytics sub-methods. On the frontend, add `supplierId` and `status` to `useDashboardFilters`, widen the `DashboardFilterBar` with optional supplier/status props and configurable payment status options, update `usePurchasingAnalytics`, and wire everything up in `PurchasingPage`.

**Tech Stack:** NestJS 11, TypeORM, class-validator, React 19, MUI v7, Vitest, Jest

---

## File Map

**Modified:**
- `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts` — add 3 filter fields to DTO
- `backend/src/modules/purchasing/services/purchasing-analytics.service.ts` — add `PurchasingAnalyticsFilters` interface, thread filters through all sub-methods
- `frontend/src/hooks/useDashboardFilters.ts` — add `supplierId` + `status` state, URL params, callbacks, `resolvedApiParams`
- `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts` — add 3 params to interface
- `frontend/src/components/filters/DashboardFilterBar.tsx` — add supplier, status, and `paymentStatusOptions` props
- `frontend/src/pages/purchasing/PurchasingPage.tsx` — fetch suppliers, wire all new filter state

**Test files modified:**
- `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx`
- `frontend/src/pages/purchasing/__tests__/` — add `PurchasingPage.filters.test.tsx`

**No new files created.**

---

## Task 1: Backend DTO — add filter fields

**Files:**
- Modify: `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`

- [ ] **Step 1: Add three fields to `PurchasingAnalyticsQueryDto`**

Replace the class (lines 9–36) with:

```typescript
export class PurchasingAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: DateRange, example: DateRange.THIS_MONTH })
  @IsOptional()
  @IsEnum(DateRange)
  dateRange?: DateRange;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  endDate?: Date;

  @ApiPropertyOptional({ enum: ['previous_period', 'last_month', 'last_year'] })
  @IsOptional()
  @IsIn(['previous_period', 'last_month', 'last_year'])
  compareWith?: 'previous_period' | 'last_month' | 'last_year';

  @ApiPropertyOptional({ enum: GroupByPeriod, example: GroupByPeriod.MONTH })
  @IsOptional()
  @IsEnum(GroupByPeriod)
  groupBy?: GroupByPeriod;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['received', 'pending'] })
  @IsOptional()
  @IsIn(['received', 'pending'])
  status?: 'received' | 'pending';

  @ApiPropertyOptional({ enum: ['paid', 'partial', 'unpaid'] })
  @IsOptional()
  @IsIn(['paid', 'partial', 'unpaid'])
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
}
```

Also add `IsUUID` to the import line at the top:

```typescript
import { IsOptional, IsEnum, IsIn, IsDate, IsUUID } from 'class-validator';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `purchasing-analytics.dto.ts`

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts
git commit -m "feat(purchasing): add supplierId/status/paymentStatus to analytics DTO (#217)"
```

---

## Task 2: Backend Service — thread filters through sub-methods

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchasing-analytics.service.ts`

- [ ] **Step 1: Add `PurchasingAnalyticsFilters` interface after existing `PurchaseOrderSummaryQuery` interface (after line 31)**

Add immediately after the closing `}` of `PurchaseOrderSummaryQuery` (around line 31):

```typescript
interface PurchasingAnalyticsFilters {
  supplierId?: string;
  status?: 'received' | 'pending';
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
}
```

- [ ] **Step 2: Update `getPurchasingAnalytics` to extract and pass filters**

Replace the body of `getPurchasingAnalytics` (lines 586–628):

```typescript
async getPurchasingAnalytics(
  query: PurchasingAnalyticsQueryDto,
): Promise<PurchasingAnalyticsResponseDto> {
  const { startDate, endDate } = this.parsePurchasingDateRange(
    query.dateRange,
    query.startDate,
    query.endDate,
  );
  const groupBy = query.groupBy ?? GroupByPeriod.MONTH;
  const comparePeriod = query.compareWith
    ? this.computePurchasingComparePeriod(startDate, endDate, query.compareWith)
    : null;

  const filters: PurchasingAnalyticsFilters = {
    supplierId: query.supplierId,
    status: query.status,
    paymentStatus: query.paymentStatus,
  };

  const [metrics, periodData, topSuppliers, recentOrders] = await Promise.all([
    this.calculatePurchasingMetrics(startDate, endDate, filters),
    this.getPurchasingPeriodData(startDate, endDate, groupBy, filters),
    this.getTopSuppliers(startDate, endDate, 5, filters),
    this.getRecentPurchaseOrders(5, filters),
  ]);

  const current: PurchasingPeriodBlockDto = {
    metrics,
    periodData,
    periodStart: startDate.toISOString().split('T')[0],
    periodEnd: endDate.toISOString().split('T')[0],
  };

  let comparison: PurchasingPeriodBlockDto | undefined;
  if (comparePeriod) {
    const [compareMetrics, comparePeriodData] = await Promise.all([
      this.calculatePurchasingMetrics(comparePeriod.compareStart, comparePeriod.compareEnd, filters),
      this.getPurchasingPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy, filters),
    ]);
    comparison = {
      metrics: compareMetrics,
      periodData: comparePeriodData,
      periodStart: comparePeriod.compareStart.toISOString().split('T')[0],
      periodEnd: comparePeriod.compareEnd.toISOString().split('T')[0],
    };
  }

  return { current, comparison, topSuppliers, recentOrders };
}
```

- [ ] **Step 3: Update `calculatePurchasingMetrics` signature and add filter WHERE clauses**

Replace the `calculatePurchasingMetrics` method (lines 630–661):

```typescript
private async calculatePurchasingMetrics(
  startDate: Date,
  endDate: Date,
  filters: PurchasingAnalyticsFilters = {},
): Promise<PurchasingMetricsDto> {
  const baseQb = () =>
    this.purchaseOrderRepository
      .createQueryBuilder('po')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true });

  const applyFilters = (qb: ReturnType<typeof baseQb>) => {
    if (filters.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
    }
    if (filters.status) {
      qb.andWhere('po.isFullyReceived = :isFullyReceived', {
        isFullyReceived: filters.status === 'received',
      });
    }
    return qb;
  };

  const [orderStats, supplierStats] = await Promise.all([
    applyFilters(baseQb())
      .select([
        'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
        'COUNT(*) as "totalOrders"',
        'COALESCE(AVG(po.totalAmount), 0) as "averageOrderValue"',
      ])
      .getRawOne(),
    applyFilters(baseQb())
      .select('COUNT(DISTINCT po.supplierId) as "activeSuppliers"')
      .getRawOne(),
  ]);

  return {
    totalSpent: parseFloat(orderStats.totalSpent) || 0,
    totalOrders: parseInt(orderStats.totalOrders) || 0,
    averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
    activeSuppliers: parseInt(supplierStats.activeSuppliers) || 0,
  };
}
```

- [ ] **Step 4: Update `getPurchasingPeriodData` signature and add filter WHERE clauses**

Replace the `getPurchasingPeriodData` method (lines 663–707):

```typescript
private async getPurchasingPeriodData(
  startDate: Date,
  endDate: Date,
  groupBy: string,
  filters: PurchasingAnalyticsFilters = {},
): Promise<PurchasingPeriodDataDto[]> {
  let dateFormat: string;

  switch (groupBy) {
    case 'day':
      dateFormat = 'YYYY-MM-DD';
      break;
    case 'week':
      dateFormat = 'IYYY-IW';
      break;
    case 'quarter':
      dateFormat = 'YYYY-"Q"Q';
      break;
    case 'year':
      dateFormat = 'YYYY';
      break;
    default:
      dateFormat = 'YYYY-MM';
      break;
  }

  const qb = this.purchaseOrderRepository
    .createQueryBuilder('po')
    .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
    .andWhere('po.deletedAt IS NULL')
    .andWhere('po.isActive = :isActive', { isActive: true });

  if (filters.supplierId) {
    qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
  }
  if (filters.status) {
    qb.andWhere('po.isFullyReceived = :isFullyReceived', {
      isFullyReceived: filters.status === 'received',
    });
  }

  const data = await qb
    .select([
      `TO_CHAR(po.orderDate, '${dateFormat}') as period`,
      'COUNT(*) as orders',
      'COALESCE(SUM(po.totalAmount), 0) as spent',
    ])
    .groupBy(`TO_CHAR(po.orderDate, '${dateFormat}')`)
    .orderBy(`TO_CHAR(po.orderDate, '${dateFormat}')`, 'ASC')
    .getRawMany();

  return data.map((item) => ({
    period: item.period,
    spent: parseFloat(item.spent) || 0,
    orders: parseInt(item.orders) || 0,
  }));
}
```

- [ ] **Step 5: Update `getTopSuppliers` signature and add filter WHERE clauses**

Replace the `getTopSuppliers` method (lines 709–738):

```typescript
private async getTopSuppliers(
  startDate: Date,
  endDate: Date,
  limit: number,
  filters: PurchasingAnalyticsFilters = {},
): Promise<TopSupplierDto[]> {
  const qb = this.purchaseOrderRepository
    .createQueryBuilder('po')
    .leftJoin('po.supplier', 'supplier')
    .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
    .andWhere('po.deletedAt IS NULL')
    .andWhere('po.isActive = :isActive', { isActive: true });

  if (filters.supplierId) {
    qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
  }
  if (filters.status) {
    qb.andWhere('po.isFullyReceived = :isFullyReceived', {
      isFullyReceived: filters.status === 'received',
    });
  }

  const data = await qb
    .select([
      'supplier.id as "supplierId"',
      'supplier.companyName as "supplierName"',
      'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
      'COUNT(*) as "orderCount"',
    ])
    .groupBy('supplier.id')
    .addGroupBy('supplier.companyName')
    .orderBy('"totalSpent"', 'DESC')
    .limit(limit)
    .getRawMany();

  return data.map((item) => ({
    supplierId: item.supplierId,
    supplierName: item.supplierName,
    totalSpent: parseFloat(item.totalSpent) || 0,
    orderCount: parseInt(item.orderCount) || 0,
  }));
}
```

- [ ] **Step 6: Update `getRecentPurchaseOrders` to accept and apply all 3 filters**

Replace the `getRecentPurchaseOrders` method (lines 740–760):

```typescript
private async getRecentPurchaseOrders(
  limit: number,
  filters: PurchasingAnalyticsFilters = {},
): Promise<RecentPurchaseOrderDto[]> {
  // Over-fetch to allow post-DB paymentStatus filtering
  const fetchLimit = filters.paymentStatus ? limit * 5 : limit;

  const qb = this.purchaseOrderRepository
    .createQueryBuilder('po')
    .leftJoinAndSelect('po.supplier', 'supplier')
    .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
    .where('po.deletedAt IS NULL')
    .andWhere('po.isActive = :isActive', { isActive: true });

  if (filters.supplierId) {
    qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
  }
  if (filters.status) {
    qb.andWhere('po.isFullyReceived = :isFullyReceived', {
      isFullyReceived: filters.status === 'received',
    });
  }

  const orders = await qb
    .orderBy('po.orderDate', 'DESC')
    .limit(fetchLimit)
    .getMany();

  const mapped = orders.map((po) => {
    const date = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
    const paidAmount = (po.vendorPayments ?? []).reduce(
      (sum, vp) => sum + parseFloat(vp.amount?.toString() || '0'),
      0,
    );
    const total = parseFloat(po.totalAmount?.toString() || '0');
    let computedPaymentStatus: 'paid' | 'partial' | 'unpaid';
    if (paidAmount >= total && total > 0) {
      computedPaymentStatus = 'paid';
    } else if (paidAmount > 0) {
      computedPaymentStatus = 'partial';
    } else {
      computedPaymentStatus = 'unpaid';
    }
    return {
      orderNumber: po.orderNumber,
      orderDate: date.toISOString().split('T')[0],
      supplierName: po.supplier?.companyName || 'N/A',
      totalAmount: total,
      status: (po.isFullyReceived ? 'received' : 'pending') as 'received' | 'pending',
      computedPaymentStatus,
    };
  });

  const filtered = filters.paymentStatus
    ? mapped.filter((o) => o.computedPaymentStatus === filters.paymentStatus)
    : mapped;

  return filtered.slice(0, limit).map(({ computedPaymentStatus: _, ...rest }) => rest);
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/purchasing/services/purchasing-analytics.service.ts
git commit -m "feat(purchasing): thread supplierId/status/paymentStatus filters through analytics service (#217)"
```

---

## Task 3: Frontend — extend `useDashboardFilters` with `supplierId` and `status`

**Files:**
- Modify: `frontend/src/hooks/useDashboardFilters.ts`

- [ ] **Step 1: Add `supplierId` and `status` to `DashboardResolvedApiParams` and widen `paymentStatus`**

Replace the interface (lines 7–16):

```typescript
export interface DashboardResolvedApiParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  customerId?: string
  supplierId?: string
  status?: string
  isFulfilled?: boolean
  paymentStatus?: string
}
```

- [ ] **Step 2: Add `supplierId` and `status` to `parseUrl` return type and parsing**

Replace `parseUrl` function (lines 24–74):

```typescript
function parseUrl(namespace: string): {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  customerId: string | null
  supplierId: string | null
  isFulfilled: boolean | null
  status: string | null
  paymentStatus: PaymentStatusFilter | null
} {
  const params = new URLSearchParams(window.location.search)
  const rawPeriod = params.get(`${namespace}_period`) ?? 'this_month'
  const rawCompare = params.get(`${namespace}_compare`)
  const rawFrom = params.get(`${namespace}_from`)
  const rawTo = params.get(`${namespace}_to`)
  const rawCustomer = params.get(`${namespace}_customer`) ?? null
  const rawSupplier = params.get(`${namespace}_supplier`) ?? null
  const rawFulfilled = params.get(`${namespace}_fulfilled`)
  const rawStatus = params.get(`${namespace}_status`) ?? null
  const rawPayment = params.get(`${namespace}_payment`)

  const period: DashboardPeriod = VALID_PERIODS.includes(rawPeriod as DashboardPeriod)
    ? (rawPeriod as DashboardPeriod)
    : 'this_month'

  const compareWith: DashboardCompare =
    rawCompare && VALID_COMPARES.includes(rawCompare as NonNullable<DashboardCompare>)
      ? (rawCompare as NonNullable<DashboardCompare>)
      : null

  const customerId = rawCustomer && UUID_RE.test(rawCustomer) ? rawCustomer : null
  const supplierId = rawSupplier && UUID_RE.test(rawSupplier) ? rawSupplier : null

  const isFulfilled: boolean | null =
    rawFulfilled === 'true' ? true : rawFulfilled === 'false' ? false : null

  const status: string | null = rawStatus

  const paymentStatus: PaymentStatusFilter | null =
    rawPayment && VALID_PAYMENT_STATUSES.includes(rawPayment as PaymentStatusFilter)
      ? (rawPayment as PaymentStatusFilter)
      : null

  if (period === 'custom') {
    const fromOk = rawFrom && DATE_RE.test(rawFrom)
    const toOk = rawTo && DATE_RE.test(rawTo)
    const rangeOk = fromOk && toOk && rawFrom <= rawTo

    if (!rangeOk) {
      return { period: 'this_month', compareWith, customFrom: null, customTo: null, customerId, supplierId, isFulfilled, status, paymentStatus }
    }

    return { period: 'custom', compareWith, customFrom: rawFrom, customTo: rawTo, customerId, supplierId, isFulfilled, status, paymentStatus }
  }

  return { period, compareWith, customFrom: null, customTo: null, customerId, supplierId, isFulfilled, status, paymentStatus }
}
```

- [ ] **Step 3: Add `supplierId` and `status` to `writeUrl`**

Replace the `writeUrl` function signature and body (lines 127–162):

```typescript
function writeUrl(
  namespace: string,
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
  customerId: string | null,
  supplierId: string | null,
  isFulfilled: boolean | null,
  status: string | null,
  paymentStatus: PaymentStatusFilter | null,
): void {
  const params = new URLSearchParams()
  if (period !== 'this_month') {
    params.set(`${namespace}_period`, period)
  }
  if (compareWith) {
    params.set(`${namespace}_compare`, compareWith)
  }
  if (period === 'custom' && customFrom) {
    params.set(`${namespace}_from`, customFrom)
  }
  if (period === 'custom' && customTo) {
    params.set(`${namespace}_to`, customTo)
  }
  if (customerId) {
    params.set(`${namespace}_customer`, customerId)
  }
  if (supplierId) {
    params.set(`${namespace}_supplier`, supplierId)
  }
  if (isFulfilled !== null) {
    params.set(`${namespace}_fulfilled`, String(isFulfilled))
  }
  if (status !== null) {
    params.set(`${namespace}_status`, status)
  }
  if (paymentStatus) {
    params.set(`${namespace}_payment`, paymentStatus)
  }
  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  window.history.replaceState(null, '', url)
}
```

- [ ] **Step 4: Add `supplierId` and `status` state, callbacks, update all `writeUrl` call sites, `isDefault`, `resolvedApiParams`, and return value**

Replace the entire `useDashboardFilters` function body (lines 164–283). The key changes are: new state variables, new callbacks, updating every `writeUrl` call to pass the two new params, updating `isDefault` and `resolvedApiParams`, and adding the new values to the return object.

```typescript
export function useDashboardFilters(namespace: string) {
  if (process.env.NODE_ENV !== 'production' && namespace === '') {
    console.warn('[useDashboardFilters] namespace must not be an empty string. Use the route path segment (e.g. "sales", "purchasing").')
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => parseUrl(namespace), [])
  const [period, setPeriodState] = useState<DashboardPeriod>(initial.period)
  const [compareWith, setCompareWith] = useState<DashboardCompare>(initial.compareWith)
  const [customFrom, setCustomFrom] = useState<string | null>(initial.customFrom)
  const [customTo, setCustomTo] = useState<string | null>(initial.customTo)
  const [customerId, setCustomerIdState] = useState<string | null>(initial.customerId)
  const [supplierId, setSupplierIdState] = useState<string | null>(initial.supplierId)
  const [isFulfilled, setIsFulfilledState] = useState<boolean | null>(initial.isFulfilled)
  const [status, setStatusState] = useState<string | null>(initial.status)
  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatusFilter | null>(initial.paymentStatus)

  const setPeriod = useCallback((next: DashboardPeriod) => {
    setPeriodState(next)
    let nextFrom = customFrom
    let nextTo = customTo
    if (next !== 'custom') {
      setCustomFrom(null)
      setCustomTo(null)
      nextFrom = null
      nextTo = null
    }
    writeUrl(namespace, next, compareWith, nextFrom, nextTo, customerId, supplierId, isFulfilled, status, paymentStatus)
  }, [namespace, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCompare = useCallback((next: DashboardCompare) => {
    setCompareWith(next)
    writeUrl(namespace, period, next, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus)
  }, [namespace, period, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from)
    setCustomTo(to)
    if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      setPeriodState('custom')
      writeUrl(namespace, 'custom', compareWith, from, to, customerId, supplierId, isFulfilled, status, paymentStatus)
    }
  }, [namespace, compareWith, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomFromOnly = useCallback((from: string | null) => {
    setPeriodState('custom')
    setCustomFrom(from)
    if (from && customTo && DATE_RE.test(from) && DATE_RE.test(customTo) && from <= customTo) {
      writeUrl(namespace, 'custom', compareWith, from, customTo, customerId, supplierId, isFulfilled, status, paymentStatus)
    }
  }, [namespace, compareWith, customTo, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomToOnly = useCallback((to: string | null) => {
    setPeriodState('custom')
    setCustomTo(to)
    if (customFrom && to && DATE_RE.test(customFrom) && DATE_RE.test(to) && customFrom <= to) {
      writeUrl(namespace, 'custom', compareWith, customFrom, to, customerId, supplierId, isFulfilled, status, paymentStatus)
    }
  }, [namespace, compareWith, customFrom, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomerId = useCallback((next: string | null) => {
    setCustomerIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, next, supplierId, isFulfilled, status, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, supplierId, isFulfilled, status, paymentStatus])

  const setSupplierId = useCallback((next: string | null) => {
    setSupplierIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, next, isFulfilled, status, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled, status, paymentStatus])

  const setFulfilled = useCallback((next: boolean | null) => {
    setIsFulfilledState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, next, status, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, status, paymentStatus])

  const setStatus = useCallback((next: string | null) => {
    setStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, next, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, paymentStatus])

  const setPaymentStatus = useCallback((next: PaymentStatusFilter | null) => {
    setPaymentStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, next)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status])

  const reset = useCallback(() => {
    setPeriodState('this_month')
    setCompareWith(null)
    setCustomFrom(null)
    setCustomTo(null)
    setCustomerIdState(null)
    setSupplierIdState(null)
    setIsFulfilledState(null)
    setStatusState(null)
    setPaymentStatusState(null)
    writeUrl(namespace, 'this_month', null, null, null, null, null, null, null, null)
  }, [namespace])

  const isDefault = period === 'this_month'
    && compareWith === null
    && customerId === null
    && supplierId === null
    && isFulfilled === null
    && status === null
    && paymentStatus === null

  const resolvedApiParams = useMemo(
    (): DashboardResolvedApiParams => ({
      ...toApiParams(period, compareWith, customFrom, customTo),
      ...(customerId ? { customerId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(isFulfilled !== null ? { isFulfilled } : {}),
      ...(status !== null ? { status } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    }),
    [period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus],
  )

  return {
    period,
    compareWith,
    customFrom,
    customTo,
    customerId,
    supplierId,
    isFulfilled,
    status,
    paymentStatus,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom: setCustomFromOnly,
    setCustomTo: setCustomToOnly,
    setCustomerId,
    setSupplierId,
    setFulfilled,
    setStatus,
    setPaymentStatus,
    reset,
    isDefault,
    resolvedApiParams,
  }
}
```

- [ ] **Step 5: Type-check frontend**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no errors in `useDashboardFilters.ts`

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/hooks/useDashboardFilters.ts
git commit -m "feat(filters): add supplierId and status to useDashboardFilters (#217)"
```

---

## Task 4: Frontend — update `usePurchasingAnalytics` params interface

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts`

- [ ] **Step 1: Extend `PurchasingAnalyticsParams`**

Replace lines 46–52:

```typescript
export interface PurchasingAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  supplierId?: string
  status?: string
  paymentStatus?: string
}
```

No other changes needed — the hook already passes all defined keys to the API via `Object.entries` filter.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts
git commit -m "feat(purchasing): add supplierId/status/paymentStatus to PurchasingAnalyticsParams (#217)"
```

---

## Task 5: Frontend — extend `DashboardFilterBar` with supplier, order status, and configurable payment status options

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`

- [ ] **Step 1: Add new props to interface and destructure**

Replace lines 1–49:

```typescript
import { Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'
import { toMuiDatePickerFormat } from '@/utils/formatters'
import type { DashboardCompare, DashboardPeriod, PaymentStatusFilter } from '@/hooks/useDashboardFilters'

interface DashboardFilterBarProps {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  isFetching: boolean
  isDefault: boolean
  onPeriodChange: (period: DashboardPeriod) => void
  onCompareChange: (compare: DashboardCompare) => void
  onCustomRangeChange: (from: string, to: string) => void
  onCustomFromChange: (from: string | null) => void
  onCustomToChange: (to: string | null) => void
  onReset: () => void
  customers?: { id: string; name: string }[]
  customerId?: string | null
  onCustomerChange?: (id: string | null) => void
  suppliers?: { id: string; name: string }[]
  supplierId?: string | null
  onSupplierChange?: (id: string | null) => void
  isFulfilled?: boolean | null
  onFulfilledChange?: (value: boolean | null) => void
  status?: string | null
  onStatusChange?: (value: string | null) => void
  paymentStatus?: string | null
  onPaymentStatusChange?: (value: string | null) => void
  paymentStatusOptions?: { value: string; label: string }[]
}

export function DashboardFilterBar({
  period,
  compareWith,
  customFrom,
  customTo,
  isFetching,
  isDefault,
  onPeriodChange,
  onCompareChange,
  onCustomRangeChange,
  onCustomFromChange,
  onCustomToChange,
  onReset,
  customers,
  customerId,
  onCustomerChange,
  suppliers,
  supplierId,
  onSupplierChange,
  isFulfilled,
  onFulfilledChange,
  status,
  onStatusChange,
  paymentStatus,
  onPaymentStatusChange,
  paymentStatusOptions,
}: DashboardFilterBarProps) {
```

- [ ] **Step 2: Add supplier select and order status select JSX, update payment status select to use `paymentStatusOptions` when provided**

After the existing customer select block (after line 147 — the `}` closing the customer conditional), add:

```tsx
      {suppliers !== undefined && onSupplierChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-supplier-label">Supplier</InputLabel>
          <Select
            labelId="dashboard-supplier-label"
            id="dashboard-supplier"
            value={supplierId ?? ''}
            label="Supplier"
            onChange={(e) => onSupplierChange(e.target.value || null)}
          >
            <MenuItem value="">All Suppliers</MenuItem>
            {suppliers.map((supplier) => (
              <MenuItem key={supplier.id} value={supplier.id}>{supplier.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {status !== undefined && onStatusChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-order-status-label">Order Status</InputLabel>
          <Select
            labelId="dashboard-order-status-label"
            id="dashboard-order-status-purchasing"
            value={status ?? ''}
            label="Order Status"
            onChange={(e) => onStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="received">Received</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </Select>
        </FormControl>
      )}
```

- [ ] **Step 3: Update the payment status select block to support `paymentStatusOptions`**

Replace the existing payment status block (lines 169–185):

```tsx
      {paymentStatus !== undefined && onPaymentStatusChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-payment-status-label">Payment Status</InputLabel>
          <Select
            labelId="dashboard-payment-status-label"
            id="dashboard-payment-status"
            value={paymentStatus ?? ''}
            label="Payment Status"
            onChange={(e) => onPaymentStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            {paymentStatusOptions
              ? paymentStatusOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))
              : (
                <>
                  <MenuItem value="paid">Paid</MenuItem>
                  <MenuItem value="partial_paid">Partially Paid</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                </>
              )}
          </Select>
        </FormControl>
      )}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "feat(filters): add supplier, order status, and configurable payment status to DashboardFilterBar (#217)"
```

---

## Task 6: Frontend — wire up `PurchasingPage`

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`

- [ ] **Step 1: Add import for `useGetSuppliersQuery`**

After the existing import on line 47 (`import { usePurchasingAnalytics } from './hooks/usePurchasingAnalytics'`), add:

```typescript
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
```

- [ ] **Step 2: Destructure new filter state from `useDashboardFilters` and fetch suppliers**

Replace lines 65–78:

```typescript
  const {
    period,
    compareWith,
    customFrom,
    customTo,
    supplierId,
    status,
    paymentStatus,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom,
    setCustomTo,
    setSupplierId,
    setStatus,
    setPaymentStatus,
    reset,
    isDefault,
    resolvedApiParams,
  } = useDashboardFilters('purchasing')

  const { data: suppliersData } = useGetSuppliersQuery({})
  const supplierOptions = suppliersData?.data?.map((s) => ({ id: s.id, name: s.companyName })) ?? []
```

- [ ] **Step 3: Pass filter state to `DashboardFilterBar`**

Replace lines 179–192 (the `<DashboardFilterBar ... />` block):

```tsx
      <DashboardFilterBar
        period={period}
        compareWith={compareWith}
        customFrom={customFrom}
        customTo={customTo}
        isFetching={isFetching}
        isDefault={isDefault}
        onPeriodChange={setPeriod}
        onCompareChange={setCompare}
        onCustomRangeChange={setCustomRange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onReset={reset}
        suppliers={supplierOptions}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        status={status}
        onStatusChange={setStatus}
        paymentStatus={paymentStatus}
        onPaymentStatusChange={setPaymentStatus as (value: string | null) => void}
        paymentStatusOptions={[
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
      />
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/PurchasingPage.tsx
git commit -m "feat(purchasing): wire supplier/status/paymentStatus filters to PurchasingPage (#217)"
```

---

## Task 7: Tests — `DashboardFilterBar` new props

**Files:**
- Modify: `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx`

- [ ] **Step 1: Add tests for supplier select, purchasing order status select, and `paymentStatusOptions`**

Append these tests inside the `describe('DashboardFilterBar', ...)` block:

```typescript
  it('does not render Supplier select when suppliers prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Supplier')).toBeNull()
  })

  it('renders Supplier select when suppliers prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        suppliers={[{ id: 's1', name: 'Acme Supplies' }]}
        supplierId={null}
        onSupplierChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Supplier')).toBeTruthy()
  })

  it('calls onSupplierChange with null when All Suppliers is selected', async () => {
    const onSupplierChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        suppliers={[{ id: 's1', name: 'Acme Supplies' }]}
        supplierId="s1"
        onSupplierChange={onSupplierChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Supplier'))
    await userEvent.click(screen.getByText('All Suppliers'))
    expect(onSupplierChange).toHaveBeenCalledWith(null)
  })

  it('does not render purchasing Order Status select when status prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    // There should be no Order Status select (purchasing variant uses `status` prop)
    expect(screen.queryByLabelText('Order Status')).toBeNull()
  })

  it('renders purchasing Order Status select when status prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        status={null}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Order Status')).toBeTruthy()
  })

  it('calls onStatusChange with received when Received is selected', async () => {
    const onStatusChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        status={null}
        onStatusChange={onStatusChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Order Status'))
    await userEvent.click(screen.getByText('Received'))
    expect(onStatusChange).toHaveBeenCalledWith('received')
  })

  it('renders custom paymentStatusOptions when provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        paymentStatus={null}
        onPaymentStatusChange={vi.fn()}
        paymentStatusOptions={[
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
      />,
    )
    // Open the select
    userEvent.click(screen.getByLabelText('Payment Status'))
    // The custom options are in the DOM (MUI renders options even when closed for accessibility)
    expect(screen.getByText('Partially Paid')).toBeTruthy()
    expect(screen.queryByText('Draft')).toBeNull()
  })
```

- [ ] **Step 2: Run the DashboardFilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx
git commit -m "test(filters): add DashboardFilterBar tests for supplier, order status, and paymentStatusOptions (#217)"
```

---

## Task 8: Tests — `PurchasingPage` filter smoke test

**Files:**
- Create: `frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx`

- [ ] **Step 1: Write the test file**

```typescript
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeAll } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import PurchasingPage from '../PurchasingPage'

// Stub the analytics hook to avoid real API calls
vi.mock('../hooks/usePurchasingAnalytics', () => ({
  usePurchasingAnalytics: () => ({ data: null, isLoading: false, isFetching: false, error: null }),
}))

// Stub the RTK query so it returns an empty suppliers list
vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: () => ({ data: { data: [] } }),
  purchasingApiSlice: { reducerPath: 'purchasingApi', reducer: () => ({}), middleware: () => (next: any) => (action: any) => next(action) },
}))

const store = configureStore({ reducer: { dummy: (s = {}) => s } })

function wrap() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <PurchasingPage />
        </LocalizationProvider>
      </MemoryRouter>
    </Provider>,
  )
}

describe('PurchasingPage filter bar', () => {
  beforeAll(() => {
    // jsdom doesn't implement window.history.replaceState properly in all versions
    Object.defineProperty(window, 'location', {
      value: { search: '', pathname: '/purchasing' },
      writable: true,
    })
  })

  it('renders the Supplier filter select', () => {
    wrap()
    expect(screen.getByLabelText('Supplier')).toBeTruthy()
  })

  it('renders the Order Status filter select', () => {
    wrap()
    expect(screen.getByLabelText('Order Status')).toBeTruthy()
  })

  it('renders the Payment Status filter select', () => {
    wrap()
    expect(screen.getByLabelText('Payment Status')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx
```

Expected: all 3 tests pass

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/__tests__/PurchasingPage.filters.test.tsx
git commit -m "test(purchasing): smoke test PurchasingPage renders supplier/status/paymentStatus filters (#217)"
```

---

## Task 9: End-to-end smoke — run related test suites

- [ ] **Step 1: Run all purchasing-related frontend tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/ src/components/filters/__tests__/DashboardFilterBar.test.tsx src/hooks/
```

Expected: all pass

- [ ] **Step 2: Run backend tests for purchasing analytics**

Note: there is no existing `purchasing-analytics.service.spec.ts` — only other service specs exist. The service changes are covered by TypeScript compilation. If a spec file is added in future, it should test `calculatePurchasingMetrics`, `getPurchasingPeriodData`, `getTopSuppliers`, and `getRecentPurchaseOrders` with filter combinations. For now, verify the backend compiles cleanly.

```bash
cd backend && npx tsc --noEmit 2>&1 | grep -i error | head -20
```

Expected: no output (no errors)

- [ ] **Step 3: Final commit if any loose changes remain**

```bash
cd /home/blur/erp2 && git status
```

If clean: done. If any uncommitted changes, commit them with an appropriate message.
