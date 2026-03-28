# Sales Overview Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Customer, Order Status (Fulfillment), and Payment Status filters to the Sales Overview dashboard, applied to all sections, with URL persistence.

**Architecture:** Extend `SalesAnalyticsQueryDto` with `isFulfilled` and `paymentStatus` fields, propagate them through all four private service methods, extend `useDashboardFilters` hook with three new URL-persisted state values, and add three new optional MUI Select dropdowns to `DashboardFilterBar`.

**Tech Stack:** NestJS 11 (backend), TypeORM query builder, class-validator/class-transformer, React 19, MUI v7, RTK Query, Vitest (frontend), Jest (backend).

---

## File Map

**Modified (backend):**
- `backend/src/modules/sales/dto/sales-analytics.dto.ts` — add `isFulfilled` and `paymentStatus` to `SalesAnalyticsQueryDto`
- `backend/src/modules/sales/controllers/sales-analytics.controller.ts` — add `@ApiQuery` decorators
- `backend/src/modules/sales/services/sales-analytics.service.ts` — apply new filters in all four private methods

**Modified (frontend):**
- `frontend/src/hooks/useDashboardFilters.ts` — add `customerId`, `isFulfilled`, `paymentStatus` state + URL + setters
- `frontend/src/components/dashboard/DashboardFilterBar.tsx` — add three optional Select controls
- `frontend/src/pages/sales/hooks/useDashboardAnalytics.ts` — extend `DashboardAnalyticsParams` interface
- `frontend/src/pages/sales/SalesPage.tsx` — fetch customers, wire new filter state to filter bar

**Modified (tests):**
- `backend/src/modules/sales/services/sales-analytics.service.spec.ts` — new filter tests
- `frontend/src/hooks/useDashboardFilters.test.ts` — new URL param tests
- `frontend/src/components/dashboard/DashboardFilterBar.test.tsx` — new select rendering tests (create if missing)

---

## Task 1: Add `isFulfilled` and `paymentStatus` to DTO + Controller

**Files:**
- Modify: `backend/src/modules/sales/dto/sales-analytics.dto.ts`
- Modify: `backend/src/modules/sales/controllers/sales-analytics.controller.ts`

- [ ] **Step 1: Write the failing DTO validation test**

Add to `backend/src/modules/sales/services/sales-analytics.service.spec.ts` inside the existing `describe('SalesAnalyticsService', ...)` block:

```ts
describe('SalesAnalyticsQueryDto validation', () => {
  it('accepts isFulfilled=true as boolean after transform', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { SalesAnalyticsQueryDto } = await import('../dto/sales-analytics.dto');
    const dto = plainToInstance(SalesAnalyticsQueryDto, { isFulfilled: 'true' });
    const errors = await validate(dto);
    expect(errors.filter(e => e.property === 'isFulfilled')).toHaveLength(0);
    expect(dto.isFulfilled).toBe(true);
  });

  it('accepts paymentStatus=paid as valid InvoiceStatus', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { SalesAnalyticsQueryDto } = await import('../dto/sales-analytics.dto');
    const dto = plainToInstance(SalesAnalyticsQueryDto, { paymentStatus: 'paid' });
    const errors = await validate(dto);
    expect(errors.filter(e => e.property === 'paymentStatus')).toHaveLength(0);
    expect(dto.paymentStatus).toBe('paid');
  });

  it('rejects paymentStatus=invalid', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { SalesAnalyticsQueryDto } = await import('../dto/sales-analytics.dto');
    const dto = plainToInstance(SalesAnalyticsQueryDto, { paymentStatus: 'invalid' });
    const errors = await validate(dto);
    expect(errors.filter(e => e.property === 'paymentStatus')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "SalesAnalyticsQueryDto"
```

Expected: FAIL — `isFulfilled` and `paymentStatus` don't exist on DTO yet.

- [ ] **Step 3: Add the two fields to `SalesAnalyticsQueryDto`**

Open `backend/src/modules/sales/dto/sales-analytics.dto.ts`. At the top, add `InvoiceStatus` to the imports:

```ts
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
```

> Note: `Invoice` may already be imported elsewhere in the file — if so, just add `InvoiceStatus` to the existing import.

Then add these two fields at the end of the `SalesAnalyticsQueryDto` class (after `compareWith`):

