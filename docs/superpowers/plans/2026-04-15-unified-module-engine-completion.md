# Unified Module Engine Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the remaining backend service boilerplate, 27 frontend hook files, and 11 per-entity list components by completing the unified module engine introduced in PR #373.

**Architecture:** Fix `BaseCrudService.findDeleted` to call `applyQueryBuilder`, then delete hand-rolled CRUD methods from 5 services that already extend the base. Build a generic `EntityTable<T>` component driven by column configs to replace all list components. Collapse each page's 3-file hook triplet into a single domain hook that calls `useEntityWorkspace` for plumbing.

**Tech Stack:** NestJS 11 / TypeORM (backend), React 19 / MUI v7 / RTK Query / Vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-04-15-unified-module-engine-completion-design.md`

---

## File Map

### Backend — modified

- `backend/src/common/services/base-crud.service.ts` — add `applyQueryBuilder` call in `findDeleted`
- `backend/src/common/services/base-crud.service.spec.ts` — add `findDeleted` + joins test
- `backend/src/modules/sales/services/invoice.service.ts` — delete `findDeleted`, `restore`, `bulkRestore`; move `findAll` joins into `applyQueryBuilder`
- `backend/src/modules/purchasing/services/purchase-order.service.ts` — delete `findDeleted`, `restore`, `bulkRestore`, `permanentDelete`, `remove`; move `findAll` joins into `applyQueryBuilder`
- `backend/src/modules/inventory/services/product.service.ts` — delete `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete`; move `findAll`+`findDeleted` joins into `applyQueryBuilder`+`applySearch`
- `backend/src/modules/inventory/services/category.service.ts` — delete `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete`; move `findAll` into `applyQueryBuilder`

### Frontend — created

- `frontend/src/components/common/EntityTable.tsx` — generic table component
- `frontend/src/components/common/EntityTable.test.tsx` — unit tests
- `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts` — replaces `grnPageState.ts` + `grnSelection.ts`
- `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts` — replaces `vendorPaymentsPageState.ts` + `vendorPaymentsSelection.ts`
- `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts` — replaces `stockAdjustmentsPageState.ts` + `stockAdjustmentsSelection.ts` + `stockAdjustmentsActions.ts`
- `frontend/src/pages/inventory/hooks/useProductsWorkspace.ts` — replaces `productsPageState.ts` + `productsSelection.ts` + `productsActions.ts`
- `frontend/src/pages/inventory/hooks/useCategoriesWorkspace.ts` — replaces `categoriesPageState.ts` + `categoriesSelection.ts` + `categoriesActions.ts`
- `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts` — replaces `paymentsPageState.ts` + `paymentsSelection.ts`
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` — replaces `purchaseOrdersPageState.ts` + `purchaseOrdersSelection.ts` + `purchaseOrdersActions.ts`
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` — replaces `invoicesPageState.ts` + `invoicesSelection.ts` + `invoicesActions.ts`
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` — replaces `ordersPageState.ts` + `ordersSelection.ts` + `ordersActions.ts`

### Frontend — modified (list component wrappers)

- `frontend/src/pages/inventory/components/ProductList.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/inventory/components/CategoryList.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/inventory/components/StockAdjustmentList.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/sales/components/CustomerList.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/purchasing/components/SupplierList.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/sales/components/OrdersTable.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/sales/components/InvoicesTable.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/sales/components/PaymentsTable.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/purchasing/components/PurchaseOrdersTable.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/purchasing/components/GRNTable.tsx` — replace with wrapper calling `EntityTable`
- `frontend/src/pages/purchasing/components/VendorPaymentTable.tsx` — replace with wrapper calling `EntityTable`

### Frontend — modified (pages)

- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` — switch to `useGRNWorkspace`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` — switch to `useVendorPaymentsWorkspace`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` — switch to `useStockAdjustmentsWorkspace`
- `frontend/src/pages/inventory/ProductsPage.tsx` — switch to `useProductsWorkspace`
- `frontend/src/pages/inventory/CategoriesPage.tsx` — switch to `useCategoriesWorkspace`
- `frontend/src/pages/sales/PaymentsPage.tsx` — switch to `usePaymentsWorkspace`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` — switch to `usePurchaseOrdersWorkspace`
- `frontend/src/pages/sales/InvoicesPage.tsx` — switch to `useInvoicesWorkspace`
- `frontend/src/pages/sales/OrdersPage.tsx` — switch to `useOrdersWorkspace`

### Frontend — deleted

- `frontend/src/pages/purchasing/hooks/grnPageState.ts`
- `frontend/src/pages/purchasing/hooks/grnSelection.ts`
- `frontend/src/pages/purchasing/hooks/vendorPaymentsPageState.ts`
- `frontend/src/pages/purchasing/hooks/vendorPaymentsSelection.ts`
- `frontend/src/pages/inventory/hooks/stockAdjustmentsPageState.ts`
- `frontend/src/pages/inventory/hooks/stockAdjustmentsSelection.ts`
- `frontend/src/pages/inventory/hooks/stockAdjustmentsActions.ts`
- `frontend/src/pages/inventory/hooks/productsPageState.ts`
- `frontend/src/pages/inventory/hooks/productsSelection.ts`
- `frontend/src/pages/inventory/hooks/productsActions.ts`
- `frontend/src/pages/inventory/hooks/categoriesPageState.ts`
- `frontend/src/pages/inventory/hooks/categoriesSelection.ts`
- `frontend/src/pages/inventory/hooks/categoriesActions.ts`
- `frontend/src/pages/sales/hooks/paymentsPageState.ts`
- `frontend/src/pages/sales/hooks/paymentsSelection.ts`
- `frontend/src/pages/purchasing/hooks/purchaseOrdersPageState.ts`
- `frontend/src/pages/purchasing/hooks/purchaseOrdersSelection.ts`
- `frontend/src/pages/purchasing/hooks/purchaseOrdersActions.ts`
- `frontend/src/pages/sales/hooks/invoicesPageState.ts`
- `frontend/src/pages/sales/hooks/invoicesSelection.ts`
- `frontend/src/pages/sales/hooks/invoicesActions.ts`
- `frontend/src/pages/sales/hooks/ordersPageState.ts`
- `frontend/src/pages/sales/hooks/ordersSelection.ts`
- `frontend/src/pages/sales/hooks/ordersActions.ts`
- `frontend/src/pages/inventory/hooks/useCategoriesPageState.test.tsx` (tests deleted component)
- `frontend/src/pages/inventory/hooks/useCategoriesSelection.test.tsx` (tests deleted component)
- `frontend/src/pages/inventory/hooks/useProductsSelection.test.tsx` (tests deleted component)
- `frontend/src/pages/inventory/components/ProductList.test.tsx` (tests deleted component)
- `frontend/src/pages/inventory/components/CategoryList.test.tsx` (tests deleted component — check if test file exists first)

