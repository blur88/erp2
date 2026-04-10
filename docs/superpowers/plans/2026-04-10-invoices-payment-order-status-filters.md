# Invoices Payment & Order Status Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `paymentStatus` and `fulfillmentStatus` filter dropdowns to the Invoices page filter bar, matching the Sales Orders page pattern.

**Architecture:** Extend `QueryInvoicesDto` with two new params, migrate `findAll()` from `FindManyOptions` to a `QueryBuilder` (required for the sales order JOIN), and wire up the existing `FilterPaymentStatus` and `FilterOrderStatus` components in `InvoicesPage.tsx`.

**Tech Stack:** NestJS 11, TypeORM (QueryBuilder), React 19, RTK Query, MUI v7, Vitest (frontend), Jest (backend)

---

## File Map

| File | Change |
|------|--------|
| `backend/src/modules/sales/dto/invoice.dto.ts` | Add `paymentStatus` and `fulfillmentStatus` to `QueryInvoicesDto` |
| `backend/src/modules/sales/services/invoice.service.ts` | Migrate `findAll()` to QueryBuilder; add new filter branches |
| `backend/src/modules/sales/services/invoice.service.spec.ts` | Add `findAll` describe block with tests for new filters |
| `frontend/src/pages/sales/InvoicesPage.tsx` | Add filters to interface, config, defaults, queryArgs |
| `frontend/src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx` | Add two new test cases |

---

### Task 1: Extend `QueryInvoicesDto` with new filter fields

**Files:**
- Modify: `backend/src/modules/sales/dto/invoice.dto.ts`

- [ ] **Step 1: Add `paymentStatus` and `fulfillmentStatus` to `QueryInvoicesDto`**

Open `backend/src/modules/sales/dto/invoice.dto.ts`. In the `QueryInvoicesDto` class, add these two fields after the existing `unpaid` field (around line 151):

```typescript
  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: ['unpaid', 'partial', 'paid', 'overpaid'],
    example: 'unpaid',
  })
  @IsOptional()
  @IsEnum(['unpaid', 'partial', 'paid', 'overpaid'])
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';

  @ApiPropertyOptional({
    description: 'Filter by fulfillment status of linked sales order',
    enum: ['fulfilled', 'unfulfilled'],
    example: 'fulfilled',
  })
  @IsOptional()
  @IsEnum(['fulfilled', 'unfulfilled'])
  fulfillmentStatus?: 'fulfilled' | 'unfulfilled';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -20
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/modules/sales/dto/invoice.dto.ts
git commit -m "feat(invoices): add paymentStatus and fulfillmentStatus to QueryInvoicesDto"
```

---

### Task 2: Write failing backend tests for new `findAll()` filters

**Files:**
- Modify: `backend/src/modules/sales/services/invoice.service.spec.ts`

- [ ] **Step 1: Add a new `describe` block for `findAll` filter tests**

The existing spec only tests `searchGlobal`. Add a new top-level `describe` block at the end of `invoice.service.spec.ts`:

```typescript
describe('InvoiceService.findAll — new filter params', () => {
  let service: InvoiceService;
  let invoiceRepository: { createQueryBuilder: jest.Mock };

  const mockQb = () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return qb;
  };

  beforeEach(async () => {
    invoiceRepository = { createQueryBuilder: jest.fn().mockReturnValue(mockQb()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        { provide: getRepositoryToken(Customer), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(SalesOrder), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(InvoiceItem), useValue: {} },
        { provide: AuditLogService, useValue: { log: jest.fn(), createLog: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  it('calls andWhere with paidAmount = 0 when paymentStatus=unpaid', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'unpaid' });

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount = 0'))).toBe(true);
  });

  it('calls andWhere with partial condition when paymentStatus=partial', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'partial' });

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount > 0') && c.includes('paidAmount < invoice.totalAmount'))).toBe(true);
  });

  it('calls andWhere with paid condition when paymentStatus=paid', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'paid' });

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount >= invoice.totalAmount'))).toBe(true);
  });

  it('calls andWhere with overpaid condition when paymentStatus=overpaid', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ paymentStatus: 'overpaid' });

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount > invoice.totalAmount'))).toBe(true);
  });

  it('calls andWhere with isFulfilled = true when fulfillmentStatus=fulfilled', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ fulfillmentStatus: 'fulfilled' });

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('isFulfilled = true'))).toBe(true);
  });

  it('calls andWhere with isFulfilled = false when fulfillmentStatus=unfulfilled', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ fulfillmentStatus: 'unfulfilled' });

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('isFulfilled = false'))).toBe(true);
  });

  it('applies no paymentStatus andWhere when paymentStatus is undefined', async () => {
    const qb = mockQb();
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({});

    const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('paidAmount'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd backend && npx jest src/modules/sales/services/invoice.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `FAIL` — the new tests should fail because `findAll()` still uses `FindManyOptions`, not a `QueryBuilder`.

---

### Task 3: Migrate `findAll()` to QueryBuilder and implement new filters

**Files:**
- Modify: `backend/src/modules/sales/services/invoice.service.ts`

- [ ] **Step 1: Replace the `findAll()` implementation**

In `invoice.service.ts`, replace the entire `findAll()` method (lines 171–236) with this QueryBuilder implementation:

```typescript
  async findAll(query: QueryInvoicesDto) {
    const {
      search,
      customerId,
      salesOrderId,
      status,
      fromDate,
      toDate,
      unpaid,
      paymentStatus,
      fulfillmentStatus,
      sortBy = 'invoiceDate',
      sortOrder = 'DESC',
    } = query;

    let qb = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.salesOrder', 'salesOrder')
      .leftJoinAndSelect('invoice.payments', 'payments')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where('invoice.deletedAt IS NULL');

    if (customerId) {
      qb = qb.andWhere('invoice.customerId = :customerId', { customerId });
    }

    if (salesOrderId) {
      qb = qb.andWhere('invoice.salesOrderId = :salesOrderId', { salesOrderId });
    }

    if (status) {
      qb = qb.andWhere('invoice.status = :status', { status });
    }

    if (fromDate && toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      qb = qb.andWhere('invoice.invoiceDate BETWEEN :fromDate AND :toDate', {
        fromDate: new Date(fromDate),
        toDate: endDate,
      });
    } else if (fromDate) {
      qb = qb.andWhere('invoice.invoiceDate >= :fromDate', { fromDate: new Date(fromDate) });
    } else if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      qb = qb.andWhere('invoice.invoiceDate <= :toDate', { toDate: endDate });
    }

    if (search) {
      qb = qb.andWhere(
        '(invoice.invoiceNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (unpaid !== undefined) {
      if (unpaid) {
        qb = qb.andWhere('invoice.balanceDue > 0');
      } else {
        qb = qb.andWhere('invoice.balanceDue <= 0');
      }
    }

    if (paymentStatus) {
      switch (paymentStatus) {
        case 'unpaid':
          qb = qb.andWhere('invoice.paidAmount = 0');
          break;
        case 'partial':
          qb = qb.andWhere('invoice.paidAmount > 0 AND invoice.paidAmount < invoice.totalAmount');
          break;
        case 'paid':
          qb = qb.andWhere('invoice.paidAmount >= invoice.totalAmount AND invoice.paidAmount > 0');
          break;
        case 'overpaid':
          qb = qb.andWhere('invoice.paidAmount > invoice.totalAmount');
          break;
      }
    }

    if (fulfillmentStatus) {
      switch (fulfillmentStatus) {
        case 'fulfilled':
          qb = qb.andWhere('salesOrder.isFulfilled = true');
          break;
        case 'unfulfilled':
          qb = qb.andWhere('salesOrder.isFulfilled = false');
          break;
      }
    }

    qb = qb.orderBy(`invoice.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    const [invoices, total] = await qb.getManyAndCount();

    const data = await Promise.all(
      invoices.map(invoice => this.mapToResponseDto(invoice))
    );

    return {
      data,
      meta: {
        total,
      },
    };
  }
```

Also remove the now-unused imports `Between`, `MoreThanOrEqual`, `LessThanOrEqual`, `ILike`, `In`, `FindOptionsWhere`, `FindManyOptions` from the TypeORM import at line 9 if they are only used in `findAll()`. Keep any that are still used elsewhere in the file.

Check which are still needed:
```bash
cd backend && grep -n 'Between\|MoreThanOrEqual\|LessThanOrEqual\|ILike\|FindOptionsWhere\|FindManyOptions' src/modules/sales/services/invoice.service.ts
```

Remove any that only appear in the old `findAll()` (now deleted). The import line is at the top of the file.

- [ ] **Step 2: Run the new tests to confirm they pass**

```bash
cd backend && npx jest src/modules/sales/services/invoice.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests `PASS`.

- [ ] **Step 3: Run the full backend test suite to check for regressions**

```bash
cd backend && npm run test 2>&1 | tail -30
```

Expected: no new failures.

- [ ] **Step 4: Commit**

```bash
cd backend && git add src/modules/sales/services/invoice.service.ts src/modules/sales/services/invoice.service.spec.ts
git commit -m "feat(invoices): migrate findAll to QueryBuilder; add paymentStatus and fulfillmentStatus filters"
```

---

### Task 4: Wire up filters in `InvoicesPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`

- [ ] **Step 1: Extend the `InvoiceFilters` interface**

Replace the existing interface (lines 25–29):

```typescript
interface InvoiceFilters {
  search: string
  period: PeriodValue
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
}
```

- [ ] **Step 2: Add the new fields to `filterConfig`**

Replace the `filterConfig` `fields` array (currently lines 46–49) with:

```typescript
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'customerId', label: 'Customer', type: 'customer' },
        { field: 'paymentStatus', label: 'Payment', type: 'payment-status' },
        { field: 'fulfillmentStatus', label: 'Order Status', type: 'order-status' },
      ],