```ts
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

- [ ] **Step 4: Add `@ApiQuery` decorators to the controller**

Open `backend/src/modules/sales/controllers/sales-analytics.controller.ts`. Find the `getSalesAnalytics` endpoint decorators and add after the existing `compareWith` `@ApiQuery`:

```ts
  @ApiQuery({ name: 'isFulfilled', required: false, description: 'Filter by fulfillment status (true/false)' })
  @ApiQuery({ name: 'paymentStatus', required: false, enum: InvoiceStatus, description: 'Filter by invoice payment status' })
```

Also add `InvoiceStatus` to the imports at the top of the controller file:

```ts
import { InvoiceStatus } from '../../../database/entities/invoice.entity';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "SalesAnalyticsQueryDto"
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/sales/dto/sales-analytics.dto.ts \
        backend/src/modules/sales/controllers/sales-analytics.controller.ts \
        backend/src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "feat(sales): add isFulfilled and paymentStatus to SalesAnalyticsQueryDto"
```

---

## Task 2: Apply new filters in `calculateSalesMetrics`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts`
- Modify: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write the failing service test**

Add to `sales-analytics.service.spec.ts` inside `describe('SalesAnalyticsService', ...)`:

```ts
describe('getSalesAnalytics filter propagation', () => {
  function makeChainMock(rawOne: object = {}, rawMany: object[] = []) {
    const chain: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ totalRevenue: '0', totalOrders: '0', averageOrderValue: '0', completedOrders: '0', confirmedOrders: '0', draftOrders: '0', paidInvoicesAmount: '0', pendingInvoicesAmount: '0', overdueInvoicesAmount: '0', ...rawOne }),
      getRawMany: jest.fn().mockResolvedValue(rawMany),
      getCount: jest.fn().mockResolvedValue(0),
    };
    return chain;
  }

  it('applies isFulfilled filter to orderQuery in calculateSalesMetrics', async () => {
    const orderChain = makeChainMock();
    const invoiceChain = makeChainMock();
    const customerChain = makeChainMock();
    const paymentChain = makeChainMock();

    // Inject mocks via service's repositories
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(orderChain);
    (service as any).invoiceRepository.createQueryBuilder = jest.fn().mockReturnValue(invoiceChain);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerChain);
    (service as any).paymentRepository.createQueryBuilder = jest.fn().mockReturnValue(paymentChain);
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(makeChainMock({}, []));

    await service.getSalesAnalytics({
      isFulfilled: true,
      dateRange: undefined,
    } as any);

    expect(orderChain.andWhere).toHaveBeenCalledWith(
      'order.isFulfilled = :isFulfilled',
      { isFulfilled: true },
    );
  });

  it('applies paymentStatus filter to invoiceQuery in calculateSalesMetrics', async () => {
    const orderChain = makeChainMock();
    const invoiceChain = makeChainMock();
    const customerChain = makeChainMock();
    const paymentChain = makeChainMock();

    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(orderChain);
    (service as any).invoiceRepository.createQueryBuilder = jest.fn().mockReturnValue(invoiceChain);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerChain);
    (service as any).paymentRepository.createQueryBuilder = jest.fn().mockReturnValue(paymentChain);
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(makeChainMock({}, []));

    await service.getSalesAnalytics({
      paymentStatus: 'paid' as any,
      dateRange: undefined,
    } as any);

    expect(invoiceChain.andWhere).toHaveBeenCalledWith(
      'invoice.status = :paymentStatus',
      { paymentStatus: 'paid' },
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getSalesAnalytics filter propagation"
```

Expected: FAIL — `andWhere` not called with new filter args.

- [ ] **Step 3: Apply filters in `calculateSalesMetrics`**

In `backend/src/modules/sales/services/sales-analytics.service.ts`, find `calculateSalesMetrics`. After the existing `if (query?.salesRepId)` block (around line 338), add:

```ts
    if (query?.isFulfilled !== undefined) {
      orderQuery = orderQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    if (query?.paymentStatus) {
      invoiceQuery = invoiceQuery.andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getSalesAnalytics filter propagation"
```

Expected: 2 tests PASS.

- [ ] **Step 5: Run the full service spec to check for regressions**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage
```

Expected: All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/sales/services/sales-analytics.service.ts \
        backend/src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "feat(sales): apply isFulfilled and paymentStatus filters in calculateSalesMetrics"
```