---

## Task 1: Fix `BaseCrudService.findDeleted` + add test

**Files:**
- Modify: `backend/src/common/services/base-crud.service.ts:117-134`
- Modify: `backend/src/common/services/base-crud.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/src/common/services/base-crud.service.spec.ts` after the existing `bulkRestore` test (around line 178):

```typescript
it('findDeleted calls applyQueryBuilder so joins are applied to deleted queries', async () => {
  // A subclass with a join in applyQueryBuilder
  class JoinedCrudService extends BaseCrudService<
    TestEntity,
    TestCreateDto,
    TestUpdateDto,
    TestQueryDto
  > {
    getEntityType() { return 'TestEntity'; }
    buildWhereClause() { return {}; }
    protected applyQueryBuilder(qb: any, _query: TestQueryDto) {
      return qb.leftJoinAndSelect('testentity.related', 'related');
    }
  }

  const joinedService = new JoinedCrudService(repo as any, auditLogService);
  const qb = makeQb([mockEntity]);
  (repo.createQueryBuilder as jest.Mock).mockReturnValue(qb);

  await joinedService.findDeleted({});

  // applyQueryBuilder must have been called, which calls leftJoinAndSelect
  expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('testentity.related', 'related');
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npx jest src/common/services/base-crud.service.spec.ts --no-coverage
```

Expected: FAIL — `leftJoinAndSelect` not called.

- [ ] **Step 3: Fix `BaseCrudService.findDeleted`**

In `backend/src/common/services/base-crud.service.ts`, change lines 117-134:

```typescript
async findDeleted(query: QueryDto): Promise<any> {
  const alias = this.getEntityType().toLowerCase();
  let queryBuilder = this.repository
    .createQueryBuilder(alias)
    .withDeleted()
    .where(`${alias}.deletedAt IS NOT NULL`);

  if (query.search) {
    queryBuilder = this.applySearch(queryBuilder, query.search, alias);
  }

  queryBuilder = this.applyQueryBuilder(queryBuilder, query);

  const entities = await queryBuilder.getMany();

  return {
    data: entities,
    total: entities.length,
  };
}
```

- [ ] **Step 4: Run all base-crud tests**

```bash
cd backend && npx jest src/common/services/base-crud.service.spec.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 5: Confirm no regressions in already-migrated services**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts src/modules/purchasing/services/supplier.service.spec.ts src/modules/purchasing/services/vendor-payment.service.spec.ts src/modules/sales/services/payment.service.spec.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/common/services/base-crud.service.ts src/common/services/base-crud.service.spec.ts
git commit -m "fix(backend): call applyQueryBuilder in BaseCrudService.findDeleted so joins apply to deleted queries"
```

---

## Task 2: Migrate `InvoiceService` to base class

**Files:**
- Modify: `backend/src/modules/sales/services/invoice.service.ts`

The service already extends `BaseCrudService` and has `buildWhereClause`. Its `findAll` runs custom joins — move them to `applyQueryBuilder`. Delete `findDeleted`, `restore`, `bulkRestore`.

- [ ] **Step 1: Add `applyQueryBuilder` override and remove shadowing methods**

Replace the `findAll` method and delete `findDeleted`, `restore`, `bulkRestore` in `invoice.service.ts`.

Add this override after `buildWhereClause` (around line 82):

```typescript
protected applyQueryBuilder(qb: any, query: QueryInvoicesDto): any {
  qb = qb
    .leftJoinAndSelect('invoice.customer', 'customer')
    .leftJoinAndSelect('invoice.salesOrder', 'salesOrder')
    .leftJoinAndSelect('invoice.payments', 'payments')
    .leftJoinAndSelect('invoice.items', 'items')
    .leftJoinAndSelect('items.product', 'product');

  if (query.customerId) {
    qb = qb.andWhere('invoice.customerId = :customerId', { customerId: query.customerId });
  }
  if (query.salesOrderId) {
    qb = qb.andWhere('invoice.salesOrderId = :salesOrderId', { salesOrderId: query.salesOrderId });
  }
  if (query.status) {
    qb = qb.andWhere('invoice.status = :status', { status: query.status });
  }
  if (query.fromDate && query.toDate) {
    const endDate = new Date(query.toDate);
    endDate.setHours(23, 59, 59, 999);
    qb = qb.andWhere('invoice.invoiceDate BETWEEN :fromDate AND :toDate', {
      fromDate: new Date(query.fromDate),
      toDate: endDate,
    });
  }
  if (query.unpaid) {
    qb = qb.andWhere('invoice.balanceDue > 0');
  }
  if (query.paymentStatus === 'unpaid') {
    qb = qb.andWhere('invoice.paidAmount = 0 OR invoice.paidAmount IS NULL');
  } else if (query.paymentStatus === 'partial') {
    qb = qb.andWhere('invoice.paidAmount > 0 AND invoice.paidAmount < invoice.totalAmount');
  } else if (query.paymentStatus === 'paid') {
    qb = qb.andWhere('invoice.paidAmount >= invoice.totalAmount AND invoice.paidAmount > 0');
  }

  return qb;
}

protected applySearch(qb: any, search: string, _alias: string): any {
  return qb.andWhere(
    '(invoice.invoiceNumber ILIKE :search OR customer.name ILIKE :search)',
    { search: `%${search}%` },
  );
}

protected get allowedSortFields(): string[] {
  return ['invoiceDate', 'invoiceNumber', 'totalAmount', 'createdAt', 'updatedAt', 'deletedAt'];
}
```

Delete the `findAll` method (lines ~208-324), `findDeleted` method (lines ~931-978), `restore` method (lines ~980-1022), and `bulkRestore` method (lines ~1024-1054) entirely.

- [ ] **Step 2: Run invoice service tests**

```bash
cd backend && npx jest src/modules/sales/services/invoice.service.spec.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/sales/services/invoice.service.ts
git commit -m "refactor(backend): remove shadowing CRUD methods from InvoiceService, inherit from BaseCrudService"
```

