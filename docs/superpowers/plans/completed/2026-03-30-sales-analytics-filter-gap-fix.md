# Sales Analytics Filter Propagation & Gap Filling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `sales-analytics.service.ts` so that `getPeriodData`, `getTopCustomers`, and `getTopProducts` respect all query filters, and `getPeriodData` returns zero-filled entries for every period in the requested date range.

**Architecture:** Add missing `andWhere` filter conditions to three private methods (mirroring the pattern already used in `calculateSalesMetrics`), then extract a private `fillPeriodGaps` method that post-processes sparse DB results into a complete series. All changes are in a single service file; tests are added to the existing spec file.

**Tech Stack:** NestJS 11, TypeORM query builder, date-fns, Jest

---

## Files

- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts`
- Modify: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

---

### Task 1: Add missing filters to `getPeriodData`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts:442-459`
- Test: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write failing tests for `getPeriodData` filter propagation**

Open `backend/src/modules/sales/services/sales-analytics.service.spec.ts` and add a new `describe` block after the existing `SalesAnalyticsQueryDto validation` describe block:

```ts
describe('getPeriodData filter propagation', () => {
  function makeQbChain() {
    const qb: any = {};
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.leftJoin = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  }

  function makeCustomerQbChain() {
    const qb: any = {};
    qb.where = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  }

  const start = new Date('2026-03-01T00:00:00.000Z');
  const end = new Date('2026-03-31T23:59:59.999Z');

  it('applies customerId filter when provided', async () => {
    const qb = makeQbChain();
    const customerQb = makeCustomerQbChain();
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerQb);

    await (service as any).getPeriodData(start, end, 'month', { customerId: 'cust-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', { customerId: 'cust-1' });
  });

  it('applies salesRepId filter when provided', async () => {
    const qb = makeQbChain();
    const customerQb = makeCustomerQbChain();
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerQb);

    await (service as any).getPeriodData(start, end, 'month', { salesRepId: 'rep-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', { salesRepId: 'rep-1' });
  });

  it('applies paymentStatus filter with invoice join when provided', async () => {
    const qb = makeQbChain();
    const customerQb = makeCustomerQbChain();
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerQb);

    await (service as any).getPeriodData(start, end, 'month', { paymentStatus: 'paid' });

    expect(qb.leftJoin).toHaveBeenCalledWith('order.invoices', 'invoice');
    expect(qb.andWhere).toHaveBeenCalledWith('invoice.status = :paymentStatus', { paymentStatus: 'paid' });
  });

  it('applies no extra andWhere calls when query has no filters', async () => {
    const qb = makeQbChain();
    const customerQb = makeCustomerQbChain();
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
    (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(customerQb);

    await (service as any).getPeriodData(start, end, 'month', {});

    const andWhereCalls = qb.andWhere.mock.calls.map((c: any[]) => c[0] as string);
    expect(andWhereCalls).not.toContain(expect.stringContaining('customerId'));
    expect(andWhereCalls).not.toContain(expect.stringContaining('salesRepId'));
    expect(andWhereCalls).not.toContain(expect.stringContaining('paymentStatus'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getPeriodData filter propagation"
```

Expected: 3 failures (`customerId`, `salesRepId`, `paymentStatus` not applied yet). The 4th test (no filters) may pass already.

- [ ] **Step 3: Add missing filters to `getPeriodData` in the service**

In `backend/src/modules/sales/services/sales-analytics.service.ts`, find the `getPeriodData` method. After the existing `isFulfilled` block (around line 447), add:

```ts
    if (query?.customerId) {
      periodQuery = periodQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }

    if (query?.salesRepId) {
      periodQuery = periodQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }

    if (query?.paymentStatus) {
      periodQuery = periodQuery
        .leftJoin('order.invoices', 'invoice')
        .andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
    }
```

The full updated block (lines ~443–459) should look like:

```ts
    let periodQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (query?.isFulfilled !== undefined) {
      periodQuery = periodQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    if (query?.customerId) {
      periodQuery = periodQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }

    if (query?.salesRepId) {
      periodQuery = periodQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }

    if (query?.paymentStatus) {
      periodQuery = periodQuery
        .leftJoin('order.invoices', 'invoice')
        .andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getPeriodData filter propagation"
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/sales/services/sales-analytics.service.ts src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "fix(sales-analytics): propagate customerId/salesRepId/paymentStatus filters to getPeriodData"
```