---

## Task 3: Propagate filters to `getPeriodData`, `getTopCustomers`, `getTopProducts`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts`
- Modify: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `sales-analytics.service.spec.ts` inside `describe('getSalesAnalytics filter propagation', ...)`:

```ts
  it('applies isFulfilled filter to getPeriodData orderQuery', async () => {
    const orderChain = makeChainMock({}, []);
    const invoiceChain = makeChainMock();
    const customerChain = makeChainMock({}, []);
    const paymentChain = makeChainMock();

    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(orderChain);
    (service as any).invoiceRepository.createQueryBuilder = jest.fn().mockReturnValue(invoiceChain);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerChain);
    (service as any).paymentRepository.createQueryBuilder = jest.fn().mockReturnValue(paymentChain);
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(makeChainMock({}, []));

    await service.getSalesAnalytics({
      isFulfilled: false,
      dateRange: undefined,
    } as any);

    // andWhere for isFulfilled should appear at least twice: once in calculateSalesMetrics, once in getPeriodData
    const calls = orderChain.andWhere.mock.calls.filter(
      (args: any[]) => args[0] === 'order.isFulfilled = :isFulfilled',
    );
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('applies isFulfilled filter to getTopCustomers orderQuery', async () => {
    const orderChain = makeChainMock({}, []);
    const invoiceChain = makeChainMock();
    const customerChain = makeChainMock({}, []);
    const paymentChain = makeChainMock();

    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(orderChain);
    (service as any).invoiceRepository.createQueryBuilder = jest.fn().mockReturnValue(invoiceChain);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerChain);
    (service as any).paymentRepository.createQueryBuilder = jest.fn().mockReturnValue(paymentChain);
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(makeChainMock({}, []));

    await service.getSalesAnalytics({
      isFulfilled: true,
      dateRange: undefined,
    } as any);

    // Count all andWhere calls with isFulfilled across all query builders
    const orderCalls = orderChain.andWhere.mock.calls.filter(
      (args: any[]) => args[0] === 'order.isFulfilled = :isFulfilled',
    );
    // getTopCustomers and getTopProducts both use salesOrderRepository
    expect(orderCalls.length).toBeGreaterThanOrEqual(3);
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "applies isFulfilled filter to getPeriodData"
```

Expected: FAIL.

- [ ] **Step 3: Update method signatures and calls in `getSalesAnalytics`**

In `sales-analytics.service.ts`, update the `getSalesAnalytics` method to pass `query` to the four methods. Find (around line 53):

```ts
    const [metrics, periodData, topCustomers, topProducts] = await Promise.all([
      this.calculateSalesMetrics(startDate, endDate, query),
      this.getPeriodData(startDate, endDate, groupBy),
      this.getTopCustomers(startDate, endDate, 10),
      this.getTopProducts(startDate, endDate, 10),
    ]);
```

Replace with:

```ts
    const [metrics, periodData, topCustomers, topProducts] = await Promise.all([
      this.calculateSalesMetrics(startDate, endDate, query),
      this.getPeriodData(startDate, endDate, groupBy, query),
      this.getTopCustomers(startDate, endDate, 10, query),
      this.getTopProducts(startDate, endDate, 10, query),
    ]);
```

- [ ] **Step 4: Update `getPeriodData` signature and add filter**

Find `private async getPeriodData(startDate: Date, endDate: Date, groupBy: string)` and change to:

```ts
  private async getPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: string,
    query?: SalesAnalyticsQueryDto,
  ): Promise<PeriodMetricDto[]> {
```

Inside the method, after the existing `.where('order.orderDate BETWEEN :startDate AND :endDate', ...)` call on the `salesOrderRepository` query builder, add the filter. The query builder chain starts like:

```ts
    const data = await this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
```

Change it to:

```ts
    let periodQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (query?.isFulfilled !== undefined) {
      periodQuery = periodQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    const data = await periodQuery
      .select([
```

> Note: Remove the `const data = await this.salesOrderRepository` line and replace with the above pattern. Keep all existing `.select(...)`, `.groupBy(...)`, `.orderBy(...)`, `.getRawMany()` calls attached to `periodQuery` instead.

- [ ] **Step 5: Update `getTopCustomers` signature and add filter**

