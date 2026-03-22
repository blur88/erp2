# Global Search Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fuzzy matching (pg_trgm fallback) and five new searchable entity types (Suppliers, Invoices, Customer Payments, Vendor Payments, Journal Entries) to the global search feature.

**Architecture:** Each domain service owns its own `searchGlobal` method with inline ILIKE-first, fuzzy-fallback logic. `SearchService` is a pure orchestrator that fans out to all sources in parallel via `Promise.all` and merges results. No shared fuzzy utility is introduced.

**Tech Stack:** NestJS 11, TypeORM (QueryBuilder), PostgreSQL pg_trgm, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-global-search-phase4-design.md`

---

## File Map

### Backend — created
- `backend/src/database/migrations/1773400000000-AddPgTrgmAndTrigramIndexes.ts` — enables pg_trgm extension and adds GIN trigram indexes to 12 columns across 7 tables

### Backend — modified
- `backend/src/modules/search/search.constants.ts` — add 5 new boosts + SCORE_FUZZY
- `backend/src/modules/search/search.permissions.ts` — add 5 new guard functions
- `backend/src/modules/search/search.service.ts` — add 5 new injected services, expand Promise.all to 10 sources
- `backend/src/modules/search/search.service.spec.ts` — extend to cover 10 sources
- `backend/src/modules/search/search.module.ts` — add AccountingModule import
- `backend/src/modules/sales/sales.module.ts` — add InvoiceService + PaymentService to exports
- `backend/src/modules/sales/services/customer.service.ts` — add fuzzy fallback to searchGlobal
- `backend/src/modules/sales/services/customer.service.spec.ts` — add fuzzy fallback tests
- `backend/src/modules/inventory/services/product.service.ts` — add fuzzy fallback to searchGlobal
- `backend/src/modules/sales/services/sales-order.service.ts` — add fuzzy fallback to searchGlobal
- `backend/src/modules/purchasing/services/purchase-order.service.ts` — add fuzzy fallback to searchGlobal
- `backend/src/modules/sales/services/invoice.service.ts` — add searchGlobal + private mapper
- `backend/src/modules/sales/services/payment.service.ts` — add searchGlobal + private mapper
- `backend/src/modules/purchasing/services/supplier.service.ts` — add searchGlobal + private mapper
- `backend/src/modules/purchasing/services/vendor-payment.service.ts` — add searchGlobal + private mapper
- `backend/src/modules/accounting/services/journal-entry.service.ts` — add searchGlobal + private mapper

### Frontend — modified
- `frontend/src/types/search.ts` — extend GlobalSearchResultType union
- `frontend/src/utils/recentSearch.ts` — extend type union in RecentSearchItem
- `frontend/src/components/common/SearchModal.tsx` — extend GROUP_ORDER, GROUP_LABELS, TYPE_BADGES
- `frontend/src/components/common/__tests__/SearchModal.test.tsx` — extend for new types

---

## Task 1: Migration — enable pg_trgm and add trigram indexes

**Files:**
- Create: `backend/src/database/migrations/1773400000000-AddPgTrgmAndTrigramIndexes.ts`

This migration must run with `transaction: false` because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. Do NOT drop the pg_trgm extension in `down()` — it is shared across the database.

- [ ] **Step 1: Create the migration file**

```typescript
// backend/src/database/migrations/1773400000000-AddPgTrgmAndTrigramIndexes.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgTrgmAndTrigramIndexes1773400000000
  implements MigrationInterface
{
  transaction = false; // Required for CREATE INDEX CONCURRENTLY

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_trgm
       ON products USING gin (name gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_barcode_trgm
       ON products USING gin (barcode gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_name_trgm
       ON customers USING gin (name gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone_trgm
       ON customers USING gin (phone gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_ordernumber_trgm
       ON sales_orders USING gin ("orderNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_ordernumber_trgm
       ON purchase_orders USING gin ("orderNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suppliers_companyname_trgm
       ON suppliers USING gin ("companyName" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_invoicenumber_trgm
       ON invoices USING gin ("invoiceNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_paymentnumber_trgm
       ON payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_payments_paymentnumber_trgm
       ON vendor_payments USING gin ("paymentNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_payments_referencenumber_trgm
       ON vendor_payments USING gin ("referenceNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_referencenumber_trgm
       ON journal_entries USING gin ("referenceNumber" gin_trgm_ops)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DO NOT drop the pg_trgm extension — it is shared across the database
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_products_name_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_products_barcode_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_customers_name_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_customers_phone_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_sales_orders_ordernumber_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_purchase_orders_ordernumber_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_suppliers_companyname_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_invoices_invoicenumber_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_payments_paymentnumber_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_vendor_payments_paymentnumber_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_vendor_payments_referencenumber_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_journal_entries_referencenumber_trgm`,
    );
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd backend && npm run migration:run
```

Expected: no errors. Migration applies cleanly.

- [ ] **Step 3: Verify indexes exist in the database**

```bash
cd backend && npx ts-node -e "
const { DataSource } = require('typeorm');
// Quick check — connect to DB and list trgm indexes
" 2>/dev/null || docker exec erp2-postgres-1 psql -U postgres -d erp -c "\di *trgm*"
```

Expected: 12 rows, one per index.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/1773400000000-AddPgTrgmAndTrigramIndexes.ts
git commit -m "feat(search): add pg_trgm extension and trigram indexes for fuzzy search"
```

---

## Task 2: Constants and permissions

**Files:**
- Modify: `backend/src/modules/search/search.constants.ts`
- Modify: `backend/src/modules/search/search.permissions.ts`

- [ ] **Step 1: Add new constants to search.constants.ts**

Open `backend/src/modules/search/search.constants.ts` and append after the existing boost constants:

```typescript
// New entity boosts (Phase 4)
export const BOOST_INVOICE          = 9;  // closely tied to transactions, high-frequency lookup
export const BOOST_CUSTOMER_PAYMENT = 8;  // same tier as CUSTOMER
export const BOOST_VENDOR_PAYMENT   = 8;  // same tier as CUSTOMER
export const BOOST_SUPPLIER         = 7;  // slightly below Customer in typical usage
export const BOOST_JOURNAL          = 4;  // specialist/accounting use, low search frequency

// Fuzzy fallback score: below all normal text-match tiers.
// Used only when exact/startsWith/contains return zero results.
export const SCORE_FUZZY = 40;
```

- [ ] **Step 2: Add new permission guards to search.permissions.ts**

Open `backend/src/modules/search/search.permissions.ts` and append after the existing guards:

```typescript
export function canSearchSuppliers(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}

export function canSearchInvoices(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchCustomerPayments(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchVendorPayments(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}

export function canSearchJournalEntries(role: UserRole): boolean {
  return FINANCE_ROLES.includes(role);
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/search/search.constants.ts \
        backend/src/modules/search/search.permissions.ts
git commit -m "feat(search): add Phase 4 boost constants and permission guards"
```

---

## Task 3: Fuzzy fallback — CustomerService

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts`
- Modify: `backend/src/modules/sales/services/customer.service.spec.ts`

The existing `searchGlobal` runs ILIKE. Add a fuzzy fallback block after it. Also import `SCORE_FUZZY` from constants.

- [ ] **Step 1: Write the failing fuzzy test in customer.service.spec.ts**

In the existing `describe('searchGlobal')` block, add after the existing tests:

```typescript
it('falls back to fuzzy search when ILIKE returns empty', async () => {
  const fuzzyCustomer = { id: 'c2', name: 'Acme Corp', phone: null };

  // First call (ILIKE) returns empty; second call (fuzzy) returns results
  let callCount = 0;
  customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? [] : [fuzzyCustomer]);
    }),
  } as any);

  const results = await service.searchGlobal('Akme', {
    role: UserRole.SALES_STAFF,
  } as any);

  expect(results).toHaveLength(1);
  expect(results[0].label).toBe('Acme Corp');
  expect(results[0].score).toBe(48); // SCORE_FUZZY(40) + BOOST_CUSTOMER(8)
});

it('fuzzy fallback returns empty when no fuzzy matches', async () => {
  customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  } as any);

  const results = await service.searchGlobal('zzzqqq', {
    role: UserRole.SALES_STAFF,
  } as any);
  expect(results).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: the 2 new tests FAIL (fuzzy fallback not yet implemented).

- [ ] **Step 3: Add fuzzy fallback to customer.service.ts searchGlobal**

Import `SCORE_FUZZY` at the top alongside other constants:

```typescript
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_CUSTOMER,
} from '../../search/search.constants';
```

Then replace the body of `searchGlobal` with:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchCustomers(user.role)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.customerRepository
    .createQueryBuilder('customer')
    .where('customer.deletedAt IS NULL')
    .andWhere(
      '(customer.name ILIKE :q OR customer.phone ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((customer) => this.mapCustomer(customer, q, false));
  }

  // Fuzzy fallback — only runs when ILIKE returns zero results
  const fuzzyResults = await this.customerRepository
    .createQueryBuilder('customer')
    .addSelect(
      'GREATEST(similarity(customer.name, :q), similarity(customer.phone, :q))',
      'sim',
    )
    .where('customer.deletedAt IS NULL')
    .andWhere(
      '(similarity(customer.name, :q) > 0.3 OR similarity(customer.phone, :q) > 0.3)',
    )
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((customer) => this.mapCustomer(customer, q, true));
}

private mapCustomer(
  customer: Customer,
  q: string,
  fuzzy: boolean,
): GlobalSearchResultDto {
  const name = customer.name?.toLowerCase() ?? '';
  const phone = customer.phone?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : phone && phone === q
      ? SCORE_EXACT_CODE
      : phone && phone.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : name === q
          ? SCORE_EXACT_NAME
          : name.startsWith(q)
            ? SCORE_STARTSWITH_NAME
            : SCORE_CONTAINS;

  return {
    type: 'customer',
    id: customer.id,
    label: customer.name,
    description: customer.phone ?? undefined,
    route: `/sales/customers/${customer.id}`,
    score: baseScore + BOOST_CUSTOMER,
  };
}
```

- [ ] **Step 4: Run all customer service tests**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts \
        backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "feat(search): add fuzzy fallback to CustomerService.searchGlobal"
```

---

## Task 4: Fuzzy fallback — ProductService, SalesOrderService, PurchaseOrderService

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`
- Modify: `backend/src/modules/inventory/services/product.service.spec.ts`
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

Same pattern as Task 3. Each service already has a `searchGlobal` — add fuzzy fallback after the ILIKE block.

**Important for SalesOrder and PurchaseOrder:** The existing ILIKE queries join a related entity and search two columns. The ILIKE path must be preserved exactly. Only the fuzzy fallback (single column, orderNumber only) is new.

- [ ] **Step 1: Write failing fuzzy tests for ProductService**

In `backend/src/modules/inventory/services/product.service.spec.ts`, add inside the existing `describe('searchGlobal')` block:

```typescript
it('falls back to fuzzy search when ILIKE returns empty', async () => {
  const fuzzyProduct = { id: 'p2', name: 'Widget Pro', barcode: null };

  let callCount = 0;
  productRepository.createQueryBuilder = jest.fn().mockReturnValue({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? [] : [fuzzyProduct]);
    }),
  } as any);

  const results = await service.searchGlobal('Widgt', {
    role: UserRole.ADMIN,
  } as any);

  expect(results).toHaveLength(1);
  expect(results[0].label).toBe('Widget Pro');
  expect(results[0].score).toBe(46); // SCORE_FUZZY(40) + BOOST_PRODUCT(6)
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage
```

Expected: new test FAILS.

- [ ] **Step 3: Add fuzzy fallback to product.service.ts**

Import `SCORE_FUZZY` alongside existing constants in product.service.ts.

Replace `searchGlobal` body (currently around line 303) with the following pattern. The existing scoring logic for the ILIKE path should be extracted into a private `mapProduct` method:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchProducts(user.role)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.productRepository
    .createQueryBuilder('product')
    .where('product.deletedAt IS NULL')
    .andWhere(
      '(product.name ILIKE :q OR product.barcode ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((p) => this.mapProduct(p, q, false));
  }

  const fuzzyResults = await this.productRepository
    .createQueryBuilder('product')
    .addSelect(
      'GREATEST(similarity(product.name, :q), similarity(product.barcode, :q))',
      'sim',
    )
    .where('product.deletedAt IS NULL')
    .andWhere(
      '(similarity(product.name, :q) > 0.3 OR similarity(product.barcode, :q) > 0.3)',
    )
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((p) => this.mapProduct(p, q, true));
}

private mapProduct(p: Product, q: string, fuzzy: boolean): GlobalSearchResultDto {
  const barcode = p.barcode?.toLowerCase() ?? '';
  const name = p.name?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : barcode && barcode === q
      ? SCORE_EXACT_CODE
      : barcode && barcode.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : name === q
          ? SCORE_EXACT_NAME
          : name.startsWith(q)
            ? SCORE_STARTSWITH_NAME
            : SCORE_CONTAINS;

  return {
    type: 'product',
    id: p.id,
    label: p.name,
    description: p.barcode ?? undefined,
    route: `/inventory/products/${p.id}`,
    score: baseScore + BOOST_PRODUCT,
  };
}
```

- [ ] **Step 4: Run product tests to verify they pass**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Add fuzzy fallback to sales-order.service.ts**

The existing `searchGlobal` (line 363) uses alias `order`, joins `order.customer`, and ILIKE-searches both `order.orderNumber` and `customer.name`. Preserve this ILIKE path exactly. Only add the fuzzy fallback block and refactor into a private mapper.

Import `SCORE_FUZZY` alongside existing constants. Replace `searchGlobal` with:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchSalesOrders(user.role)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  // ILIKE: search orderNumber AND customer name (preserves existing behavior)
  const results = await this.salesOrderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.customer', 'customer')
    .where('order.deletedAt IS NULL')
    .andWhere(
      '(order.orderNumber ILIKE :q OR customer.name ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((order) => this.mapSalesOrder(order, q, false));
  }

  // Fuzzy fallback — orderNumber only (no trgm index on customer.name)
  const fuzzyResults = await this.salesOrderRepository
    .createQueryBuilder('order')
    .addSelect('similarity(order.orderNumber, :q)', 'sim')
    .leftJoinAndSelect('order.customer', 'customer')
    .where('order.deletedAt IS NULL')
    .andWhere('similarity(order.orderNumber, :q) > 0.3')
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((order) => this.mapSalesOrder(order, q, true));
}

private mapSalesOrder(order: SalesOrder, q: string, fuzzy: boolean): GlobalSearchResultDto {
  const orderNum = order.orderNumber?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : orderNum === q
      ? SCORE_EXACT_CODE
      : orderNum.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : SCORE_CONTAINS;

  return {
    type: 'transaction',
    id: order.id,
    label: order.orderNumber,
    description: order.customer?.name ?? undefined,
    route: `/sales/orders/${order.id}/edit`,
    score: baseScore + BOOST_TRANSACTION,
  };
}
```

Note: the route uses `/edit` suffix — this matches the existing implementation. Keep it.

- [ ] **Step 6: Add fuzzy fallback to purchase-order.service.ts**

The existing `searchGlobal` (line 343) uses alias `order`, joins `order.supplier`, and ILIKE-searches both `order.orderNumber` and `supplier.companyName`. Preserve this ILIKE path exactly.

Import `SCORE_FUZZY`. Replace `searchGlobal` with:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchPurchaseOrders(user.role)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  // ILIKE: search orderNumber AND supplier name (preserves existing behavior)
  const results = await this.purchaseOrderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.supplier', 'supplier')
    .where('order.deletedAt IS NULL')
    .andWhere(
      '(order.orderNumber ILIKE :q OR supplier.companyName ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((order) => this.mapPurchaseOrder(order, q, false));
  }

  // Fuzzy fallback — orderNumber only (no trgm index on supplier.companyName)
  const fuzzyResults = await this.purchaseOrderRepository
    .createQueryBuilder('order')
    .addSelect('similarity(order.orderNumber, :q)', 'sim')
    .leftJoinAndSelect('order.supplier', 'supplier')
    .where('order.deletedAt IS NULL')
    .andWhere('similarity(order.orderNumber, :q) > 0.3')
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((order) => this.mapPurchaseOrder(order, q, true));
}

private mapPurchaseOrder(order: PurchaseOrder, q: string, fuzzy: boolean): GlobalSearchResultDto {
  const orderNum = order.orderNumber?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : orderNum === q
      ? SCORE_EXACT_CODE
      : orderNum.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : SCORE_CONTAINS;

  return {
    type: 'transaction',
    id: order.id,
    label: order.orderNumber,
    description: order.supplier?.companyName ?? undefined,
    route: `/purchasing/orders/${order.id}/edit`,
    score: baseScore + BOOST_TRANSACTION,
  };
}
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run backend tests**

```bash
cd backend && npm run test
```

Expected: all tests PASS including the new product fuzzy test.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts \
        backend/src/modules/inventory/services/product.service.spec.ts \
        backend/src/modules/sales/services/sales-order.service.ts \
        backend/src/modules/purchasing/services/purchase-order.service.ts
git commit -m "feat(search): add fuzzy fallback to Product, SalesOrder, PurchaseOrder searchGlobal"
```

---

## Task 5: New entity — SupplierService.searchGlobal

**Files:**
- Modify: `backend/src/modules/purchasing/services/supplier.service.ts`

`SupplierService` is already exported from `PurchasingModule`. No module changes needed.

- [ ] **Step 1: Add imports to supplier.service.ts**

```typescript
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchSuppliers } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_SUPPLIER,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
```

- [ ] **Step 2: Add searchGlobal and private mapper to SupplierService**

```typescript
async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
  if (!canSearchSuppliers(user.role as UserRole)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.supplierRepository
    .createQueryBuilder('supplier')
    .where('supplier.deletedAt IS NULL')
    .andWhere('supplier.companyName ILIKE :q', { q: `%${trimmed}%` })
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((s) => this.mapSupplier(s, q, false));
  }

  const fuzzyResults = await this.supplierRepository
    .createQueryBuilder('supplier')
    .addSelect('similarity(supplier.companyName, :q)', 'sim')
    .where('supplier.deletedAt IS NULL')
    .andWhere('similarity(supplier.companyName, :q) > 0.3')
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((s) => this.mapSupplier(s, q, true));
}

private mapSupplier(s: Supplier, q: string, fuzzy: boolean): GlobalSearchResultDto {
  const name = s.companyName?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : name === q
      ? SCORE_EXACT_NAME
      : name.startsWith(q)
        ? SCORE_STARTSWITH_NAME
        : SCORE_CONTAINS;

  return {
    type: 'supplier',
    id: s.id,
    label: s.companyName,
    description: s.phone ?? undefined,
    route: `/purchasing/suppliers/${s.id}`,
    score: baseScore + BOOST_SUPPLIER,
  };
}
```

Note: `Supplier` is the entity type — it should already be imported in this file. Check existing imports before adding.

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/purchasing/services/supplier.service.ts
git commit -m "feat(search): add searchGlobal to SupplierService"
```

---

## Task 6: New entity — InvoiceService.searchGlobal

**Files:**
- Modify: `backend/src/modules/sales/services/invoice.service.ts`
- Modify: `backend/src/modules/sales/sales.module.ts`

InvoiceService is NOT currently exported from SalesModule — this needs to be fixed.

- [ ] **Step 1: Create invoice.service.spec.ts with failing tests**

No spec file exists for InvoiceService. Create it at `backend/src/modules/sales/services/invoice.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceService } from './invoice.service';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Product } from '../../../database/entities/product.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import { AuditLogService } from '../../audit-logs/audit-log.service';
import { UserRole } from '../../../database/entities/user.entity';

describe('InvoiceService.searchGlobal', () => {
  let service: InvoiceService;
  let invoiceRepository: { createQueryBuilder: jest.Mock };

  const mockQb = () => ({
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  });

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
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  it('returns empty for non-sales role', async () => {
    const result = await service.searchGlobal('INV-001', {
      role: UserRole.INVENTORY_STAFF,
    } as any);
    expect(result).toEqual([]);
    expect(invoiceRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns matching invoices as GlobalSearchResultDto', async () => {
    const mockInvoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      customer: { name: 'ABC Corp' },
    };
    const qb = mockQb();
    qb.getMany.mockResolvedValue([mockInvoice]);
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    const results = await service.searchGlobal('INV-001', {
      role: UserRole.SALES_STAFF,
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'invoice',
      id: 'inv-1',
      label: 'INV-001',
      route: '/sales/invoices/inv-1',
    });
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('falls back to fuzzy when ILIKE returns empty', async () => {
    const fuzzyInvoice = { id: 'inv-2', invoiceNumber: 'INV-002', customer: { name: 'XYZ Ltd' } };
    let callCount = 0;
    const qb = mockQb();
    qb.getMany.mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? [] : [fuzzyInvoice]);
    });
    invoiceRepository.createQueryBuilder.mockReturnValue(qb);

    const results = await service.searchGlobal('INV-00', {
      role: UserRole.SALES_STAFF,
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(49); // SCORE_FUZZY(40) + BOOST_INVOICE(9)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/invoice.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `searchGlobal` does not exist yet. If the test module compilation itself fails (due to AuditLogService having complex deps), adjust the mock to `useValue: { log: jest.fn(), createLog: jest.fn() }` or similar to match what `InvoiceService` actually calls.

- [ ] **Step 3: Add searchGlobal and mapper to invoice.service.ts**

Add these imports at the top:

```typescript
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchInvoices } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_INVOICE,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
```

Add methods to the class:

```typescript
async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
  if (!canSearchInvoices(user.role as UserRole)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.invoiceRepository
    .createQueryBuilder('invoice')
    .leftJoinAndSelect('invoice.customer', 'customer')
    .where('invoice.deletedAt IS NULL')
    .andWhere('invoice.invoiceNumber ILIKE :q', { q: `%${trimmed}%` })
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((inv) => this.mapInvoice(inv, q, false));
  }

  const fuzzyResults = await this.invoiceRepository
    .createQueryBuilder('invoice')
    .addSelect('similarity(invoice.invoiceNumber, :q)', 'sim')
    .leftJoinAndSelect('invoice.customer', 'customer')
    .where('invoice.deletedAt IS NULL')
    .andWhere('similarity(invoice.invoiceNumber, :q) > 0.3')
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((inv) => this.mapInvoice(inv, q, true));
}

private mapInvoice(inv: Invoice, q: string, fuzzy: boolean): GlobalSearchResultDto {
  const num = inv.invoiceNumber?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : num === q
      ? SCORE_EXACT_CODE
      : num.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : SCORE_CONTAINS;

  return {
    type: 'invoice',
    id: inv.id,
    label: inv.invoiceNumber,
    description: inv.customer?.name ?? undefined,
    route: `/sales/invoices/${inv.id}`,
    score: baseScore + BOOST_INVOICE,
  };
}
```

Note: verify that `this.invoiceRepository` is the correct repository name in the constructor — check existing repo names in this service file before implementing.

- [ ] **Step 4: Export InvoiceService from SalesModule**

In `backend/src/modules/sales/sales.module.ts`, add `InvoiceService` to the `exports` array:

```typescript
exports: [
  CustomerService,
  SalesOrderService,
  InvoiceService,  // add this
],
```

- [ ] **Step 5: Run tests**

```bash
cd backend && npx jest src/modules/sales/services/invoice.service.spec.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/sales/services/invoice.service.ts \
        backend/src/modules/sales/sales.module.ts
git commit -m "feat(search): add searchGlobal to InvoiceService, export from SalesModule"
```

---

## Task 7: New entity — PaymentService.searchGlobal

**Files:**
- Modify: `backend/src/modules/sales/services/payment.service.ts`
- Modify: `backend/src/modules/sales/sales.module.ts`

PaymentService is also not currently exported from SalesModule.

- [ ] **Step 1: Add searchGlobal and mapper to payment.service.ts**

Add imports at top:

```typescript
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchCustomerPayments } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_CUSTOMER_PAYMENT,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
```

Add methods to class:

```typescript
async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
  if (!canSearchCustomerPayments(user.role as UserRole)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.paymentRepository
    .createQueryBuilder('payment')
    .where('payment.deletedAt IS NULL')
    .andWhere('payment.paymentNumber ILIKE :q', { q: `%${trimmed}%` })
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((p) => this.mapPayment(p, q, false));
  }

  const fuzzyResults = await this.paymentRepository
    .createQueryBuilder('payment')
    .addSelect('similarity(payment.paymentNumber, :q)', 'sim')
    .where('payment.deletedAt IS NULL')
    .andWhere('similarity(payment.paymentNumber, :q) > 0.3')
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((p) => this.mapPayment(p, q, true));
}

private mapPayment(p: Payment, q: string, fuzzy: boolean): GlobalSearchResultDto {
  const num = p.paymentNumber?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : num === q
      ? SCORE_EXACT_CODE
      : num.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : SCORE_CONTAINS;

  return {
    type: 'customer_payment',
    id: p.id,
    label: p.paymentNumber,
    description: undefined,
    route: `/sales/payments/${p.id}`,
    score: baseScore + BOOST_CUSTOMER_PAYMENT,
  };
}
```

Note: verify the payment repository name (`this.paymentRepository`) by checking the existing constructor.

- [ ] **Step 2: Export PaymentService from SalesModule**

In `backend/src/modules/sales/sales.module.ts`, add `PaymentService` to exports:

```typescript
exports: [
  CustomerService,
  SalesOrderService,
  InvoiceService,
  PaymentService,  // add this
],
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/sales/services/payment.service.ts \
        backend/src/modules/sales/sales.module.ts
git commit -m "feat(search): add searchGlobal to PaymentService, export from SalesModule"
```

---

## Task 8: New entity — VendorPaymentService.searchGlobal

**Files:**
- Modify: `backend/src/modules/purchasing/services/vendor-payment.service.ts`

VendorPaymentService is already exported from PurchasingModule.

- [ ] **Step 1: Add searchGlobal and mapper to vendor-payment.service.ts**

Add imports:

```typescript
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchVendorPayments } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_VENDOR_PAYMENT,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
```

Add methods to class:

```typescript
async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
  if (!canSearchVendorPayments(user.role as UserRole)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.vendorPaymentRepository
    .createQueryBuilder('vp')
    .where('vp.deletedAt IS NULL')
    .andWhere(
      '(vp.paymentNumber ILIKE :q OR vp.referenceNumber ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((vp) => this.mapVendorPayment(vp, q, false));
  }

  const fuzzyResults = await this.vendorPaymentRepository
    .createQueryBuilder('vp')
    .addSelect(
      'GREATEST(similarity(vp.paymentNumber, :q), similarity(vp.referenceNumber, :q))',
      'sim',
    )
    .where('vp.deletedAt IS NULL')
    .andWhere(
      '(similarity(vp.paymentNumber, :q) > 0.3 OR similarity(vp.referenceNumber, :q) > 0.3)',
    )
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((vp) => this.mapVendorPayment(vp, q, true));
}

private mapVendorPayment(
  vp: VendorPayment,
  q: string,
  fuzzy: boolean,
): GlobalSearchResultDto {
  const payNum = vp.paymentNumber?.toLowerCase() ?? '';
  const refNum = vp.referenceNumber?.toLowerCase() ?? '';
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : payNum === q || refNum === q
      ? SCORE_EXACT_CODE
      : payNum.startsWith(q) || refNum.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : SCORE_CONTAINS;

  return {
    type: 'vendor_payment',
    id: vp.id,
    label: vp.paymentNumber,
    description: vp.referenceNumber ?? undefined,
    route: `/purchasing/vendor-payments/${vp.id}`,
    score: baseScore + BOOST_VENDOR_PAYMENT,
  };
}
```

Note: verify the repository field name in the VendorPaymentService constructor before implementing.

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/purchasing/services/vendor-payment.service.ts
git commit -m "feat(search): add searchGlobal to VendorPaymentService"
```

---

## Task 9: New entity — JournalEntryService.searchGlobal

**Files:**
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

JournalEntryService is already exported from AccountingModule.

ILIKE searches both `referenceNumber` AND `description`. Fuzzy fallback searches `referenceNumber` only (no trigram index on description). Scoring comparison uses `referenceNumber` only — description-only ILIKE hits will score as `SCORE_CONTAINS`.

- [ ] **Step 1: Add searchGlobal and mapper to journal-entry.service.ts**

Add imports:

```typescript
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchJournalEntries } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_JOURNAL,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
```

Add methods:

```typescript
async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
  if (!canSearchJournalEntries(user.role as UserRole)) return [];

  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  const results = await this.journalEntryRepository
    .createQueryBuilder('je')
    .where('je.deletedAt IS NULL')
    .andWhere(
      '(je.referenceNumber ILIKE :q OR je.description ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  if (results.length > 0) {
    return results.map((je) => this.mapJournalEntry(je, q, false));
  }

  // Fuzzy fallback on referenceNumber only (no trigram index on description)
  const fuzzyResults = await this.journalEntryRepository
    .createQueryBuilder('je')
    .addSelect('similarity(je.referenceNumber, :q)', 'sim')
    .where('je.deletedAt IS NULL')
    .andWhere('similarity(je.referenceNumber, :q) > 0.3')
    .orderBy('sim', 'DESC')
    .setParameter('q', trimmed)
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return fuzzyResults.map((je) => this.mapJournalEntry(je, q, true));
}

private mapJournalEntry(
  je: JournalEntry,
  q: string,
  fuzzy: boolean,
): GlobalSearchResultDto {
  const ref = je.referenceNumber?.toLowerCase() ?? '';
  // Scoring on referenceNumber only; description-only hits fall to SCORE_CONTAINS
  const baseScore = fuzzy
    ? SCORE_FUZZY
    : ref === q
      ? SCORE_EXACT_CODE
      : ref.startsWith(q)
        ? SCORE_STARTSWITH_CODE
        : SCORE_CONTAINS;

  return {
    type: 'journal_entry',
    id: je.id,
    label: je.referenceNumber,
    description: je.description ?? undefined,
    route: `/accounting/journal-entries/${je.id}`,
    score: baseScore + BOOST_JOURNAL,
  };
}
```

Note: verify the repository field name (`this.journalEntryRepository`) in the constructor.

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(search): add searchGlobal to JournalEntryService"
```

---

## Task 10: Wire SearchService and SearchModule

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`
- Modify: `backend/src/modules/search/search.module.ts`
- Modify: `backend/src/modules/search/search.service.spec.ts`

- [ ] **Step 1: Write failing tests for new sources in search.service.spec.ts**

In the existing `beforeEach` block, add mocks for the 5 new services:

```typescript
// Add to imports at top of spec:
import { SupplierService } from '../purchasing/services/supplier.service';
import { InvoiceService } from '../sales/services/invoice.service';
import { PaymentService } from '../sales/services/payment.service';
import { VendorPaymentService } from '../purchasing/services/vendor-payment.service';
import { JournalEntryService } from '../accounting/services/journal-entry.service';

// Add to module providers:
{
  provide: SupplierService,
  useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
},
{
  provide: InvoiceService,
  useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
},
{
  provide: PaymentService,
  useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
},
{
  provide: VendorPaymentService,
  useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
},
{
  provide: JournalEntryService,
  useValue: { searchGlobal: jest.fn().mockResolvedValue([]) },
},
```

Add a new test:

```typescript
it('fans out to all ten sources in parallel', async () => {
  await service.search('abc', mockUser);

  expect(customerService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(productService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(salesOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(purchaseOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(supplierService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(invoiceService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(paymentService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(vendorPaymentService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  expect(journalEntryService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
});
```

Also update the existing `'fans out to all four sources in parallel'` test to `'fans out to all ten sources in parallel'` or keep both (old one will still pass).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: the new fan-out test FAILS (SearchService doesn't inject new services yet).

- [ ] **Step 3: Update SearchService constructor and Promise.all**

In `backend/src/modules/search/search.service.ts`, add 5 new constructor params and expand the Promise.all:

```typescript
constructor(
  private readonly customerService: CustomerService,
  private readonly productService: ProductService,
  private readonly salesOrderService: SalesOrderService,
  private readonly purchaseOrderService: PurchaseOrderService,
  private readonly supplierService: SupplierService,
  private readonly invoiceService: InvoiceService,
  private readonly paymentService: PaymentService,
  private readonly vendorPaymentService: VendorPaymentService,
  private readonly journalEntryService: JournalEntryService,
) {}
```

Replace the Promise.all block in `search()`:

```typescript
const [
  pages,
  customers,
  products,
  salesOrders,
  purchaseOrders,
  suppliers,
  invoices,
  customerPayments,
  vendorPayments,
  journalEntries,
] = await Promise.all([
  this.safeSearch('pages', () => Promise.resolve(this.searchPages(trimmed, user))),
  this.safeSearch('customers', () => this.customerService.searchGlobal(trimmed, user)),
  this.safeSearch('products', () => this.productService.searchGlobal(trimmed, user)),
  this.safeSearch('salesOrders', () => this.salesOrderService.searchGlobal(trimmed, user)),
  this.safeSearch('purchaseOrders', () => this.purchaseOrderService.searchGlobal(trimmed, user)),
  this.safeSearch('suppliers', () => this.supplierService.searchGlobal(trimmed, user)),
  this.safeSearch('invoices', () => this.invoiceService.searchGlobal(trimmed, user)),
  this.safeSearch('customerPayments', () => this.paymentService.searchGlobal(trimmed, user)),
  this.safeSearch('vendorPayments', () => this.vendorPaymentService.searchGlobal(trimmed, user)),
  this.safeSearch('journalEntries', () => this.journalEntryService.searchGlobal(trimmed, user)),
]);

const results = [
  ...pages,
  ...customers,
  ...products,
  ...salesOrders,
  ...purchaseOrders,
  ...suppliers,
  ...invoices,
  ...customerPayments,
  ...vendorPayments,
  ...journalEntries,
]
  .sort((a, b) => {
    // Preserve the existing sort exactly as written in the current file
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.label ?? '').toLowerCase().localeCompare((b.label ?? '').toLowerCase());
  })
  .slice(0, SEARCH_RESPONSE_LIMIT);
```

Add the necessary imports for the 5 new services at the top of the file.

- [ ] **Step 4: Update SearchModule**

In `backend/src/modules/search/search.module.ts`:

```typescript
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [SalesModule, InventoryModule, PurchasingModule, AccountingModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

- [ ] **Step 5: Run all search tests**

```bash
cd backend && npx jest src/modules/search/ --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/search/search.service.ts \
        backend/src/modules/search/search.module.ts \
        backend/src/modules/search/search.service.spec.ts
git commit -m "feat(search): wire 5 new entity sources into SearchService and SearchModule"
```

---

## Task 11: Frontend — extend type contract and SearchModal

**Files:**
- Modify: `frontend/src/types/search.ts`
- Modify: `frontend/src/utils/recentSearch.ts`
- Modify: `frontend/src/components/common/SearchModal.tsx`
- Modify: `frontend/src/components/common/__tests__/SearchModal.test.tsx`

- [ ] **Step 1: Extend GlobalSearchResultType in types/search.ts**

Replace the type union:

```typescript
export type GlobalSearchResultType =
  | 'page'
  | 'customer'
  | 'product'
  | 'transaction'          // Sales Orders + Purchase Orders — unchanged
  | 'supplier'
  | 'invoice'
  | 'customer_payment'
  | 'vendor_payment'
  | 'journal_entry'
```

No other changes to this file.

- [ ] **Step 2: Extend RecentSearchItem type in recentSearch.ts**

Update the `type` field in `RecentSearchItem`:

```typescript
export interface RecentSearchItem {
  label: string
  description?: string
  route: string
  type:
    | 'page'
    | 'customer'
    | 'product'
    | 'transaction'
    | 'supplier'
    | 'invoice'
    | 'customer_payment'
    | 'vendor_payment'
    | 'journal_entry'
  timestamp: number
}
```

No logic changes.

- [ ] **Step 3: Run TypeScript check to catch exhaustiveness errors**

```bash
cd frontend && npm run type-check
```

Expected: TypeScript errors on `GROUP_LABELS` and `TYPE_BADGES` — these `Record<GlobalSearchResultType, string>` objects are now missing keys. That's expected and will be fixed in the next step.

- [ ] **Step 4: Extend GROUP_ORDER, GROUP_LABELS, TYPE_BADGES in SearchModal.tsx**

```typescript
const GROUP_ORDER: GlobalSearchResultType[] = [
  'page',
  'customer',
  'product',
  'transaction',
  'supplier',
  'invoice',
  'customer_payment',
  'vendor_payment',
  'journal_entry',
]

const GROUP_LABELS: Record<GlobalSearchResultType, string> = {
  page: 'Pages',
  customer: 'Customers',
  product: 'Products',
  transaction: 'Transactions',
  supplier: 'Suppliers',
  invoice: 'Invoices',
  customer_payment: 'Customer Payments',
  vendor_payment: 'Vendor Payments',
  journal_entry: 'Journal Entries',
}

const TYPE_BADGES: Record<GlobalSearchResultType, string> = {
  page: 'Page',
  customer: 'Customer',
  product: 'Product',
  transaction: 'Transaction',
  supplier: 'Supplier',
  invoice: 'Invoice',
  customer_payment: 'Customer Payment',
  vendor_payment: 'Vendor Payment',
  journal_entry: 'Journal',
}
```

- [ ] **Step 5: Run TypeScript check again**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Extend SearchModal tests for new types**

In `frontend/src/components/common/__tests__/SearchModal.test.tsx`, add a test verifying new types render in groups:

```typescript
it('renders new entity type groups when results include them', () => {
  const results = [
    { type: 'supplier' as const, id: 's1', label: 'ACME Supplies', route: '/purchasing/suppliers/s1', score: 77 },
    { type: 'invoice' as const, id: 'i1', label: 'INV-001', route: '/sales/invoices/i1', score: 69 },
    { type: 'journal_entry' as const, id: 'j1', label: 'JE-2026-001', route: '/accounting/journal-entries/j1', score: 44 },
  ]
  vi.mocked(useSearchGlobalQuery).mockReturnValue({
    data: { query: 'test', results },
    isLoading: false,
    isError: false,
    isFetching: false,
  } as any)

  render(<SearchModal open onClose={vi.fn()} />)
  // Type 2+ chars to trigger search
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ac' } })

  expect(screen.getByText('Suppliers')).toBeInTheDocument()
  expect(screen.getByText('Invoices')).toBeInTheDocument()
  expect(screen.getByText('Journal Entries')).toBeInTheDocument()
})
```

- [ ] **Step 7: Run frontend tests**

```bash
cd frontend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/search.ts \
        frontend/src/utils/recentSearch.ts \
        frontend/src/components/common/SearchModal.tsx \
        frontend/src/components/common/__tests__/SearchModal.test.tsx
git commit -m "feat(search): extend frontend type contract and SearchModal for Phase 4 entities"
```

---

## Task 12: End-to-end smoke test and final verification

- [ ] **Step 1: Start the dev stack**

```bash
docker compose up -d
```

Or for backend only:
```bash
cd backend && npm run start:dev
```

- [ ] **Step 2: Smoke test each new entity in the search modal**

Log in as admin. Open the search modal (Ctrl+K or search icon). Test:

| Query | Expected results |
|---|---|
| `INV-` | Invoice results with type badge "Invoice" |
| `PAY-` | Customer Payment results with type badge "Customer Payment" |
| A supplier name | Supplier results with badge "Supplier" |
| `JE-` | Journal Entry results with badge "Journal" |
| Vendor payment number | Vendor Payment results with badge "Vendor Payment" |
| A deliberate typo (e.g. `acma` for `acme`) | Fuzzy fallback results appear |
| A query with no match | Empty state, no errors |

- [ ] **Step 3: Run the full backend test suite one final time**

```bash
cd backend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 4: Run the full frontend test suite one final time**

```bash
cd frontend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 5: Run linters**

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

Expected: no errors.