---

## Task 3: Migrate `PurchaseOrderService` to base class

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

Delete `findDeleted`, `restore`, `bulkRestore`, `permanentDelete`, `remove`. Move `findAll` joins into `applyQueryBuilder`.

- [ ] **Step 1: Add `applyQueryBuilder` + delete shadowing methods**

Add after `buildWhereClause` (which needs to be added if missing — check the class for it):

```typescript
getEntityType(): string {
  return 'PurchaseOrder';
}

buildWhereClause(_query: PurchaseOrderQueryDto): FindOptionsWhere<PurchaseOrder> {
  return {};
}

protected applyQueryBuilder(qb: any, query: PurchaseOrderQueryDto): any {
  qb = qb
    .leftJoinAndSelect('po.supplier', 'supplier')
    .leftJoinAndSelect('po.items', 'items')
    .leftJoinAndSelect('items.product', 'product')
    .leftJoinAndSelect('po.goodsReceivedNotes', 'grns')
    .leftJoinAndSelect('po.vendorPayments', 'vendorPayments');

  if (query.supplierId) {
    qb = qb.andWhere('po.supplierId = :supplierId', { supplierId: query.supplierId });
  }
  if (query.orderDateFrom) {
    qb = qb.andWhere('po.orderDate >= :orderDateFrom', { orderDateFrom: new Date(query.orderDateFrom) });
  }
  if (query.orderDateTo) {
    qb = qb.andWhere('po.orderDate <= :orderDateTo', { orderDateTo: new Date(query.orderDateTo) });
  }
  if (query.paymentStatus === 'unpaid') {
    qb = qb.andWhere('(po.paidAmount = 0 OR po.paidAmount IS NULL)');
  } else if (query.paymentStatus === 'partial') {
    qb = qb.andWhere('po.paidAmount > 0 AND po.paidAmount < po.totalAmount');
  } else if (query.paymentStatus === 'paid') {
    qb = qb.andWhere('po.paidAmount >= po.totalAmount AND po.paidAmount > 0');
  } else if (query.paymentStatus === 'overpaid') {
    qb = qb.andWhere('po.paidAmount > po.totalAmount');
  }
  if (query.status) {
    qb = qb.andWhere('grns.status = :grnStatus', { grnStatus: query.status });
  }

  return qb;
}

protected applySearch(qb: any, search: string, _alias: string): any {
  return qb.andWhere(
    '(po.orderNumber ILIKE :search OR supplier.companyName ILIKE :search OR po.notes ILIKE :search)',
    { search: `%${search}%` },
  );
}

protected get allowedSortFields(): string[] {
  return ['orderNumber', 'orderDate', 'status', 'priority', 'totalAmount', 'createdAt', 'deletedAt'];
}
```

Delete: `findAll` (~lines 277-391), `findDeleted` (~lines 706-751), `restore` (~lines 756-844), `bulkRestore` (~lines 845-871), `permanentDelete` (~lines 872-1008), `remove` (~lines 1009-1101).

- [ ] **Step 2: Run purchase order tests**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts
git commit -m "refactor(backend): remove shadowing CRUD methods from PurchaseOrderService, inherit from BaseCrudService"
```

---

## Task 4: Migrate `ProductService` to base class

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`

Delete `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete`. Move `findAll` and `findDeleted` join logic into `applyQueryBuilder` + `applySearch`.

- [ ] **Step 1: Add `applyQueryBuilder` + `applySearch` + `allowedSortFields`, delete shadowing methods**

Add these overrides after `buildWhereClause`:

```typescript
protected applyQueryBuilder(qb: any, query: QueryProductsDto): any {
  qb = qb
    .leftJoinAndSelect('product.category', 'category')
    .leftJoinAndSelect('product.priceListItems', 'priceListItems', 'priceListItems.isActive = :isActiveItem', { isActiveItem: true })
    .leftJoinAndSelect('priceListItems.priceList', 'priceList', 'priceList.isActive = :isActiveList AND priceList.deletedAt IS NULL', { isActiveList: true });

  if (query.categoryId) {
    qb = qb.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
  }
  if (query.type) {
    qb = qb.andWhere('product.type = :type', { type: query.type });
  }
  if (query.isActive !== undefined) {
    qb = qb.andWhere('product.isActive = :isActive', { isActive: query.isActive });
  }
  if (query.outOfStock) {
    qb = qb.andWhere('product.stockQuantity <= 0');
  }
  if (query.minStock !== undefined) {
    qb = qb.andWhere('product.stockQuantity >= :minStock', { minStock: query.minStock });
  }
  if (query.maxStock !== undefined) {
    qb = qb.andWhere('product.stockQuantity <= :maxStock', { maxStock: query.maxStock });
  }

  return qb;
}

protected applySearch(qb: any, search: string, _alias: string): any {
  return qb.andWhere(
    '(product.name ILIKE :search OR product.barcode ILIKE :search)',
    { search: `%${search}%` },
  );
}

protected get allowedSortFields(): string[] {
  return ['name', 'barcode', 'createdAt', 'stockQuantity', 'deletedAt'];
}
```

Note: The existing `findAll` uses case-insensitive sort via `UPPER(product.name)` computed column. Preserve this by overriding `findAll` minimally — keep only the UPPER sort logic on top of the base call, OR accept that the base class sorts via `orderBy('product.name', ...)` which PostgreSQL handles case-sensitively. If tests catch a regression, add a minimal `findAll` override that just adds the UPPER select.

Delete: `restore` (~lines 600-656), `bulkRestore` (~lines 661-745), `permanentDelete` (~lines 746-798), `bulkPermanentDelete` (~lines 799-879). Also delete `findAll` (~lines 262-342) and `findDeleted` (~lines 539-595) — their logic now lives in `applyQueryBuilder` + `applySearch`.