Find `private async getTopCustomers(startDate: Date, endDate: Date, limit: number)` and change to:

```ts
  private async getTopCustomers(
    startDate: Date,
    endDate: Date,
    limit: number,
    query?: SalesAnalyticsQueryDto,
  ): Promise<TopCustomerDto[]> {
```

Inside the method, after `.where('order.orderDate BETWEEN :startDate AND :endDate', ...)`, add:

```ts
    let topCustomersQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (query?.isFulfilled !== undefined) {
      topCustomersQuery = topCustomersQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    const data = await topCustomersQuery
      .select([
```

> Remove the original `const data = await this.salesOrderRepository...` and replace with the above, keeping all existing `.select(...)`, `.groupBy(...)`, `.addGroupBy(...)`, `.orderBy(...)`, `.limit(...)`, `.getRawMany()` calls.

- [ ] **Step 6: Update `getTopProducts` signature and add filter**

Find `private async getTopProducts(startDate: Date, endDate: Date, limit: number)` and change to:

```ts
  private async getTopProducts(
    startDate: Date,
    endDate: Date,
    limit: number,
    query?: SalesAnalyticsQueryDto,
  ): Promise<TopProductDto[]> {
```

Inside the method, after `.where('order.orderDate BETWEEN :startDate AND :endDate', ...)`, add:

```ts
    let topProductsQuery = this.salesOrderItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.product', 'product')
      .leftJoin('item.salesOrder', 'order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (query?.isFulfilled !== undefined) {
      topProductsQuery = topProductsQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    const data = await topProductsQuery
      .select([
```

> Remove the original `const data = await this.salesOrderItemRepository...` and replace with the above, keeping all existing `.select(...)`, `.groupBy(...)`, `.addGroupBy(...)`, `.orderBy(...)`, `.limit(...)`, `.getRawMany()` calls.

- [ ] **Step 7: Run all service tests**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/sales/services/sales-analytics.service.ts \
        backend/src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "feat(sales): propagate isFulfilled filter to getPeriodData, getTopCustomers, getTopProducts"
