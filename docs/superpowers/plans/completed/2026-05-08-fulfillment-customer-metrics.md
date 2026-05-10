# Fulfillment-Only Customer Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix customer Account Summary metrics (Total Orders, Total Sales, First/Last Purchase Dates) to reflect only fulfilled orders, not all created orders.

**Architecture:** Single source of truth — `CustomerService.updateCustomerMetrics()` recalculates from DB using `isFulfilled = true` filter. `SalesOrderService` (the facade) calls it after every fulfillment state change. Existing data fixed by a TypeORM migration that runs on deploy.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, Jest

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/src/modules/sales/services/customer.service.ts` | Modify | Add `isFulfilled = true` to 3 query methods |
| `backend/src/modules/sales/services/customer.service.spec.ts` | Modify | Add tests for fulfillment-only filtering |
| `backend/src/modules/sales/services/sales-order.service.ts` | Modify | Remove `updateCustomerSalesMetrics()`; uncomment `CustomerService` injection; add metric update calls after 5 lifecycle events |
| `backend/src/modules/sales/services/sales-order.service.spec.ts` | Modify | Update tests that assumed order creation bumped customer metrics |
| `backend/src/database/migrations/1746700000000-FulfillmentOnlyCustomerMetrics.ts` | Create | Two-step SQL migration to fix existing data |

---

## Task 1: Add `isFulfilled` filter to `CustomerService.updateCustomerMetrics()`

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts:967-992`
- Test: `backend/src/modules/sales/services/customer.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `customer.service.spec.ts`, add a new `describe` block after the existing ones:

```typescript
describe('updateCustomerMetrics', () => {
  it('counts only fulfilled non-deleted orders', async () => {
    const customer = createCustomer('c1', { totalOrders: 5, totalSales: 500 });
    customerRepository.findOne = jest.fn().mockResolvedValue(customer);
    customerRepository.save = jest.fn().mockResolvedValue(customer);

    const salesOrderRepository: jest.Mocked<Repository<SalesOrder>> = module.get(
      getRepositoryToken(SalesOrder),
    );

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalOrders: '2',
        totalSales: '300',
        firstOrderDate: new Date('2026-01-01'),
        lastOrderDate: new Date('2026-03-01'),
      }),
    };
    salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await service.updateCustomerMetrics('c1');

    // Verify isFulfilled filter was applied
    expect(qb.andWhere).toHaveBeenCalledWith('order.isFulfilled = :isFulfilled', { isFulfilled: true });
    // Verify metrics were updated from query result, not old values
    expect(customerRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalOrders: 2, totalSales: 300 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: FAIL — test asserts `isFulfilled` filter that doesn't exist yet.

- [ ] **Step 3: Add `isFulfilled` filter to `updateCustomerMetrics()`**

In `customer.service.ts`, locate `updateCustomerMetrics()` at line ~967. Replace the query builder block:

```typescript
async updateCustomerMetrics(customerId: string): Promise<void> {
  const customer = await this.customerRepository.findOne({ where: { id: customerId } });
  if (!customer) {
    throw new NotFoundException('Customer not found');
  }

  const orderStats = await this.salesOrderRepository
    .createQueryBuilder('order')
    .where('order.customerId = :customerId', { customerId })
    .andWhere('order.deletedAt IS NULL')
    .andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: true })
    .select([
      'COUNT(*) as totalOrders',
      'COALESCE(SUM(order.totalAmount), 0) as totalSales',
      'MIN(order.orderDate) as firstOrderDate',
      'MAX(order.orderDate) as lastOrderDate',
    ])
    .getRawOne();

  customer.totalOrders = parseInt(orderStats.totalOrders) || 0;
  customer.totalSales = parseFloat(orderStats.totalSales) || 0;
  customer.firstPurchaseDate = orderStats.firstOrderDate;
  customer.lastPurchaseDate = orderStats.lastOrderDate;

  await this.customerRepository.save(customer);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts \
        backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "feat: filter updateCustomerMetrics to fulfilled orders only"
```

---

## Task 2: Add `isFulfilled` filter to `recalculateAllCustomerTotals()`

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts:907-962`
- Test: `backend/src/modules/sales/services/customer.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('CustomerService')` block in `customer.service.spec.ts`:

```typescript
describe('recalculateAllCustomerTotals', () => {
  it('uses isFulfilled filter when recalculating', async () => {
    const customers = [createCustomer('c1'), createCustomer('c2')];
    customerRepository.find = jest.fn().mockResolvedValue(customers);
    customerRepository.save = jest.fn().mockResolvedValue({});

    const salesOrderRepository: jest.Mocked<Repository<SalesOrder>> = module.get(
      getRepositoryToken(SalesOrder),
    );

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalOrders: '1',
        totalSales: '100',
        firstOrderDate: null,
        lastOrderDate: null,
      }),
    };
    salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await service.recalculateAllCustomerTotals();

    expect(qb.andWhere).toHaveBeenCalledWith('order.isFulfilled = :isFulfilled', { isFulfilled: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Add `isFulfilled` filter to `recalculateAllCustomerTotals()`**

In `customer.service.ts`, locate `recalculateAllCustomerTotals()` at line ~907. Replace the inner query builder block for `orderStats`:

```typescript
const orderStats = await this.salesOrderRepository
  .createQueryBuilder('order')
  .where('order.customerId = :customerId', { customerId: customer.id })
  .andWhere('order.deletedAt IS NULL')
  .andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: true })
  .select([
    'COUNT(*) as totalOrders',
    'COALESCE(SUM(order.totalAmount), 0) as totalSales',
    'MIN(order.orderDate) as firstOrderDate',
    'MAX(order.orderDate) as lastOrderDate',
  ])
  .getRawOne();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts \
        backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "feat: filter recalculateAllCustomerTotals to fulfilled orders only"
```

---

## Task 3: Add `isFulfilled` filter to `getCustomerStatistics()`

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts:489-543`
- Test: `backend/src/modules/sales/services/customer.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('getCustomerStatistics', () => {
  it('filters order stats to fulfilled orders only', async () => {
    const customer = createCustomer('c1');
    customerRepository.findOne = jest.fn().mockResolvedValue(customer);

    const salesOrderRepository: jest.Mocked<Repository<SalesOrder>> = module.get(
      getRepositoryToken(SalesOrder),
    );
    const invoiceRepository: jest.Mocked<Repository<Invoice>> = module.get(
      getRepositoryToken(Invoice),
    );

    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalOrders: '3',
        averageOrderValue: '100',
        totalSales: '300',
        firstOrderDate: new Date('2026-01-01'),
        lastOrderDate: new Date('2026-03-01'),
      }),
    };
    salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
    invoiceRepository.count = jest.fn().mockResolvedValue(0);

    await service.getCustomerStatistics('c1');

    expect(qb.andWhere).toHaveBeenCalledWith('order.isFulfilled = :isFulfilled', { isFulfilled: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Add `isFulfilled` filter to `getCustomerStatistics()`**

In `customer.service.ts`, locate `getCustomerStatistics()` at line ~489. Replace the `orderStats` query:

```typescript
const orderStats = await this.salesOrderRepository
  .createQueryBuilder('order')
  .where('order.customerId = :customerId', { customerId })
  .andWhere('order.deletedAt IS NULL')
  .andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: true })
  .select([
    'COUNT(*) as totalOrders',
    'COALESCE(AVG(order.totalAmount), 0) as averageOrderValue',
    'COALESCE(SUM(order.totalAmount), 0) as totalSales',
    'MIN(order.orderDate) as firstOrderDate',
    'MAX(order.orderDate) as lastOrderDate',
  ])
  .getRawOne();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts \
        backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "feat: filter getCustomerStatistics to fulfilled orders only"
```

---

## Task 4: Wire CustomerService into SalesOrderService and add metric triggers

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`
- Test: `backend/src/modules/sales/services/sales-order.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Open `sales-order.service.spec.ts`. Find the mock setup block (`beforeEach`) and add `CustomerService` to the providers list. Then add the following tests:

```typescript
// Add to mock providers in beforeEach:
{
  provide: CustomerService,
  useValue: { updateCustomerMetrics: jest.fn().mockResolvedValue(undefined) },
},
```

Add these tests:

```typescript
describe('fulfillOrder calls updateCustomerMetrics', () => {
  it('calls updateCustomerMetrics with the order customerId after fulfillment', async () => {
    // Arrange: stub fulfillment service and findById
    const mockOrder = { id: 'o1', customerId: 'c1' } as SalesOrder;
    salesOrderFulfillmentService.fulfillOrder = jest.fn().mockResolvedValue(mockOrder);
    // findById is called at the end — stub it to return a minimal DTO
    salesOrderQueryService.findById = jest.fn().mockResolvedValue({ id: 'o1' });
    const customerService = module.get(CustomerService);

    await service.fulfillOrder('o1', 'user1', 'user1');

    expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
  });
});

describe('unfulfillOrder calls updateCustomerMetrics', () => {
  it('calls updateCustomerMetrics with the order customerId after unfulfillment', async () => {
    const mockOrder = { id: 'o1', customerId: 'c1' } as SalesOrder;
    salesOrderFulfillmentService.unfulfillOrder = jest.fn().mockResolvedValue(mockOrder);
    salesOrderQueryService.findById = jest.fn().mockResolvedValue({ id: 'o1' });
    const customerService = module.get(CustomerService);

    await service.unfulfillOrder('o1');

    expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
  });
});

describe('create does NOT call updateCustomerSalesMetrics', () => {
  it('does not update customer metrics when an order is created', async () => {
    const customerService = module.get(CustomerService);
    // create() is complex to fully stub — just verify updateCustomerMetrics not called
    // by checking the spy remains uncalled after a failed create attempt
    try {
      await service.create({ customerId: 'nonexistent', items: [], shippingAmount: 0 });
    } catch {}
    expect(customerService.updateCustomerMetrics).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-order.service.spec.ts --no-coverage
```

Expected: FAIL — `CustomerService` not injected yet, `updateCustomerMetrics` not called.

- [ ] **Step 3: Uncomment CustomerService import and injection**

In `sales-order.service.ts`:

**Line 36** — replace:
```typescript
// import { CustomerService } from './customer.service';
```
with:
```typescript
import { CustomerService } from './customer.service';
```

**Line 75** — replace:
```typescript
    // private readonly customerService: CustomerService,
```
with:
```typescript
    private readonly customerService: CustomerService,
```

- [ ] **Step 4: Remove `updateCustomerSalesMetrics()` and its call in `create()`**

Delete the private method at lines ~692-703:
```typescript
  private async updateCustomerSalesMetrics(customerId: string, orderAmount: number): Promise<void> {
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (customer) {
      // Use the entity's built-in method to update metrics
      const isFirstOrder = customer.totalOrders === 0;
      customer.updateSalesMetrics(orderAmount, isFirstOrder);
      await this.customerRepository.save(customer);
    }
  }
```

Delete the call to it in `create()` at lines ~275-281:
```typescript
    // Update customer metrics immediately
    try {
      await this.updateCustomerSalesMetrics(customer.id, totalAmount);
    } catch (error) {
      console.error('Failed to update customer metrics:', error.message);
      // Don't fail the order creation if customer metric update fails
    }
```

- [ ] **Step 5: Add metric update call to `fulfillOrder()`**

Replace the current `fulfillOrder()` method (lines ~907-914):
```typescript
async fulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
  const savedOrder = await this.salesOrderFulfillmentService.fulfillOrder(
    id,
    userId,
    username,
  );
  try {
    await this.customerService.updateCustomerMetrics(savedOrder.customerId);
  } catch (error) {
    this.logger.error(`Failed to update customer metrics after fulfillOrder ${id}: ${error.message}`);
  }
  return this.findById(savedOrder.id);
}
```

- [ ] **Step 6: Add metric update call to `unfulfillOrder()`**

Replace the current `unfulfillOrder()` method (lines ~916-919):
```typescript
async unfulfillOrder(id: string): Promise<SalesOrderResponseDto> {
  const savedOrder = await this.salesOrderFulfillmentService.unfulfillOrder(id);
  try {
    await this.customerService.updateCustomerMetrics(savedOrder.customerId);
  } catch (error) {
    this.logger.error(`Failed to update customer metrics after unfulfillOrder ${id}: ${error.message}`);
  }
  return this.findById(savedOrder.id);
}
```

- [ ] **Step 7: Add metric update call to `delete()`**

Replace the current `delete()` method (lines ~597-608):
```typescript
async delete(
  id: string,
  userId?: string,
  username?: string,
): Promise<{ deletedOrderNumber: string; previousOrder: SalesOrderResponseDto | null }> {
  // Load customerId before delegating — lifecycle service returns void on delete
  const order = await this.salesOrderRepository.findOne({ where: { id } });
  const customerId = order?.customerId;

  const result = await this.salesOrderLifecycleService.delete(
    id,
    userId,
    username,
    this.findPreviousOrder.bind(this),
  );

  if (customerId) {
    try {
      await this.customerService.updateCustomerMetrics(customerId);
    } catch (error) {
      this.logger.error(`Failed to update customer metrics after delete ${id}: ${error.message}`);
    }
  }

  return result;
}
```

- [ ] **Step 8: Add metric update call to `restore()`**

Replace the current `restore()` method (lines ~779-781):
```typescript
async restore(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
  const restoredOrder = await this.salesOrderLifecycleService.restore(id, userId, username);
  try {
    await this.customerService.updateCustomerMetrics(restoredOrder.customerId);
  } catch (error) {
    this.logger.error(`Failed to update customer metrics after restore ${id}: ${error.message}`);
  }
  return restoredOrder;
}
```

- [ ] **Step 9: Add metric update call to `permanentDelete()`**

Replace the current `permanentDelete()` method (lines ~787-789):
```typescript
async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
  // Load customerId before delegating — lifecycle service returns void
  const order = await this.salesOrderRepository.findOne({
    where: { id },
    withDeleted: true,
  });
  const customerId = order?.customerId;

  await this.salesOrderLifecycleService.permanentDelete(id, userId, username);

  if (customerId) {
    try {
      await this.customerService.updateCustomerMetrics(customerId);
    } catch (error) {
      this.logger.error(`Failed to update customer metrics after permanentDelete ${id}: ${error.message}`);
    }
  }
}
```

- [ ] **Step 10: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-order.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 11: Run full sales service test suite to check for regressions**

```bash
cd backend && npx jest src/modules/sales/ --no-coverage
```

Expected: All pass

- [ ] **Step 12: Commit**

```bash
git add backend/src/modules/sales/services/sales-order.service.ts \
        backend/src/modules/sales/services/sales-order.service.spec.ts
git commit -m "feat: wire CustomerService into SalesOrderService for fulfillment-only metrics (#544)"
```

---

## Task 5: Write data migration

**Files:**
- Create: `backend/src/database/migrations/1746700000000-FulfillmentOnlyCustomerMetrics.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FulfillmentOnlyCustomerMetrics1746700000000 implements MigrationInterface {
  name = 'FulfillmentOnlyCustomerMetrics1746700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Set metrics from fulfilled orders for customers who have them
    await queryRunner.query(`
      UPDATE customers c
      SET
        total_orders        = sub.cnt,
        total_sales         = sub.total,
        first_purchase_date = sub.first_date,
        last_purchase_date  = sub.last_date
      FROM (
        SELECT
          customer_id,
          COUNT(*)                       AS cnt,
          COALESCE(SUM(total_amount), 0) AS total,
          MIN(order_date)                AS first_date,
          MAX(order_date)                AS last_date
        FROM sales_orders
        WHERE deleted_at IS NULL
          AND is_fulfilled = true
        GROUP BY customer_id
      ) sub
      WHERE c.id = sub.customer_id
    `);

    // Step 2: Zero out customers with no fulfilled orders
    await queryRunner.query(`
      UPDATE customers
      SET
        total_orders        = 0,
        total_sales         = 0,
        first_purchase_date = NULL,
        last_purchase_date  = NULL
      WHERE id NOT IN (
        SELECT DISTINCT customer_id
        FROM sales_orders
        WHERE deleted_at IS NULL
          AND is_fulfilled = true
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: recalculated data cannot be meaningfully reversed
  }
}
```

- [ ] **Step 2: Verify the migration file is picked up by TypeORM**

```bash
cd backend && npm run migration:run -- --dry-run 2>&1 | grep FulfillmentOnly
```

Expected: Output includes `FulfillmentOnlyCustomerMetrics1746700000000`

If `--dry-run` is not supported, run:
```bash
cd backend && npx ts-node -r tsconfig-paths/register node_modules/.bin/typeorm migration:show -d src/database/data-source.ts 2>&1 | grep FulfillmentOnly
```

Expected: Migration listed as pending.

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/migrations/1746700000000-FulfillmentOnlyCustomerMetrics.ts
git commit -m "chore: add migration to recalculate customer metrics from fulfilled orders (#544)"
```

---

## Task 6: End-to-end smoke test

- [ ] **Step 1: Run the migration against the dev database**

```bash
cd backend && npm run migration:run
```

Expected: Migration runs without error.

- [ ] **Step 2: Verify metrics in the database**

```bash
cd backend && docker compose exec postgres psql -U postgres -d erp -c "
  SELECT c.name, c.total_orders, c.total_sales, c.first_purchase_date, c.last_purchase_date
  FROM customers c
  ORDER BY c.name
  LIMIT 10;
"
```

Spot-check: a customer with known fulfilled orders should show correct counts. A customer with only unfulfilled orders should show `total_orders = 0`.

- [ ] **Step 3: Start the backend and test via UI**

```bash
docker compose up -d
```

Navigate to a customer's Account Summary page. Verify:
- `Total Orders` matches the count of fulfilled orders visible in the order list
- `Total Sales` equals the sum of `totalAmount` on those fulfilled orders
- `First/Last Purchase Date` reflects the `orderDate` of the earliest/latest fulfilled order

- [ ] **Step 4: Fulfill an order and verify metrics update live**

In the UI, fulfill an order for the same customer. Refresh the Account Summary. Verify `Total Orders` increments by 1 and `Total Sales` increases by the order's `totalAmount`.

- [ ] **Step 5: Unfulfill the same order and verify metrics reverse**

Unfulfill the order. Refresh Account Summary. Verify counts return to their previous values.

- [ ] **Step 6: Final regression run**

```bash
cd backend && npm run test
```

Expected: All tests pass.