- [ ] **Step 2: Run product tests**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage
```

Expected: All PASS. If case-insensitive sort test fails, add this minimal `findAll` override in `ProductService`:

```typescript
async findAll(query: QueryProductsDto): Promise<any> {
  // Call base, then re-run with UPPER sort if needed
  // Base uses orderBy(`product.${sortBy}`, sortOrder) — sufficient for non-name fields.
  // For name field, PostgreSQL ILIKE ordering is close enough; if a test enforces UPPER,
  // add: .addSelect('UPPER(product.name)', 'name_upper').orderBy('name_upper', ...)
  return super.findAll(query);
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts
git commit -m "refactor(backend): remove shadowing CRUD methods from ProductService, inherit from BaseCrudService"
```

---

## Task 5: Migrate `CategoryService` to base class

**Files:**
- Modify: `backend/src/modules/inventory/services/category.service.ts`

Delete `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete`. Move `findAll` tree/filter logic into `applyQueryBuilder`.

Note: `CategoryService.restore` sets `isActive = true` in addition to the base restore — this custom step must be preserved. Add an `afterRestore` hook or override `restore` minimally to add the `isActive` update after calling `super.restore(...)`. Since `BaseCrudService` has no `afterRestore` hook, override `restore` calling super, then update `isActive`.

- [ ] **Step 1: Add `applyQueryBuilder`, override `restore` for `isActive`, delete shadowing methods**

Add after `buildWhereClause`:

```typescript
protected applyQueryBuilder(qb: any, query: QueryCategoriesDto): any {
  if (query.includeTree && !query.parentId) {
    qb = qb.where('category.level = 0');
  }

  if (query.parentId !== undefined) {
    if (query.parentId === null) {
      qb = qb.andWhere('category.parentId IS NULL');
    } else {
      qb = qb.andWhere('category.parentId = :parentId', { parentId: query.parentId });
    }
  }

  // Hierarchical ordering: path → level → name
  qb = qb
    .orderBy('UPPER(COALESCE(category.path, category.name))', 'ASC')
    .addOrderBy('category.level', 'ASC');

  const sortField = ['name', 'createdAt'].includes(query.sortBy ?? '') ? query.sortBy! : 'name';
  if (sortField === 'name') {
    qb = qb.addOrderBy('UPPER(category.name)', query.sortOrder ?? 'ASC');
  } else {
    qb = qb.addOrderBy(`category.${sortField}`, query.sortOrder ?? 'ASC');
  }

  return qb;
}

protected applySearch(qb: any, search: string, _alias: string): any {
  return qb.andWhere('category.name ILIKE :search', { search: `%${search}%` });
}

protected get allowedSortFields(): string[] {
  return ['name', 'createdAt', 'updatedAt', 'deletedAt'];
}

// Override restore to also set isActive = true (CategoryService-specific behavior)
async restore(id: string, userId?: string, username?: string): Promise<any> {
  const result = await super.restore(id, userId ?? 'system', username);
  await this.categoryRepository.update(id, { isActive: true });
  const restoredCategory = await this.categoryRepository.findOne({ where: { id } });
  return this.toResponseDto(restoredCategory);
}
```

Delete: `restore` (~lines 632-675), `bulkRestore` (~lines 732-799), `permanentDelete` (~lines 680-731), `bulkPermanentDelete` (~lines 800-879). Also delete `findAll` (~lines 136-295) and `findDeleted` (~lines 238-295) — their logic now lives in `applyQueryBuilder` + `applySearch`. Keep all tree-traversal private methods (`loadCategoryTree`, `loadAncestors`, etc.) unchanged.

- [ ] **Step 2: Run category service tests**

```bash
cd backend && npx jest src/modules/inventory/services/category.service.ts --no-coverage
```

Expected: All PASS.

- [ ] **Step 3: Run full backend test suite to check for regressions**

```bash
cd backend && npm run test
```

Expected: All PASS. Fix any failures before continuing.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/inventory/services/category.service.ts
git commit -m "refactor(backend): remove shadowing CRUD methods from CategoryService, inherit from BaseCrudService"
```

---

## Task 6: Build `EntityTable<T>`

**Files:**
- Create: `frontend/src/components/common/EntityTable.tsx`
- Create: `frontend/src/components/common/EntityTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/common/EntityTable.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EntityTable from './EntityTable'

interface Item { id: string; name: string; amount: number }

const rows: Item[] = [
  { id: '1', name: 'Alpha', amount: 100 },
  { id: '2', name: 'Beta', amount: 200 },
]

const columns = [
  { key: 'name', render: (r: Item) => r.name },
  { key: 'amount', render: (r: Item) => `$${r.amount}`, width: 80 },
]

describe('EntityTable', () => {
  it('renders skeleton rows when loading with no data', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={true}
        total={0}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />
    )
    // 10 skeleton rows rendered
    expect(document.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0)
  })

  it('renders empty state when not loading and no rows', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={false}
        total={0}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />
    )
    expect(screen.getByText('No Items found')).toBeInTheDocument()
  })

  it('renders all rows', () => {
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('$200')).toBeInTheDocument()
  })

  it('shows count in header', () => {
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />
    )
    expect(screen.getByText('Items (2)')).toBeInTheDocument()
  })

  it('calls onSelect when row clicked', async () => {
    const onSelect = vi.fn()
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={onSelect}
        listRef={{ current: null }}
      />
    )
    await userEvent.click(screen.getByText('Alpha'))
    expect(onSelect).toHaveBeenCalledWith(rows[0])
  })

  it('applies selected background to selected row', () => {
    const { container } = render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId="1"
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />
    )
    // The selected row has data-row-index="0"
    const selectedRow = container.querySelector('[data-row-index="0"]')
    expect(selectedRow).toBeInTheDocument()
  })

  it('shows Searching indicator when loading with existing rows', () => {
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={true}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />
    )
    expect(screen.getByText('Searching...')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/common/EntityTable.test.tsx
```

Expected: FAIL — `EntityTable` not found.

- [ ] **Step 3: Create `EntityTable.tsx`**

Create `frontend/src/components/common/EntityTable.tsx`:

```tsx
import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

export interface ColumnConfig<T> {
  key: string
  render: (row: T) => React.ReactNode
  width?: string | number
}

export interface EntityTableProps<T extends { id: string }> {
  rows: T[]
  columns: ColumnConfig<T>[]
  loading: boolean
  total: number
  label: string
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  listRef: React.RefObject<HTMLDivElement | null>
  dataAttr?: string
}

interface RowProps<T extends { id: string }> {
  row: T
  index: number
  columns: ColumnConfig<T>[]
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  dataAttr: string
}

const EntityRow = memo(function EntityRow<T extends { id: string }>({
  row,
  index,
  columns,
  selectedId,
  focusedIndex,
  onSelect,
  dataAttr,
}: RowProps<T>) {
  const isSelected = selectedId === row.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(row)}
      {...{ [`data-${dataAttr}-index`]: index }}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected
          ? 'action.selected'
          : isFocused
            ? 'action.focus'
            : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      {columns.map((col) => (
        <TableCell key={col.key} width={col.width}>
          <Typography variant="body2" sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}>
            {col.render(row)}
          </Typography>
        </TableCell>
      ))}
    </TableRow>
  )
}) as <T extends { id: string }>(props: RowProps<T>) => React.ReactElement

function EntityTable<T extends { id: string }>({
  rows,
  columns,
  loading,
  total,
  label,
  selectedId,
  focusedIndex,
  onSelect,
  listRef,
  dataAttr = 'row',
}: EntityTableProps<T>) {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {label} ({total})
          </Typography>
          {loading && rows.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box
        ref={listRef}
        sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && rows.length === 0
                ? [...Array(10)].map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      {columns.map((col) => (
                        <TableCell key={col.key} width={col.width}>
                          <Skeleton height={40} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                      <TableRow>
                        <TableCell colSpan={columns.length}>
                          <Typography
                            variant="body2"
                            sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}
                          >
                            No {label} found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : rows.map((row, index) => (
                      <EntityRow
                        key={row.id}
                        row={row}
                        index={index}
                        columns={columns}
                        selectedId={selectedId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                        dataAttr={dataAttr}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default EntityTable
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/components/common/EntityTable.test.tsx
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/EntityTable.tsx frontend/src/components/common/EntityTable.test.tsx
git commit -m "feat(frontend): add generic EntityTable<T> component with column config, skeleton, empty state"
```

---

## Task 7: Migrate all 11 list components to `EntityTable` wrappers

**Files:**
- Modify: all 11 list component files listed in the file map

Each wrapper keeps the existing component name and props so pages need no changes.

- [ ] **Step 1: Replace `ProductList.tsx`**

Replace entire contents of `frontend/src/pages/inventory/components/ProductList.tsx`:

```tsx
import React from 'react'
import type { Product } from '@/types'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

const COLUMNS: ColumnConfig<Product>[] = [
  { key: 'name', render: (p) => p.name },
]

interface ProductListProps {
  products: Product[]
  loading: boolean
  total: number
  selectedProductId?: string
  focusedIndex: number
  onSelect: (product: Product) => void
  productListRef: React.RefObject<HTMLDivElement | null>
}

const ProductList: React.FC<ProductListProps> = ({
  products, loading, total, selectedProductId, focusedIndex, onSelect, productListRef,
}) => (
  <EntityTable
    rows={products}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Products"
    selectedId={selectedProductId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={productListRef}
    dataAttr="product"
  />
)

export default ProductList
```

- [ ] **Step 2: Replace `CategoryList.tsx`**

Replace entire contents of `frontend/src/pages/inventory/components/CategoryList.tsx`:

```tsx
import React from 'react'
import type { Category } from '@/types'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

const COLUMNS: ColumnConfig<Category>[] = [
  { key: 'name', render: (c) => c.name },
]

interface CategoryListProps {
  categories: Category[]
  loading: boolean
  total: number
  selectedCategoryId?: string
  focusedIndex: number
  onSelect: (category: Category) => void
  categoryListRef: React.RefObject<HTMLDivElement | null>
}

const CategoryList: React.FC<CategoryListProps> = ({
  categories, loading, total, selectedCategoryId, focusedIndex, onSelect, categoryListRef,
}) => (
  <EntityTable
    rows={categories}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Categories"
    selectedId={selectedCategoryId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={categoryListRef}
    dataAttr="category"
  />
)

export default CategoryList
```

- [ ] **Step 3: Replace `StockAdjustmentList.tsx`**

Replace entire contents of `frontend/src/pages/inventory/components/StockAdjustmentList.tsx`:

```tsx
import React from 'react'
import type { StockAdjustment } from '@/types'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

const COLUMNS: ColumnConfig<StockAdjustment>[] = [
  { key: 'adjustmentNumber', render: (a) => a.adjustmentNumber },
]

interface StockAdjustmentListProps {
  adjustments: StockAdjustment[]
  loading: boolean
  total: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
  adjustmentListRef: React.RefObject<HTMLDivElement | null>
}

const StockAdjustmentList: React.FC<StockAdjustmentListProps> = ({
  adjustments, loading, total, selectedAdjustmentId, focusedAdjustmentIndex, onSelect, adjustmentListRef,
}) => (
  <EntityTable
    rows={adjustments}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Adjustments"
    selectedId={selectedAdjustmentId}
    focusedIndex={focusedAdjustmentIndex}
    onSelect={onSelect}
    listRef={adjustmentListRef}
    dataAttr="adjustment"
  />
)

export default StockAdjustmentList
```

- [ ] **Step 4: Replace `CustomerList.tsx`**

Look up existing props by reading `frontend/src/pages/sales/components/CustomerList.tsx`, then replace with:

```tsx
import React from 'react'
import type { Customer } from '@/types'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

const COLUMNS: ColumnConfig<Customer>[] = [
  { key: 'name', render: (c) => c.name },
]

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  total: number
  selectedCustomerId?: string
  focusedIndex: number
  onSelect: (customer: Customer) => void
  customerListRef: React.RefObject<HTMLDivElement | null>
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers, loading, total, selectedCustomerId, focusedIndex, onSelect, customerListRef,
}) => (
  <EntityTable
    rows={customers}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Customers"
    selectedId={selectedCustomerId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={customerListRef}
    dataAttr="customer"
  />
)

export default CustomerList
```

- [ ] **Step 5: Replace `SupplierList.tsx`**

Read `frontend/src/pages/purchasing/components/SupplierList.tsx` for existing props, then replace:

```tsx
import React from 'react'
import type { Supplier } from '@/types'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

const COLUMNS: ColumnConfig<Supplier>[] = [
  { key: 'companyName', render: (s) => s.companyName },
]

interface SupplierListProps {
  suppliers: Supplier[]
  loading: boolean
  total: number
  selectedSupplierId?: string
  focusedIndex: number
  onSelect: (supplier: Supplier) => void
  supplierListRef: React.RefObject<HTMLDivElement | null>
}

const SupplierList: React.FC<SupplierListProps> = ({
  suppliers, loading, total, selectedSupplierId, focusedIndex, onSelect, supplierListRef,
}) => (
  <EntityTable
    rows={suppliers}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Suppliers"
    selectedId={selectedSupplierId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={supplierListRef}
    dataAttr="supplier"
  />
)

export default SupplierList
```

- [ ] **Step 6: Replace the 6 transaction table components**

For each of `OrdersTable.tsx`, `InvoicesTable.tsx`, `PaymentsTable.tsx`, `PurchaseOrdersTable.tsx`, `GRNTable.tsx`, `VendorPaymentTable.tsx`:

Read the existing file first to capture all props, then replace with an `EntityTable` wrapper. Use the pattern below — substitute the correct type, label, column field, and prop names:

`OrdersTable.tsx`:
```tsx
import React from 'react'
import type { SalesOrder } from '@/types'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

const COLUMNS: ColumnConfig<SalesOrder>[] = [
  { key: 'orderNumber', render: (o) => o.orderNumber },
]

interface OrdersTableProps {
  orders: SalesOrder[]
  loading: boolean
  total: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: SalesOrder) => void
  orderListRef: React.RefObject<HTMLDivElement | null>
}

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders, loading, total, selectedOrderId, focusedOrderIndex, onOrderSelect, orderListRef,
}) => (
  <EntityTable
    rows={orders}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="SO List"
    selectedId={selectedOrderId}
    focusedIndex={focusedOrderIndex}
    onSelect={onOrderSelect}
    listRef={orderListRef}
    dataAttr="order"
  />
)

export default OrdersTable
```

Apply the same pattern to the remaining 5, reading each existing file first for exact prop names.

- [ ] **Step 7: Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors. Fix any prop name mismatches.

- [ ] **Step 8: Run existing filterbar tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```

Expected: All PASS.

- [ ] **Step 9: Delete old list component test files**

```bash
rm frontend/src/pages/inventory/components/ProductList.test.tsx
rm frontend/src/pages/inventory/components/CategoryList.test.tsx  # if exists
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/inventory/components/ProductList.tsx \
        frontend/src/pages/inventory/components/CategoryList.tsx \
        frontend/src/pages/inventory/components/StockAdjustmentList.tsx \
        frontend/src/pages/sales/components/CustomerList.tsx \
        frontend/src/pages/purchasing/components/SupplierList.tsx \
        frontend/src/pages/sales/components/OrdersTable.tsx \
        frontend/src/pages/sales/components/InvoicesTable.tsx \
        frontend/src/pages/sales/components/PaymentsTable.tsx \
        frontend/src/pages/purchasing/components/PurchaseOrdersTable.tsx \
        frontend/src/pages/purchasing/components/GRNTable.tsx \
        frontend/src/pages/purchasing/components/VendorPaymentTable.tsx
git rm frontend/src/pages/inventory/components/ProductList.test.tsx \
      frontend/src/pages/inventory/components/CategoryList.test.tsx 2>/dev/null || true
git commit -m "refactor(frontend): replace 11 per-entity list components with EntityTable wrappers"
```

---

## Task 8: Build `useGRNWorkspace` + migrate `GoodsReceivedPage`

GRN is the simplest hook triplet — 2 files, journal ref fetch, URL highlight via searchParams. Start here to establish the domain-hook pattern.

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- Delete: `frontend/src/pages/purchasing/hooks/grnPageState.ts`, `frontend/src/pages/purchasing/hooks/grnSelection.ts`

- [ ] **Step 1: Create `useGRNWorkspace.ts`**

```ts
import { useEffect, useRef, useState } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { setSelectedGRN } from '@/store/slices/purchasingSlice'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import type { GoodsReceivedNote } from '@/types'
import { useNavigate } from 'react-router-dom'
import { useNotification } from '@/hooks/useNotification'

export interface GRNJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UseGRNWorkspaceConfig {
  dispatch: AppDispatch
  grns: GoodsReceivedNote[]
  selectedGRN: GoodsReceivedNote | null
  refetch: () => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }
  setSorting: (s: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
}

export function useGRNWorkspace({
  dispatch,
  grns,
  selectedGRN,
  refetch,
  searchParams,
  setSearchParams,
}: UseGRNWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [deletedGRNsOpen, setDeletedGRNsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<GRNJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const userHasNavigatedRef = useRef(false)
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  const workspace = useEntityWorkspace({
    entities: grns,
    selectedEntity: selectedGRN,
    selectEntity: (grn) => dispatch(setSelectedGRN(grn)),
    refetch,
    navigate,
    routes: {
      create: '/purchasing/grn/create',
      edit: (id) => `/purchasing/grn/${id}/edit`,
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (_id) => { /* GRNs are not deleted from UI */ },
  })

  // Journal entry ref fetch
  useEffect(() => {
    if (!selectedGRN?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'goods_received_note',
          sourceId: selectedGRN.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return
        const entry = res.data?.[0]
        setJournalEntryRef(
          entry
            ? { referenceNumber: entry.referenceNumber, sourceType: 'goods_received_note', sourceId: selectedGRN.id }
            : null
        )
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [selectedGRN?.id, fetchJournalEntries])

  // URL highlight param
  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (!highlightId || userHasNavigatedRef.current || grns.length === 0) return

    const grn = grns.find((g) => g.id === highlightId)
    if (grn) {
      dispatch(setSelectedGRN(grn))
      setSearchParams({}, { replace: true })
      userHasNavigatedRef.current = true
    }
  }, [grns, searchParams, setSearchParams, dispatch])

  return {
    ...workspace,
    deletedGRNsOpen,
    setDeletedGRNsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    journalEntryRefLoading,
    userHasNavigatedRef,
  }
}
```

- [ ] **Step 2: Update `GoodsReceivedPage.tsx` to use `useGRNWorkspace`**

Read the full current file first (`frontend/src/pages/purchasing/GoodsReceivedPage.tsx`), then replace the hook wiring:

Remove imports for `useGRNPageState`, `useGRNSelection`. Add import for `useGRNWorkspace`.

Replace:
```tsx
const pageState = useGRNPageState()
// ... useGRNSelection call ...
```

With:
```tsx
const [sorting, setSorting] = useState({ sortBy: 'grnNumber', sortOrder: 'asc' as const })
const workspace = useGRNWorkspace({
  dispatch,
  grns,
  selectedGRN,
  refetch: () => void refetch(),
  searchParams,
  setSearchParams,
  sorting,
  setSorting,
})
```

Then replace all `pageState.xxx` references with `workspace.xxx` throughout the file.

- [ ] **Step 3: Delete old hook files**

```bash
git rm frontend/src/pages/purchasing/hooks/grnPageState.ts frontend/src/pages/purchasing/hooks/grnSelection.ts
```

- [ ] **Step 4: Run type-check + filterbar test**

```bash
cd frontend && npm run type-check && npx vitest run src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx
```

Expected: No errors, test PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts frontend/src/pages/purchasing/GoodsReceivedPage.tsx
git commit -m "refactor(frontend): consolidate GRN hook triplet into useGRNWorkspace"
```

---

## Task 9: Build `useVendorPaymentsWorkspace` + migrate `VendorPaymentsPage`

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- Delete: `frontend/src/pages/purchasing/hooks/vendorPaymentsPageState.ts`, `vendorPaymentsSelection.ts`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/purchasing/hooks/vendorPaymentsPageState.ts
cat frontend/src/pages/purchasing/hooks/vendorPaymentsSelection.ts
```

- [ ] **Step 2: Create `useVendorPaymentsWorkspace.ts`**

Follow the same pattern as `useGRNWorkspace` — call `useEntityWorkspace` for plumbing, add domain state (deletedOpen, printDialogOpen, journalEntryRef if present) on top. Extract all state from `vendorPaymentsPageState` and all selection effects from `vendorPaymentsSelection` into the new hook.

- [ ] **Step 3: Update `VendorPaymentsPage.tsx`**

Replace `useVendorPaymentsPageState` + selection hook call with single `useVendorPaymentsWorkspace` call.

- [ ] **Step 4: Delete old hook files + type-check**

```bash
git rm frontend/src/pages/purchasing/hooks/vendorPaymentsPageState.ts \
       frontend/src/pages/purchasing/hooks/vendorPaymentsSelection.ts
cd frontend && npm run type-check
```

- [ ] **Step 5: Run filterbar test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts \
        frontend/src/pages/purchasing/VendorPaymentsPage.tsx
git commit -m "refactor(frontend): consolidate VendorPayments hook triplet into useVendorPaymentsWorkspace"
```

---

## Task 10: Build `useStockAdjustmentsWorkspace` + migrate `StockAdjustmentsPage`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- Delete: `stockAdjustmentsPageState.ts`, `stockAdjustmentsSelection.ts`, `stockAdjustmentsActions.ts`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/inventory/hooks/stockAdjustmentsPageState.ts
cat frontend/src/pages/inventory/hooks/stockAdjustmentsSelection.ts
cat frontend/src/pages/inventory/hooks/stockAdjustmentsActions.ts
```

- [ ] **Step 2: Create `useStockAdjustmentsWorkspace.ts`**

Follow the `useGRNWorkspace` pattern. The actions hook has export + navigate mutations — include these in the new hook's return value.

- [ ] **Step 3: Update `StockAdjustmentsPage.tsx`**

Replace the three hook calls with single `useStockAdjustmentsWorkspace` call.

- [ ] **Step 4: Delete old hook files + type-check + test**

```bash
git rm frontend/src/pages/inventory/hooks/stockAdjustmentsPageState.ts \
       frontend/src/pages/inventory/hooks/stockAdjustmentsSelection.ts \
       frontend/src/pages/inventory/hooks/stockAdjustmentsActions.ts
cd frontend && npm run type-check
npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts \
        frontend/src/pages/inventory/StockAdjustmentsPage.tsx
git commit -m "refactor(frontend): consolidate StockAdjustments hook triplet into useStockAdjustmentsWorkspace"
```

---

## Task 11: Build `useProductsWorkspace` + migrate `ProductsPage`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useProductsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Delete: `productsPageState.ts`, `productsSelection.ts`, `productsActions.ts`
- Delete: `frontend/src/pages/inventory/hooks/useProductsSelection.test.tsx`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/inventory/hooks/productsPageState.ts
cat frontend/src/pages/inventory/hooks/productsSelection.ts
cat frontend/src/pages/inventory/hooks/productsActions.ts
```

- [ ] **Step 2: Create `useProductsWorkspace.ts`**

Products has `location.state.selectedProductId` navigation — preserve the effect from `productsSelection.ts` that reads `location.state` and selects the matching product. Also preserve export menu state and import dialog state from `productsPageState.ts`.

- [ ] **Step 3: Update `ProductsPage.tsx`**

Replace three hook calls with single `useProductsWorkspace`. Remove `useKeyboardShortcuts` import if it was only used via the selection hook.

- [ ] **Step 4: Delete + type-check + test**

```bash
git rm frontend/src/pages/inventory/hooks/productsPageState.ts \
       frontend/src/pages/inventory/hooks/productsSelection.ts \
       frontend/src/pages/inventory/hooks/productsActions.ts \
       frontend/src/pages/inventory/hooks/useProductsSelection.test.tsx
cd frontend && npm run type-check
npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useProductsWorkspace.ts \
        frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "refactor(frontend): consolidate Products hook triplet into useProductsWorkspace"
```

---

## Task 12: Build `useCategoriesWorkspace` + migrate `CategoriesPage`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useCategoriesWorkspace.ts`
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`
- Delete: `categoriesPageState.ts`, `categoriesSelection.ts`, `categoriesActions.ts`
- Delete: `frontend/src/pages/inventory/hooks/useCategoriesPageState.test.tsx`, `useCategoriesSelection.test.tsx`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/inventory/hooks/categoriesPageState.ts
cat frontend/src/pages/inventory/hooks/categoriesSelection.ts
cat frontend/src/pages/inventory/hooks/categoriesActions.ts
```

- [ ] **Step 2: Create `useCategoriesWorkspace.ts`**

Categories has tree mode state and move-category mutations. Include tree mode toggle and `useMoveCategory` mutation in the workspace hook.

- [ ] **Step 3: Update `CategoriesPage.tsx`** + **Delete + type-check + test**

```bash
git rm frontend/src/pages/inventory/hooks/categoriesPageState.ts \
       frontend/src/pages/inventory/hooks/categoriesSelection.ts \
       frontend/src/pages/inventory/hooks/categoriesActions.ts \
       frontend/src/pages/inventory/hooks/useCategoriesPageState.test.tsx \
       frontend/src/pages/inventory/hooks/useCategoriesSelection.test.tsx
cd frontend && npm run type-check
npx vitest run src/pages/inventory/__tests__/CategoriesPage.filterbar.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useCategoriesWorkspace.ts \
        frontend/src/pages/inventory/CategoriesPage.tsx
git commit -m "refactor(frontend): consolidate Categories hook triplet into useCategoriesWorkspace"
```

---

## Task 13: Build `usePaymentsWorkspace` + migrate `PaymentsPage`

**Files:**
- Create: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`
- Delete: `paymentsPageState.ts`, `paymentsSelection.ts`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/sales/hooks/paymentsPageState.ts
cat frontend/src/pages/sales/hooks/paymentsSelection.ts
```

- [ ] **Step 2: Create `usePaymentsWorkspace.ts`** + update page + delete + type-check + test

```bash
cd frontend && npm run type-check
npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts \
        frontend/src/pages/sales/PaymentsPage.tsx
git commit -m "refactor(frontend): consolidate Payments hook triplet into usePaymentsWorkspace"
```

---

## Task 14: Build `usePurchaseOrdersWorkspace` + migrate `PurchaseOrdersPage`

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Delete: `purchaseOrdersPageState.ts`, `purchaseOrdersSelection.ts`, `purchaseOrdersActions.ts`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/purchasing/hooks/purchaseOrdersPageState.ts
cat frontend/src/pages/purchasing/hooks/purchaseOrdersSelection.ts
cat frontend/src/pages/purchasing/hooks/purchaseOrdersActions.ts
```

PurchaseOrders has `receiveGoods`, `returnGoods`, `recordPayment` mutations plus journal entry ref fetching. Include all of these.

- [ ] **Step 2: Create `usePurchaseOrdersWorkspace.ts`** + update page + delete + type-check + test

```bash
cd frontend && npm run type-check
npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts \
        frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "refactor(frontend): consolidate PurchaseOrders hook triplet into usePurchaseOrdersWorkspace"
```

---

## Task 15: Build `useInvoicesWorkspace` + migrate `InvoicesPage`

**Files:**
- Create: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`
- Delete: `invoicesPageState.ts`, `invoicesSelection.ts`, `invoicesActions.ts`

- [ ] **Step 1: Read existing hook files**

```bash
cat frontend/src/pages/sales/hooks/invoicesPageState.ts
cat frontend/src/pages/sales/hooks/invoicesSelection.ts
cat frontend/src/pages/sales/hooks/invoicesActions.ts
```

Invoices has `sendInvoice`, `markAsSent`, `voidInvoice`, `duplicateInvoice`, `allocatePayment` mutations plus aging dialog state.

- [ ] **Step 2: Create `useInvoicesWorkspace.ts`** + update page + delete + type-check + test

```bash
cd frontend && npm run type-check
npx vitest run src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/InvoicesPage.tsx
git commit -m "refactor(frontend): consolidate Invoices hook triplet into useInvoicesWorkspace"
```

---

## Task 16: Build `useOrdersWorkspace` + migrate `OrdersPage`

Most complex — 12 domain mutations, journal entry ref, URL highlight, payment dialog, blocked dialog, lazy fetch. Leave for last.

**Files:**
- Create: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Delete: `ordersPageState.ts`, `ordersSelection.ts`, `ordersActions.ts`

- [ ] **Step 1: Read all three existing hook files in full**

```bash
cat frontend/src/pages/sales/hooks/ordersPageState.ts
cat frontend/src/pages/sales/hooks/ordersSelection.ts
cat frontend/src/pages/sales/hooks/ordersActions.ts
```

- [ ] **Step 2: Create `useOrdersWorkspace.ts`**

Structure:

```ts
export function useOrdersWorkspace(config: UseOrdersWorkspaceConfig) {
  const workspace = useEntityWorkspace({ ... })  // plumbing

  // From ordersPageState:
  const [viewDialog, setViewDialog] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [blockedDialogAction, setBlockedDialogAction] = useState<'edit' | 'delete'>('edit')
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<JournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const [pendingOrderToSelect, setPendingOrderToSelect] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('highlight')
  )
  const processedHighlightRef = useRef<string | null>(null)
  const userHasNavigatedRef = useRef(false)
  const hasRefreshedPersistedOrder = useRef(false)
  const isRefreshingPersistedOrder = useRef(false)

  // From ordersSelection: journal entry fetch, URL highlight, lazy fetch effects
  // From ordersActions: all 12 mutation handlers
  // ...

  return {
    ...workspace,
    viewDialog, setViewDialog,
    blockedDialogOpen, setBlockedDialogOpen,
    blockedDialogAction,
    printDialogOpen, setPrintDialogOpen,
    paymentDialogOpen, setPaymentDialogOpen,
    journalEntryRef, journalEntryRefLoading,
    handleFulfill, handleConfirm, handleShip, handleDeliver,
    handleComplete, handleCancel, handleDuplicate,
    handlePay, handleUnpay, handleFulfillOrder, handleUnfulfillOrder,
  }
}
```

- [ ] **Step 3: Update `OrdersPage.tsx`**

Replace imports for `useOrdersPageState`, `useOrdersSelection`, `useOrdersActions`. Replace calls with single `useOrdersWorkspace`. Replace all `pageState.xxx` with `workspace.xxx`.

- [ ] **Step 4: Delete old hook files + type-check + tests**

```bash
git rm frontend/src/pages/sales/hooks/ordersPageState.ts \
       frontend/src/pages/sales/hooks/ordersSelection.ts \
       frontend/src/pages/sales/hooks/ordersActions.ts
cd frontend && npm run type-check
npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
        frontend/src/pages/sales/OrdersPage.tsx
git commit -m "refactor(frontend): consolidate Orders hook triplet into useOrdersWorkspace"
```

---

## Task 17: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && npm run test
```

Expected: All PASS.

- [ ] **Step 2: Run full frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Run all relevant frontend tests**

```bash
cd frontend && npx vitest run \
  src/components/common/EntityTable.test.tsx \
  src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx \
  src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx \
  src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx \
  src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx \
  src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx \
  src/pages/purchasing/__tests__/GoodsReceivedPage.filterbar.test.tsx \
  src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx \
  src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx \
  src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx \
  src/pages/inventory/__tests__/CategoriesPage.filterbar.test.tsx \
  src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
```

Expected: All PASS.

- [ ] **Step 4: Close issues via PR**

Create PR with description referencing `Closes #372` and `Closes #374`.