```

---

## Task 4: Extend `useDashboardFilters` hook with three new URL-persisted filters

**Files:**
- Modify: `frontend/src/hooks/useDashboardFilters.ts`
- Modify: `frontend/src/hooks/useDashboardFilters.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/hooks/useDashboardFilters.test.ts`:

```ts
describe('new filters: customerId, isFulfilled, paymentStatus', () => {
  it('returns null for all three when URL is empty', () => {
    setUrl('')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.customerId).toBeNull()
    expect(result.current.isFulfilled).toBeNull()
    expect(result.current.paymentStatus).toBeNull()
  })

  it('reads customerId from URL on mount', () => {
    setUrl('?sales_customer=abc-123')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.customerId).toBe('abc-123')
  })

  it('reads isFulfilled=true from URL on mount', () => {
    setUrl('?sales_fulfilled=true')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.isFulfilled).toBe(true)
  })

  it('reads isFulfilled=false from URL on mount', () => {
    setUrl('?sales_fulfilled=false')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.isFulfilled).toBe(false)
  })

  it('reads paymentStatus from URL on mount', () => {
    setUrl('?sales_payment=paid')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.paymentStatus).toBe('paid')
  })

  it('ignores invalid paymentStatus value', () => {
    setUrl('?sales_payment=garbage')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.paymentStatus).toBeNull()
  })

  it('setCustomerId writes to URL and updates state', () => {
    setUrl('')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    act(() => { result.current.setCustomerId('uuid-999') })
    expect(result.current.customerId).toBe('uuid-999')
    const replaceState = (window.history.replaceState as ReturnType<typeof vi.fn>)
    expect(replaceState).toHaveBeenCalled()
  })

  it('reset clears all three new filters', () => {
    setUrl('?sales_customer=abc&sales_fulfilled=true&sales_payment=paid')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    act(() => { result.current.reset() })
    expect(result.current.customerId).toBeNull()
    expect(result.current.isFulfilled).toBeNull()
    expect(result.current.paymentStatus).toBeNull()
  })

  it('isDefault is false when customerId is set', () => {
    setUrl('?sales_customer=abc')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.isDefault).toBe(false)
  })

  it('resolvedApiParams includes customerId when set', () => {
    setUrl('?sales_customer=abc-123')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.customerId).toBe('abc-123')
  })

  it('resolvedApiParams includes isFulfilled when set', () => {
    setUrl('?sales_fulfilled=true')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.isFulfilled).toBe(true)
  })

  it('resolvedApiParams includes paymentStatus when set', () => {
    setUrl('?sales_payment=partial_paid')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.paymentStatus).toBe('partial_paid')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts
```

Expected: New tests FAIL — `customerId`, `isFulfilled`, `paymentStatus` not yet on the hook.

- [ ] **Step 3: Implement the changes in `useDashboardFilters.ts`**

**3a.** Add a type at the top of the file (after the existing type exports):

```ts
export type PaymentStatusFilter = 'draft' | 'partial_paid' | 'paid'
const VALID_PAYMENT_STATUSES: PaymentStatusFilter[] = ['draft', 'partial_paid', 'paid']
```

**3b.** Update `parseUrl` to return the three new fields. Add inside the function after `rawTo`:

```ts
  const rawCustomer = params.get(`${namespace}_customer`) ?? null
  const rawFulfilled = params.get(`${namespace}_fulfilled`)
  const rawPayment = params.get(`${namespace}_payment`)
```

And update the return type and return statements to include:

```ts
  customerId: string | null
  isFulfilled: boolean | null
  paymentStatus: PaymentStatusFilter | null
```

Return values:
```ts
  const customerId = rawCustomer  // no validation needed — backend validates UUID

  const isFulfilled: boolean | null =
    rawFulfilled === 'true' ? true : rawFulfilled === 'false' ? false : null

  const paymentStatus: PaymentStatusFilter | null =
    rawPayment && VALID_PAYMENT_STATUSES.includes(rawPayment as PaymentStatusFilter)
      ? (rawPayment as PaymentStatusFilter)
      : null
```

Add `customerId`, `isFulfilled`, `paymentStatus` to all return statements in `parseUrl` (both the early-return for invalid custom range and the normal return).

**3c.** Update `writeUrl` to accept and write the three new params. Change signature to:

```ts
function writeUrl(
  namespace: string,
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
  customerId: string | null,
  isFulfilled: boolean | null,
  paymentStatus: PaymentStatusFilter | null,
): void {
```

Inside `writeUrl`, after the existing params, add:

```ts
  if (customerId) params.set(`${namespace}_customer`, customerId)
  if (isFulfilled !== null) params.set(`${namespace}_fulfilled`, String(isFulfilled))
  if (paymentStatus) params.set(`${namespace}_payment`, paymentStatus)
```

**3d.** In the `useDashboardFilters` function body, add state:

```ts
  const [customerId, setCustomerIdState] = useState<string | null>(initial.customerId)
  const [isFulfilled, setIsFulfilledState] = useState<boolean | null>(initial.isFulfilled)
  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatusFilter | null>(initial.paymentStatus)
```

**3e.** Add setters (after existing setters):

```ts
  const setCustomerId = useCallback((next: string | null) => {
    setCustomerIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, next, isFulfilled, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, isFulfilled, paymentStatus])

  const setFulfilled = useCallback((next: boolean | null) => {
    setIsFulfilledState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, next, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, paymentStatus])

  const setPaymentStatus = useCallback((next: PaymentStatusFilter | null) => {
    setPaymentStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled, next)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled])
```

**3f.** Update `reset` to clear all three:

```ts
  const reset = useCallback(() => {
    setPeriodState('this_month')
    setCompareWith(null)
    setCustomFrom(null)
    setCustomTo(null)
    setCustomerIdState(null)
    setIsFulfilledState(null)
    setPaymentStatusState(null)
    writeUrl(namespace, 'this_month', null, null, null, null, null, null)
  }, [namespace])
```

**3g.** Update `isDefault`:

```ts
  const isDefault = period === 'this_month' && compareWith === null && customerId === null && isFulfilled === null && paymentStatus === null
```

**3h.** Update `resolvedApiParams` to include the three new params:

```ts
  const resolvedApiParams = useMemo(
    () => ({
      ...toApiParams(period, compareWith, customFrom, customTo),
      ...(customerId ? { customerId } : {}),
      ...(isFulfilled !== null ? { isFulfilled } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    }),
    [period, compareWith, customFrom, customTo, customerId, isFulfilled, paymentStatus],
  )
```

**3i.** Update all existing `writeUrl` calls throughout the function to pass the three new args. Find all calls to `writeUrl` in `setPeriod`, `setCompare`, `setCustomRange`, `setCustomFromOnly`, `setCustomToOnly` and add `, customerId, isFulfilled, paymentStatus` as the last three arguments (adjusting dependencies arrays accordingly).

**3j.** Add to the return value of `useDashboardFilters`:

```ts
    customerId,
    isFulfilled,
    paymentStatus,
    setCustomerId,
    setFulfilled,
    setPaymentStatus,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/hooks/useDashboardFilters.ts \
        frontend/src/hooks/useDashboardFilters.test.ts
git commit -m "feat(sales): add customerId, isFulfilled, paymentStatus to useDashboardFilters"
```

---

## Task 5: Extend `DashboardAnalyticsParams` interface

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useDashboardAnalytics.ts`

- [ ] **Step 1: Update the interface**

Open `frontend/src/pages/sales/hooks/useDashboardAnalytics.ts`. Find `DashboardAnalyticsParams` and add:

```ts
export interface DashboardAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  customerId?: string
  isFulfilled?: boolean
  paymentStatus?: string
}
```

No other changes needed — the params are forwarded via `Object.fromEntries(Object.entries(nextParams).filter(...))`.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/sales/hooks/useDashboardAnalytics.ts
git commit -m "feat(sales): extend DashboardAnalyticsParams with customerId, isFulfilled, paymentStatus"
```

---

## Task 6: Add three new filter controls to `DashboardFilterBar`

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardFilterBar.tsx`
- Create/Modify: `frontend/src/components/dashboard/DashboardFilterBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Check if `DashboardFilterBar.test.tsx` exists:
```bash
ls /home/blur/erp2/frontend/src/components/dashboard/
```

If it does not exist, create `frontend/src/components/dashboard/DashboardFilterBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import { DashboardFilterBar } from './DashboardFilterBar'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

function baseProps() {
  return {
    period: 'this_month' as const,
    compareWith: null,
    customFrom: null,
    customTo: null,
    isFetching: false,
    isDefault: true,
    onPeriodChange: vi.fn(),
    onCompareChange: vi.fn(),
    onCustomRangeChange: vi.fn(),
    onCustomFromChange: vi.fn(),
    onCustomToChange: vi.fn(),
    onReset: vi.fn(),
  }
}

function wrap(ui: React.ReactElement) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>{ui}</LocalizationProvider>
  )
}