```

- [ ] **Step 3: Add the new fields to `filterConfig` defaults**

Replace the `defaults` object (currently lines 51–55) with:

```typescript
      defaults: {
        search: '',
        period: { key: null, from: null, to: null },
        customerId: null,
        paymentStatus: null,
        fulfillmentStatus: null,
      },
```

- [ ] **Step 4: Add the new fields to `queryArgs`**

Replace the `queryArgs` `useMemo` (currently lines 74–84) with:

```typescript
  const queryArgs = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      customerId: appliedFilters.customerId || undefined,
      paymentStatus: appliedFilters.paymentStatus || undefined,
      fulfillmentStatus: appliedFilters.fulfillmentStatus || undefined,
    }),
    [appliedFilters.search, appliedFilters.customerId, appliedFilters.paymentStatus, appliedFilters.fulfillmentStatus, dateRange, sortBy, sortOrder],
  )
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/sales/InvoicesPage.tsx
git commit -m "feat(invoices): add paymentStatus and fulfillmentStatus filter controls to InvoicesPage"
```

---

### Task 5: Add frontend filter bar tests

**Files:**
- Modify: `frontend/src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx`

- [ ] **Step 1: Add two new test cases**

Add the following two tests inside the existing `describe('InvoicesPage FilterBar integration', ...)` block, after the last existing test:

```typescript
  it('restores paymentStatus=paid from URL and passes it to the query', () => {
    renderPage('/?paymentStatus=paid')
    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paymentStatus: 'paid',
      }),
    )
  })

  it('restores fulfillmentStatus=fulfilled from URL and passes it to the query', () => {
    renderPage('/?fulfillmentStatus=fulfilled')
    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fulfillmentStatus: 'fulfilled',
      }),
    )
  })
```

- [ ] **Step 2: Run the new tests to confirm they fail first**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx 2>&1 | tail -20
```

Expected: the two new tests should **fail** (they will if Task 4 isn't done yet — run Task 4 first, then re-run here).

After Task 4 is complete, expected: all tests in this file **PASS**.

- [ ] **Step 3: Run the full frontend test file once more to confirm no regressions**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx 2>&1 | tail -20
```

Expected: all 7 tests pass.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx
git commit -m "test(invoices): add filterbar tests for paymentStatus and fulfillmentStatus"
```

---

## Self-Review

**Spec coverage:**
- ✅ `paymentStatus` added to DTO
- ✅ `fulfillmentStatus` added to DTO
- ✅ `findAll()` migrated to QueryBuilder
- ✅ `paymentStatus` filter: unpaid/partial/paid/overpaid branches
- ✅ `fulfillmentStatus` filter: salesOrder JOIN + isFulfilled branch
- ✅ Existing `status`, `unpaid`, `search`, `customerId`, `salesOrderId`, date range params preserved
- ✅ Frontend: `InvoiceFilters` interface extended
- ✅ Frontend: filter config fields added in correct order (Period → Customer → Payment → Order Status)
- ✅ Frontend: defaults and queryArgs updated
- ✅ Frontend tests: two new URL-restore test cases

**Placeholder scan:** None found. All code steps include complete implementations.

**Type consistency:** `paymentStatus` and `fulfillmentStatus` types match between DTO (Task 1), service (Task 3), and frontend interface (Task 4).