---

### Task 2: Add missing filters to `getTopCustomers`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts:484-531`
- Test: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write failing test**

Add a new `describe` block to the spec file:

```ts
describe('getTopCustomers filter propagation', () => {
  function makeQbChain() {
    const qb: any = {};
    qb.leftJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.addGroupBy = jest.fn().mockReturnValue(qb);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.limit = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  }

  const start = new Date('2026-03-01T00:00:00.000Z');
  const end = new Date('2026-03-31T23:59:59.999Z');

  it('applies salesRepId filter when provided', async () => {
    const qb = makeQbChain();
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await (service as any).getTopCustomers(start, end, 10, { salesRepId: 'rep-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', { salesRepId: 'rep-1' });
  });

  it('does not add salesRepId andWhere when not provided', async () => {
    const qb = makeQbChain();
    (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await (service as any).getTopCustomers(start, end, 10, {});

    const andWhereCalls = qb.andWhere.mock.calls.map((c: any[]) => c[0] as string);
    expect(andWhereCalls).not.toContain(expect.stringContaining('salesRepId'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getTopCustomers filter propagation"
```

Expected: 1 FAIL (`salesRepId` not applied), 1 PASS.

- [ ] **Step 3: Add `salesRepId` filter to `getTopCustomers`**

In `sales-analytics.service.ts`, find `getTopCustomers`. After the existing `paymentStatus` block (around line 500), add:

```ts
    if (query?.salesRepId) {
      topCustomersQuery = topCustomersQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }
```

The updated filter section should look like:

```ts
    if (query?.isFulfilled !== undefined) {
      topCustomersQuery = topCustomersQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    if (query?.paymentStatus) {
      topCustomersQuery = topCustomersQuery
        .leftJoin('order.invoices', 'invoice')
        .andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
    }

    if (query?.salesRepId) {
      topCustomersQuery = topCustomersQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getTopCustomers filter propagation"
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/sales/services/sales-analytics.service.ts src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "fix(sales-analytics): propagate salesRepId filter to getTopCustomers"
```

---

### Task 3: Add missing filters to `getTopProducts`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts:533-581`
- Test: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to the spec file:

```ts
describe('getTopProducts filter propagation', () => {
  function makeQbChain() {
    const qb: any = {};
    qb.leftJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.addGroupBy = jest.fn().mockReturnValue(qb);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.limit = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  }

  const start = new Date('2026-03-01T00:00:00.000Z');
  const end = new Date('2026-03-31T23:59:59.999Z');

  it('applies customerId filter when provided', async () => {
    const qb = makeQbChain();
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await (service as any).getTopProducts(start, end, 10, { customerId: 'cust-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', { customerId: 'cust-1' });
  });

  it('applies salesRepId filter when provided', async () => {
    const qb = makeQbChain();
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await (service as any).getTopProducts(start, end, 10, { salesRepId: 'rep-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', { salesRepId: 'rep-1' });
  });

  it('applies both customerId and salesRepId when both provided', async () => {
    const qb = makeQbChain();
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await (service as any).getTopProducts(start, end, 10, { customerId: 'cust-1', salesRepId: 'rep-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', { customerId: 'cust-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', { salesRepId: 'rep-1' });
  });

  it('applies no extra andWhere calls when query has no filters', async () => {
    const qb = makeQbChain();
    (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await (service as any).getTopProducts(start, end, 10, {});

    const andWhereCalls = qb.andWhere.mock.calls.map((c: any[]) => c[0] as string);
    expect(andWhereCalls).not.toContain(expect.stringContaining('customerId'));
    expect(andWhereCalls).not.toContain(expect.stringContaining('salesRepId'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getTopProducts filter propagation"
```

Expected: 3 FAIL, 1 PASS.

- [ ] **Step 3: Add `customerId` and `salesRepId` filters to `getTopProducts`**

In `sales-analytics.service.ts`, find `getTopProducts`. After the existing `paymentStatus` block (around line 551), add:

```ts
    if (query?.customerId) {
      topProductsQuery = topProductsQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }

    if (query?.salesRepId) {
      topProductsQuery = topProductsQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }
```

The updated filter section should look like:

```ts
    if (query?.isFulfilled !== undefined) {
      topProductsQuery = topProductsQuery.andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: query.isFulfilled });
    }

    if (query?.paymentStatus) {
      topProductsQuery = topProductsQuery
        .leftJoin('order.invoices', 'invoice')
        .andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
    }

    if (query?.customerId) {
      topProductsQuery = topProductsQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }

    if (query?.salesRepId) {
      topProductsQuery = topProductsQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "getTopProducts filter propagation"
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/sales/services/sales-analytics.service.ts src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "fix(sales-analytics): propagate customerId/salesRepId filters to getTopProducts"
```

---

### Task 4: Implement `fillPeriodGaps` method

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts`
- Test: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

- [ ] **Step 1: Write failing tests for `fillPeriodGaps`**

Add to the spec file. These tests call the method directly — no DB mock needed:

```ts
describe('fillPeriodGaps', () => {
  const zero = { revenue: 0, orders: 0, newCustomers: 0, averageOrderValue: 0 };

  describe('day groupBy', () => {
    it('fills missing days with zeros', () => {
      const start = new Date('2026-03-01T00:00:00.000Z');
      const end = new Date('2026-03-05T23:59:59.999Z');
      const sparse = [
        { period: '2026-03-01', revenue: 100, orders: 2, newCustomers: 1, averageOrderValue: 50 },
        { period: '2026-03-05', revenue: 200, orders: 3, newCustomers: 0, averageOrderValue: 66.67 },
      ];

      const result = (service as any).fillPeriodGaps(sparse, start, end, 'day');

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ period: '2026-03-01', revenue: 100, orders: 2, newCustomers: 1, averageOrderValue: 50 });
      expect(result[1]).toEqual({ period: '2026-03-02', ...zero });
      expect(result[2]).toEqual({ period: '2026-03-03', ...zero });
      expect(result[3]).toEqual({ period: '2026-03-04', ...zero });
      expect(result[4]).toEqual({ period: '2026-03-05', revenue: 200, orders: 3, newCustomers: 0, averageOrderValue: 66.67 });
    });

    it('handles empty DB result — all zeros', () => {
      const start = new Date('2026-03-01T00:00:00.000Z');
      const end = new Date('2026-03-03T23:59:59.999Z');

      const result = (service as any).fillPeriodGaps([], start, end, 'day');

      expect(result).toHaveLength(3);
      result.forEach((r: any) => expect(r).toMatchObject(zero));
    });

    it('handles single-day range with one order', () => {
      const start = new Date('2026-03-15T00:00:00.000Z');
      const end = new Date('2026-03-15T23:59:59.999Z');
      const sparse = [{ period: '2026-03-15', revenue: 50, orders: 1, newCustomers: 0, averageOrderValue: 50 }];

      const result = (service as any).fillPeriodGaps(sparse, start, end, 'day');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ period: '2026-03-15', revenue: 50, orders: 1, newCustomers: 0, averageOrderValue: 50 });
    });
  });

  describe('week groupBy', () => {
    it('fills missing weeks with zeros', () => {
      // 2026-03-02 is week 10, 2026-03-09 is week 11, 2026-03-16 is week 12
      const start = new Date('2026-03-02T00:00:00.000Z');
      const end = new Date('2026-03-22T23:59:59.999Z');
      const sparse = [
        { period: '2026-11', revenue: 100, orders: 2, newCustomers: 0, averageOrderValue: 50 },
      ];

      const result = (service as any).fillPeriodGaps(sparse, start, end, 'week');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ period: '2026-10', ...zero });
      expect(result[1]).toEqual({ period: '2026-11', revenue: 100, orders: 2, newCustomers: 0, averageOrderValue: 50 });
      expect(result[2]).toEqual({ period: '2026-12', ...zero });
    });
  });

  describe('month groupBy', () => {
    it('fills missing months with zeros', () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-03-31T23:59:59.999Z');
      const sparse = [
        { period: '2026-02', revenue: 500, orders: 5, newCustomers: 2, averageOrderValue: 100 },
      ];

      const result = (service as any).fillPeriodGaps(sparse, start, end, 'month');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ period: '2026-01', ...zero });
      expect(result[1]).toEqual({ period: '2026-02', revenue: 500, orders: 5, newCustomers: 2, averageOrderValue: 100 });
      expect(result[2]).toEqual({ period: '2026-03', ...zero });
    });
  });

  describe('quarter groupBy', () => {
    it('fills missing quarters with zeros', () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-06-30T23:59:59.999Z');
      const sparse = [
        { period: '2026-Q1', revenue: 1000, orders: 10, newCustomers: 3, averageOrderValue: 100 },
      ];

      const result = (service as any).fillPeriodGaps(sparse, start, end, 'quarter');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ period: '2026-Q1', revenue: 1000, orders: 10, newCustomers: 3, averageOrderValue: 100 });
      expect(result[1]).toEqual({ period: '2026-Q2', ...zero });
    });
  });

  describe('year groupBy', () => {
    it('fills missing years with zeros', () => {
      const start = new Date('2025-01-01T00:00:00.000Z');
      const end = new Date('2026-12-31T23:59:59.999Z');
      const sparse = [
        { period: '2025', revenue: 5000, orders: 50, newCustomers: 10, averageOrderValue: 100 },
      ];

      const result = (service as any).fillPeriodGaps(sparse, start, end, 'year');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ period: '2025', revenue: 5000, orders: 50, newCustomers: 10, averageOrderValue: 100 });
      expect(result[1]).toEqual({ period: '2026', ...zero });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "fillPeriodGaps"
```

Expected: All fail with `TypeError: (service as any).fillPeriodGaps is not a function`.

- [ ] **Step 3: Add `fillPeriodGaps` method to the service**

First, add `getISOWeek` and `getISOWeekYear` to the `date-fns` import at the top of `sales-analytics.service.ts`:

```ts
import { differenceInCalendarDays, subDays, subMonths, subYears, addDays, addWeeks, addMonths, addYears, getISOWeek, getISOWeekYear, format } from 'date-fns';
```

Then add the private method before the `parseDateRange` method (around line 623):

```ts
  private fillPeriodGaps(
    data: PeriodMetricDto[],
    startDate: Date,
    endDate: Date,
    groupBy: string,
  ): PeriodMetricDto[] {
    const dataMap = new Map(data.map(item => [item.period, item]));
    const labels: string[] = [];
    let cursor = new Date(startDate);

    while (cursor <= endDate) {
      let label: string;

      switch (groupBy) {
        case 'day':
          label = format(cursor, 'yyyy-MM-dd');
          cursor = addDays(cursor, 1);
          break;
        case 'week': {
          const isoYear = getISOWeekYear(cursor);
          const isoWeek = String(getISOWeek(cursor)).padStart(2, '0');
          label = `${isoYear}-${isoWeek}`;
          cursor = addWeeks(cursor, 1);
          break;
        }
        case 'quarter': {
          const q = Math.floor(cursor.getMonth() / 3) + 1;
          label = `${cursor.getFullYear()}-Q${q}`;
          cursor = addMonths(cursor, 3);
          break;
        }
        case 'year':
          label = String(cursor.getFullYear());
          cursor = addYears(cursor, 1);
          break;
        default: // month
          label = format(cursor, 'yyyy-MM');
          cursor = addMonths(cursor, 1);
          break;
      }

      labels.push(label);
    }

    return labels.map(label =>
      dataMap.get(label) ?? {
        period: label,
        revenue: 0,
        orders: 0,
        newCustomers: 0,
        averageOrderValue: 0,
      },
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage -t "fillPeriodGaps"
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/sales/services/sales-analytics.service.ts src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "feat(sales-analytics): add fillPeriodGaps method for zero-filled period series"
```

---

### Task 5: Wire `fillPeriodGaps` into `getPeriodData`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts:475-482`

- [ ] **Step 1: Update `getPeriodData` to call `fillPeriodGaps` before returning**

In `getPeriodData`, replace the final return statement:

**Before:**
```ts
    return data.map(item => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      orders: parseInt(item.orders) || 0,
      newCustomers: customerMap.get(item.period) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
    }));
```

**After:**
```ts
    const mapped = data.map(item => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      orders: parseInt(item.orders) || 0,
      newCustomers: customerMap.get(item.period) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
    }));

    return this.fillPeriodGaps(mapped, startDate, endDate, groupBy);
```

- [ ] **Step 2: Run the full service spec to verify nothing regressed**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage
```

Expected: All existing + new tests PASS.

- [ ] **Step 3: Run the full sales module test suite**

```bash
cd backend && npx jest src/modules/sales --no-coverage
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/modules/sales/services/sales-analytics.service.ts
git commit -m "fix(sales-analytics): wire fillPeriodGaps into getPeriodData for zero-filled trend chart"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend && npm run test
```

Expected: All tests pass, no regressions.

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npm run lint
```

Expected: No errors.