describe('DashboardFilterBar', () => {
  it('does not render Customer select when customers prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Customer')).toBeNull()
  })

  it('does not render Order Status select when isFulfilled prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Order Status')).toBeNull()
  })

  it('does not render Payment Status select when paymentStatus prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Payment Status')).toBeNull()
  })

  it('renders Customer select when customers prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        customers={[{ id: 'c1', name: 'Acme Corp' }]}
        customerId={null}
        onCustomerChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Customer')).toBeTruthy()
  })

  it('renders Order Status select when isFulfilled prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        isFulfilled={null}
        onFulfilledChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Order Status')).toBeTruthy()
  })

  it('renders Payment Status select when paymentStatus prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        paymentStatus={null}
        onPaymentStatusChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Payment Status')).toBeTruthy()
  })

  it('calls onCustomerChange with null when All Customers is selected', async () => {
    const onCustomerChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        customers={[{ id: 'c1', name: 'Acme Corp' }]}
        customerId='c1'
        onCustomerChange={onCustomerChange}
      />
    )
    await userEvent.click(screen.getByLabelText('Customer'))
    await userEvent.click(screen.getByText('All Customers'))
    expect(onCustomerChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npx vitest run src/components/dashboard/DashboardFilterBar.test.tsx
```

Expected: FAIL — props don't exist yet.

- [ ] **Step 3: Add new props and controls to `DashboardFilterBar.tsx`**

Open `frontend/src/components/dashboard/DashboardFilterBar.tsx`.

**3a.** Add to the `DashboardFilterBarProps` interface:

```ts
  // Customer filter
  customers?: { id: string; name: string }[]
  customerId?: string | null
  onCustomerChange?: (id: string | null) => void
  // Order status filter
  isFulfilled?: boolean | null
  onFulfilledChange?: (value: boolean | null) => void
  // Payment status filter
  paymentStatus?: 'draft' | 'partial_paid' | 'paid' | null
  onPaymentStatusChange?: (value: 'draft' | 'partial_paid' | 'paid' | null) => void
```

**3b.** Destructure the new props in the function signature alongside the existing ones:

```ts
  customers,
  customerId,
  onCustomerChange,
  isFulfilled,
  onFulfilledChange,
  paymentStatus,
  onPaymentStatusChange,
```

**3c.** Add the three new selects in the JSX, between the existing Compare `</span>` and the `{ctx && ...}` block:

```tsx
      {customers !== undefined && onCustomerChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Customer</InputLabel>
          <Select
            value={customerId ?? ''}
            label="Customer"
            onChange={(e) => onCustomerChange(e.target.value || null)}
          >
            <MenuItem value="">All Customers</MenuItem>
            {customers.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {isFulfilled !== undefined && onFulfilledChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Order Status</InputLabel>
          <Select
            value={isFulfilled === null ? '' : String(isFulfilled)}
            label="Order Status"
            onChange={(e) => {
              const v = e.target.value
              onFulfilledChange(v === '' ? null : v === 'true')
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Fulfilled</MenuItem>
            <MenuItem value="false">Pending</MenuItem>
          </Select>
        </FormControl>
      )}

      {paymentStatus !== undefined && onPaymentStatusChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Payment Status</InputLabel>
          <Select
            value={paymentStatus ?? ''}
            label="Payment Status"
            onChange={(e) => onPaymentStatusChange((e.target.value || null) as 'draft' | 'partial_paid' | 'paid' | null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="partial_paid">Partially Paid</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
          </Select>
        </FormControl>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/dashboard/DashboardFilterBar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/components/dashboard/DashboardFilterBar.tsx \
        frontend/src/components/dashboard/DashboardFilterBar.test.tsx
git commit -m "feat(sales): add Customer, Order Status, Payment Status selects to DashboardFilterBar"
```

---

## Task 7: Wire everything together in `SalesPage`

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

- [ ] **Step 1: Add customer fetching and new filter wiring**

Open `frontend/src/pages/sales/SalesPage.tsx`.

**1a.** Add `useGetCustomersQuery` to the existing RTK Query imports. Find the import from `@/store/api/salesApi` (or wherever RTK hooks are imported) and add:

```ts
import { useGetCustomersQuery } from '@/store/api/salesApi'
```

**1b.** Inside the `SalesPage` component, after the existing `useDashboardFilters` destructuring, add:

```ts
  const {
    period,
    compareWith,
    customFrom,
    customTo,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom,
    setCustomTo,
    reset,
    isDefault,
    resolvedApiParams,
    customerId,
    isFulfilled,
    paymentStatus,
    setCustomerId,
    setFulfilled,
    setPaymentStatus,
  } = useDashboardFilters('sales')
```

> Replace the existing destructuring — just add the six new names to it.

**1c.** Add the customer query below the `useDashboardFilters` call:

```ts
  const { data: customersData } = useGetCustomersQuery({})
  const customerOptions = (customersData?.data ?? []).map((c: { id: string; name: string }) => ({
    id: c.id,
    name: c.name,
  }))
```

**1d.** Find the `<DashboardFilterBar ... />` JSX and add the new props:

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
        customers={customerOptions}
        customerId={customerId}
        onCustomerChange={setCustomerId}
        isFulfilled={isFulfilled}
        onFulfilledChange={setFulfilled}
        paymentStatus={paymentStatus}
        onPaymentStatusChange={setPaymentStatus}
      />
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npm run test
```

Expected: All tests PASS (no SalesPage test currently, so just ensure nothing regressed).

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "feat(sales): wire customer, order status, payment status filters in SalesPage"
```

---

## Task 8: Backend lint + full test run

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test
```

Expected: All tests PASS.

- [ ] **Step 2: Run lint**

```bash
cd backend && npm run lint
```

Expected: No errors.

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: All tests PASS.

- [ ] **Step 4: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: No errors.

- [ ] **Step 5: Final commit if any lint auto-fixes were applied**

```bash
cd /home/blur/erp2
git add -p  # stage only lint fixes if any
git commit -m "chore: lint fixes for sales filter feature"
```

> Skip this step if lint produced no changes.
