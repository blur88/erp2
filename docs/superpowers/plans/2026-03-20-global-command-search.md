# Global Command Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the placeholder `SearchModal` into a functional global command palette that searches pages, customers, products, and transactions from a single backend endpoint.

**Architecture:** A new `backend/src/modules/search/` NestJS module exposes `GET /search/global?q=abc`. It fans out in parallel to static page search, `CustomerService.searchGlobal()`, `ProductService.searchGlobal()`, `SalesOrderService.searchGlobal()`, and `PurchaseOrderService.searchGlobal()`, merges results sorted by score, and returns up to 20. The frontend replaces the `SearchModal` placeholder with RTK Query, debounced input, grouped rendering, and keyboard navigation.

**Tech Stack:** NestJS 11, TypeORM/PostgreSQL, class-validator DTOs, Jest (backend); React 19, RTK Query (`@reduxjs/toolkit`), MUI v7, Vitest (frontend)

**Spec:** `docs/superpowers/specs/2026-03-20-global-command-search-design.md`

---

## File Map

### New files (backend)
- `backend/src/modules/search/search.module.ts` — NestJS module, imports SalesModule/InventoryModule/PurchasingModule, registers controller + service
- `backend/src/modules/search/search.controller.ts` — `GET /search/global`, JwtAuthGuard, validates via GlobalSearchQueryDto
- `backend/src/modules/search/search.service.ts` — orchestrates fan-out, per-source error isolation, merge + sort + slice
- `backend/src/modules/search/dto/global-search-query.dto.ts` — `q` (string, min 2, max 100)
- `backend/src/modules/search/dto/global-search-result.dto.ts` — `type`, `id?`, `label`, `description?`, `route`, `score?`
- `backend/src/modules/search/dto/global-search-response.dto.ts` — `query`, `results`
- `backend/src/modules/search/search.service.spec.ts` — unit tests for SearchService

### Modified files (backend)
- `backend/src/modules/sales/services/customer.service.ts` — add `searchGlobal(query, user)`
- `backend/src/modules/inventory/services/product.service.ts` — add `searchGlobal(query, user)`
- `backend/src/modules/sales/services/sales-order.service.ts` — add `searchGlobal(query, user)`
- `backend/src/modules/purchasing/services/purchase-order.service.ts` — add `searchGlobal(query, user)`
- `backend/src/modules/sales/sales.module.ts` — export `CustomerService`, `SalesOrderService` (CustomerService already exported; verify SalesOrderService)
- `backend/src/modules/inventory/inventory.module.ts` — export `ProductService`
- `backend/src/modules/purchasing/purchasing.module.ts` — export `PurchaseOrderService`
- `backend/src/app.module.ts` — import `SearchModule`

### New files (frontend)
- `frontend/src/store/api/searchApi.ts` — RTK Query slice for `/search/global`
- `frontend/src/types/search.ts` — `GlobalSearchResultType`, `GlobalSearchResultDto`, `GlobalSearchResponse`

### Modified files (frontend)
- `frontend/src/store/index.ts` — register `searchApiSlice` reducer + middleware
- `frontend/src/components/common/SearchModal.tsx` — full replacement with real search behavior
- `frontend/src/components/common/__tests__/SearchModal.test.tsx` — replace placeholder tests with real behavior tests

---

## Task 1: Backend DTOs and types

**Files:**
- Create: `backend/src/modules/search/dto/global-search-query.dto.ts`
- Create: `backend/src/modules/search/dto/global-search-result.dto.ts`
- Create: `backend/src/modules/search/dto/global-search-response.dto.ts`

- [ ] **Step 1: Create the query DTO**

```typescript
// backend/src/modules/search/dto/global-search-query.dto.ts
import { IsString, MinLength, MaxLength } from 'class-validator';

export class GlobalSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;
}
```

- [ ] **Step 2: Create the result DTO**

```typescript
// backend/src/modules/search/dto/global-search-result.dto.ts
export type GlobalSearchResultType = 'page' | 'customer' | 'product' | 'transaction';

export class GlobalSearchResultDto {
  type: GlobalSearchResultType;
  id?: string;
  label: string;
  description?: string;
  route: string;
  score?: number;
}
```

- [ ] **Step 3: Create the response DTO**

```typescript
// backend/src/modules/search/dto/global-search-response.dto.ts
import { GlobalSearchResultDto } from './global-search-result.dto';

export class GlobalSearchResponseDto {
  query: string;
  results: GlobalSearchResultDto[];
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/search/
git commit -m "feat(search): add global search DTOs"
```

---

## Task 2: CustomerService.searchGlobal

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts`

The `Customer` entity has `name`, `code`, `email`, `deletedAt` (soft delete via TypeORM). Use `ILIKE` for case-insensitive matching, matching the pattern already used in `findAll`.

- [ ] **Step 1: Write the failing test**

`customer.service.spec.ts` does not exist — create the full file:

```typescript
// backend/src/modules/sales/services/customer.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerService } from './customer.service';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { AuditLogService } from '../../audit-logs/audit-log.service';
import { TransactionManager } from '../../../common/utils/transaction.util';

describe('CustomerService', () => {
  let service: CustomerService;
  let customerRepository: jest.Mocked<Repository<Customer>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: TransactionManager,
          useValue: { runInTransaction: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    customerRepository = module.get(getRepositoryToken(Customer));
  });

  describe('searchGlobal', () => {
    it('returns matching customers as GlobalSearchResultDto', async () => {
      const customer = {
        id: 'uuid-1',
        name: 'ABC Trading',
        code: 'CUST-001',
        email: 'abc@example.com',
        deletedAt: null,
      };
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([customer]),
      });

      const results = await service.searchGlobal('ABC', {} as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'customer',
        id: 'uuid-1',
        label: 'ABC Trading',
        description: 'CUST-001',
        route: '/customers/uuid-1',
      });
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('returns empty array when no matches', async () => {
      customerRepository.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      const results = await service.searchGlobal('zzz', {} as any);
      expect(results).toEqual([]);
    });
  });
});
```

> **Note:** If `CustomerService` has additional constructor dependencies that cause the test module to fail to compile, inspect the service constructor and add mock providers for any missing deps following the same pattern above.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: FAIL — `service.searchGlobal is not a function`

- [ ] **Step 3: Add searchGlobal to CustomerService**

Add this method to `CustomerService` (after the existing `findAll` method):

```typescript
async searchGlobal(query: string, user: any): Promise<import('../search/dto/global-search-result.dto').GlobalSearchResultDto[]> {
  const trimmed = query.trim();
  const customers = await this.customerRepository
    .createQueryBuilder('customer')
    .where('customer.deletedAt IS NULL')
    .andWhere(
      '(customer.name ILIKE :q OR customer.code ILIKE :q OR customer.email ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(5)
    .getMany();

  return customers.map((c) => {
    const name = c.name?.toLowerCase() ?? '';
    const code = c.code?.toLowerCase() ?? '';
    const t = trimmed.toLowerCase();
    let score = 50;
    if (name === t) score = 100;
    else if (code === t) score = 90;
    else if (name.startsWith(t) || code.startsWith(t)) score = 80;
    return {
      type: 'customer' as const,
      id: c.id,
      label: c.name,
      description: c.code,
      route: `/customers/${c.id}`,
      score,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "feat(search): add CustomerService.searchGlobal"
```

---

## Task 3: ProductService.searchGlobal

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`

The `Product` entity has `name`, `sku`, `deletedAt`.

- [ ] **Step 1: Write the failing test**

Check whether `product.service.spec.ts` already exists:

```bash
ls backend/src/modules/inventory/services/product.service.spec.ts 2>/dev/null || echo "not found"
```

If it exists, add the `describe('searchGlobal', ...)` block below to it, placing it inside the outer `describe('ProductService', ...)` wrapper. If it does not exist, create the full file following the same pattern as `customer.service.spec.ts` in Task 2 (Test module with `getRepositoryToken(Product)` mock). Add the test block:

```typescript
describe('searchGlobal', () => {
  it('returns matching products as GlobalSearchResultDto', async () => {
    const product = {
      id: 'prod-uuid-1',
      name: 'Widget A',
      sku: 'SKU-001',
      deletedAt: null,
    };
    productRepository.createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([product]),
    });

    const results = await service.searchGlobal('Widget', {} as any);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'product',
      id: 'prod-uuid-1',
      label: 'Widget A',
      description: 'SKU-001',
      route: '/inventory/products/prod-uuid-1',
    });
  });

  it('returns empty array when no matches', async () => {
    productRepository.createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    const results = await service.searchGlobal('zzz', {} as any);
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Add searchGlobal to ProductService**

```typescript
async searchGlobal(query: string, user: any): Promise<import('../search/dto/global-search-result.dto').GlobalSearchResultDto[]> {
  const trimmed = query.trim();
  const products = await this.productRepository
    .createQueryBuilder('product')
    .where('product.deletedAt IS NULL')
    .andWhere(
      '(product.name ILIKE :q OR product.sku ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(5)
    .getMany();

  return products.map((p) => {
    const name = p.name?.toLowerCase() ?? '';
    const sku = p.sku?.toLowerCase() ?? '';
    let score = 50;
    if (name === trimmed) score = 100;
    else if (sku === trimmed) score = 90;
    else if (name.startsWith(trimmed) || sku.startsWith(trimmed)) score = 80;
    return {
      type: 'product' as const,
      id: p.id,
      label: p.name,
      description: p.sku,
      route: `/inventory/products/${p.id}`,
      score,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts backend/src/modules/inventory/services/product.service.spec.ts
git commit -m "feat(search): add ProductService.searchGlobal"
```

---

## Task 4: SalesOrderService.searchGlobal

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`

`SalesOrder` has `orderNumber`, a joined `customer` relation with `customer.name`, and `deletedAt`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/modules/sales/services/sales-order.service.spec.ts` (inside the outer `describe('SalesOrderService', ...)` block):

```typescript
describe('searchGlobal', () => {
  it('returns matching sales orders as GlobalSearchResultDto', async () => {
    const order = {
      id: 'so-uuid-1',
      orderNumber: 'SO-000001',
      customer: { name: 'ABC Trading' },
      deletedAt: null,
    };
    salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([order]),
    });

    const results = await service.searchGlobal('SO-000001', {} as any);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'transaction',
      id: 'so-uuid-1',
      label: 'SO-000001',
      description: 'ABC Trading',
      route: '/sales/orders/so-uuid-1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/services/sales-order.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Add searchGlobal to SalesOrderService**

```typescript
async searchGlobal(query: string, user: any): Promise<import('../search/dto/global-search-result.dto').GlobalSearchResultDto[]> {
  const trimmed = query.trim();
  const orders = await this.salesOrderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.customer', 'customer')
    .where('order.deletedAt IS NULL')
    .andWhere(
      '(order.orderNumber ILIKE :q OR customer.name ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(5)
    .getMany();

  return orders.map((o) => {
    const num = o.orderNumber?.toLowerCase() ?? '';
    let score = 50;
    if (num === trimmed) score = 90;
    else if (num.startsWith(trimmed)) score = 80;
    return {
      type: 'transaction' as const,
      id: o.id,
      label: o.orderNumber,
      description: o.customer?.name ?? '',
      route: `/sales/orders/${o.id}`,
      score,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/services/sales-order.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-order.service.ts backend/src/modules/sales/services/sales-order.service.spec.ts
git commit -m "feat(search): add SalesOrderService.searchGlobal"
```

---

## Task 5: PurchaseOrderService.searchGlobal

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

`PurchaseOrder` has `orderNumber`/`poNumber` (check actual field name in entity), a joined `supplier` relation with `supplier.companyName`, and `deletedAt`.

- [ ] **Step 1: Check the PurchaseOrder entity's order number field name**

```bash
grep -n "orderNumber\|poNumber\|Column" backend/src/database/entities/purchase-order.entity.ts | head -20
```

Note the exact field name — use it in the query below (assume `orderNumber` but adjust if different).

- [ ] **Step 2: Write the failing test**

Check whether `purchase-order.service.spec.ts` already exists:

```bash
ls backend/src/modules/purchasing/services/purchase-order.service.spec.ts 2>/dev/null || echo "not found"
```

If it exists, add the block below inside the outer `describe('PurchaseOrderService', ...)`. If not, create the full file following the Task 2 pattern with `getRepositoryToken(PurchaseOrder)` mock. Add:

```typescript
describe('searchGlobal', () => {
  it('returns matching purchase orders as GlobalSearchResultDto', async () => {
    const order = {
      id: 'po-uuid-1',
      orderNumber: 'PO-000001',
      supplier: { companyName: 'Acme Supplies' },
      deletedAt: null,
    };
    purchaseOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([order]),
    });

    const results = await service.searchGlobal('PO-000001', {} as any);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'transaction',
      id: 'po-uuid-1',
      label: 'PO-000001',
      description: 'Acme Supplies',
      route: '/purchasing/orders/po-uuid-1',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Add searchGlobal to PurchaseOrderService**

```typescript
async searchGlobal(query: string, user: any): Promise<import('../search/dto/global-search-result.dto').GlobalSearchResultDto[]> {
  const trimmed = query.trim();
  const orders = await this.purchaseOrderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.supplier', 'supplier')
    .where('order.deletedAt IS NULL')
    .andWhere(
      '(order.orderNumber ILIKE :q OR supplier.companyName ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(5)
    .getMany();

  return orders.map((o) => {
    const num = o.orderNumber?.toLowerCase() ?? '';
    let score = 50;
    if (num === trimmed) score = 90;
    else if (num.startsWith(trimmed)) score = 80;
    return {
      type: 'transaction' as const,
      id: o.id,
      label: o.orderNumber,
      description: o.supplier?.companyName ?? '',
      route: `/purchasing/orders/${o.id}`,
      score,
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts backend/src/modules/purchasing/services/purchase-order.service.spec.ts
git commit -m "feat(search): add PurchaseOrderService.searchGlobal"
```

---

## Task 6: SearchService and SearchModule

**Files:**
- Create: `backend/src/modules/search/search.service.ts`
- Create: `backend/src/modules/search/search.controller.ts`
- Create: `backend/src/modules/search/search.module.ts`
- Create: `backend/src/modules/search/search.service.spec.ts`

**Before starting:** Verify which services are already exported from their modules. Check:

```bash
grep -n "exports" backend/src/modules/sales/sales.module.ts
grep -n "exports" backend/src/modules/inventory/inventory.module.ts
grep -n "exports" backend/src/modules/purchasing/purchasing.module.ts
```

`CustomerService` and `SalesOrderService` are already exported by `SalesModule`. Add `ProductService` to `InventoryModule` exports and `PurchaseOrderService` to the purchasing module exports if not already there.

- [ ] **Step 1: Write failing SearchService tests**

```typescript
// backend/src/modules/search/search.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { CustomerService } from '../sales/services/customer.service';
import { ProductService } from '../inventory/services/product.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';

describe('SearchService', () => {
  let service: SearchService;
  let customerService: jest.Mocked<Pick<CustomerService, 'searchGlobal'>>;
  let productService: jest.Mocked<Pick<ProductService, 'searchGlobal'>>;
  let salesOrderService: jest.Mocked<Pick<SalesOrderService, 'searchGlobal'>>;
  let purchaseOrderService: jest.Mocked<Pick<PurchaseOrderService, 'searchGlobal'>>;

  const mockUser = { userId: 'u1', username: 'admin' } as any;

  const makeResult = (label: string, score: number): GlobalSearchResultDto => ({
    type: 'customer',
    id: 'id-1',
    label,
    route: '/customers/id-1',
    score,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: CustomerService, useValue: { searchGlobal: jest.fn().mockResolvedValue([]) } },
        { provide: ProductService, useValue: { searchGlobal: jest.fn().mockResolvedValue([]) } },
        { provide: SalesOrderService, useValue: { searchGlobal: jest.fn().mockResolvedValue([]) } },
        { provide: PurchaseOrderService, useValue: { searchGlobal: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get(SearchService);
    customerService = module.get(CustomerService);
    productService = module.get(ProductService);
    salesOrderService = module.get(SalesOrderService);
    purchaseOrderService = module.get(PurchaseOrderService);
  });

  it('fans out to all four sources in parallel', async () => {
    await service.search('abc', mockUser);
    expect(customerService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(productService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(salesOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
    expect(purchaseOrderService.searchGlobal).toHaveBeenCalledWith('abc', mockUser);
  });

  it('returns early with empty results for queries shorter than 2 characters', async () => {
    const result = await service.search('a', mockUser);
    expect(result.results).toEqual([]);
    expect(customerService.searchGlobal).not.toHaveBeenCalled();
  });

  it('returns early with empty results for blank query', async () => {
    const result = await service.search('  ', mockUser);
    expect(result.results).toEqual([]);
  });

  it('sorts merged results by descending score', async () => {
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([makeResult('Low', 50)]);
    (productService.searchGlobal as jest.Mock).mockResolvedValue([makeResult('High', 100)]);

    const result = await service.search('test', mockUser);
    expect(result.results[0].score).toBe(100);
    expect(result.results[1].score).toBe(50);
  });

  it('treats undefined score as 0 when sorting', async () => {
    const noScore: GlobalSearchResultDto = { type: 'page', label: 'Dashboard', route: '/dashboard' };
    const withScore = makeResult('ABC', 50);
    (customerService.searchGlobal as jest.Mock).mockResolvedValue([noScore]);
    (productService.searchGlobal as jest.Mock).mockResolvedValue([withScore]);

    const result = await service.search('dash', mockUser);
    expect(result.results[0].score).toBe(50);
  });

  it('caps results at 20', async () => {
    const many = Array.from({ length: 15 }, (_, i) => makeResult(`item-${i}`, 50));
    (customerService.searchGlobal as jest.Mock).mockResolvedValue(many);
    (productService.searchGlobal as jest.Mock).mockResolvedValue(many);

    const result = await service.search('item', mockUser);
    expect(result.results.length).toBeLessThanOrEqual(20);
  });

  it('returns partial results if one source fails', async () => {
    (customerService.searchGlobal as jest.Mock).mockRejectedValue(new Error('DB error'));
    (productService.searchGlobal as jest.Mock).mockResolvedValue([makeResult('Widget', 80)]);

    const result = await service.search('wi', mockUser);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].label).toBe('Widget');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './search.service'`

- [ ] **Step 3: Create SearchService**

```typescript
// backend/src/modules/search/search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CustomerService } from '../sales/services/customer.service';
import { ProductService } from '../inventory/services/product.service';
import { SalesOrderService } from '../sales/services/sales-order.service';
import { PurchaseOrderService } from '../purchasing/services/purchase-order.service';
import { GlobalSearchResultDto } from './dto/global-search-result.dto';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto';

const STATIC_PAGES: Array<{ label: string; keywords: string[]; route: string }> = [
  { label: 'Dashboard', keywords: ['home', 'overview'], route: '/dashboard' },
  { label: 'Customers', keywords: ['clients', 'buyers'], route: '/customers' },
  { label: 'Products', keywords: ['items', 'inventory', 'catalogue'], route: '/inventory/products' },
  { label: 'Sales Orders', keywords: ['orders', 'so'], route: '/sales/orders' },
  { label: 'Purchase Orders', keywords: ['purchasing', 'po', 'procurement'], route: '/purchasing/orders' },
  { label: 'Invoices', keywords: ['billing'], route: '/sales/invoices' },
  { label: 'Payments', keywords: ['receipts'], route: '/sales/payments' },
  { label: 'Suppliers', keywords: ['vendors'], route: '/purchasing/suppliers' },
  { label: 'Stock Adjustments', keywords: ['adjustment', 'inventory'], route: '/inventory/adjustments' },
  { label: 'Categories', keywords: ['product categories'], route: '/inventory/categories' },
  { label: 'Price Lists', keywords: ['pricing'], route: '/price-lists' },
  { label: 'Journal Entries', keywords: ['accounting', 'ledger'], route: '/accounting/journal-entries' },
  { label: 'Chart of Accounts', keywords: ['accounts', 'coa'], route: '/accounting/chart-of-accounts' },
  { label: 'Fiscal Periods', keywords: ['financial periods'], route: '/accounting/fiscal-periods' },
  { label: 'User Management', keywords: ['users', 'roles'], route: '/settings/users' },
  { label: 'Settings', keywords: ['configuration', 'preferences'], route: '/settings' },
  { label: 'Audit Logs', keywords: ['activity', 'history'], route: '/audit-logs' },
];

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly customerService: CustomerService,
    private readonly productService: ProductService,
    private readonly salesOrderService: SalesOrderService,
    private readonly purchaseOrderService: PurchaseOrderService,
  ) {}

  async search(query: string, user: any): Promise<GlobalSearchResponseDto> {
    const trimmed = query?.trim() ?? '';
    if (trimmed.length < 2) {
      return { query, results: [] };
    }

    const [pages, customers, products, transactions] = await Promise.all([
      this.safeSearch('pages', () => Promise.resolve(this.searchPages(trimmed))),
      this.safeSearch('customers', () => this.customerService.searchGlobal(trimmed, user)),
      this.safeSearch('products', () => this.productService.searchGlobal(trimmed, user)),
      this.safeSearch('transactions', () => this.searchTransactions(trimmed, user)),
    ]);

    const results = [...pages, ...customers, ...products, ...transactions]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 20);

    return { query, results };
  }

  private async safeSearch(
    source: string,
    fn: () => Promise<GlobalSearchResultDto[]>,
  ): Promise<GlobalSearchResultDto[]> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(`Search source "${source}" failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async searchTransactions(query: string, user: any): Promise<GlobalSearchResultDto[]> {
    const [salesOrders, purchaseOrders] = await Promise.all([
      this.salesOrderService.searchGlobal(query, user),
      this.purchaseOrderService.searchGlobal(query, user),
    ]);
    return [...salesOrders, ...purchaseOrders];
  }

  private searchPages(query: string): GlobalSearchResultDto[] {
    const lower = query.toLowerCase();
    return STATIC_PAGES
      .filter((p) =>
        p.label.toLowerCase().includes(lower) ||
        p.keywords.some((k) => k.includes(lower)),
      )
      .map((p) => {
        const label = p.label.toLowerCase();
        let score = 50;
        if (label === lower) score = 100;
        else if (label.startsWith(lower)) score = 80;
        return {
          type: 'page' as const,
          label: p.label,
          description: 'Navigation',
          route: p.route,
          score,
        };
      });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Create SearchController**

```typescript
// backend/src/modules/search/search.controller.ts
import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  @ApiOperation({ summary: 'Global search across pages, customers, products, and transactions' })
  async searchGlobal(
    @Query() query: GlobalSearchQueryDto,
    @Request() req: any,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.search(query.q, req.user);
  }
}
```

Note: `JwtAuthGuard` is registered globally in `AppModule` via `APP_GUARD`. All routes are protected by default — no guard decorator needed on this controller.

- [ ] **Step 6: Export domain services and create SearchModule**

First, verify and add any missing exports. Check the purchasing module:

```bash
grep -n "exports" backend/src/modules/purchasing/purchasing.module.ts
```

Add `PurchaseOrderService` to purchasing module exports if missing. Add `ProductService` to inventory module exports if missing.

Then create the search module:

```typescript
// backend/src/modules/search/search.module.ts
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SalesModule } from '../sales/sales.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasingModule } from '../purchasing/purchasing.module';

@Module({
  imports: [SalesModule, InventoryModule, PurchasingModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

> **⚠️ Circular dependency risk:** `SalesModule` already imports `InventoryModule` via `forwardRef()`. Adding `SearchModule` (which imports all three) to `AppModule` alongside them may trigger a NestJS circular dependency error at startup. When you run `npm run test` and `npm run start:dev` in Steps 8 and 9, watch for `Error: Circular dependency detected`. If it appears, wrap the problematic import in `forwardRef()`:
>
> ```typescript
> imports: [forwardRef(() => SalesModule), forwardRef(() => InventoryModule), forwardRef(() => PurchasingModule)]
> ```
>
> Add `import { forwardRef } from '@nestjs/common'` at the top.

- [ ] **Step 7: Register SearchModule in AppModule**

In `backend/src/app.module.ts`, add `SearchModule` to the imports array and its import at the top:

```typescript
import { SearchModule } from './modules/search/search.module';
// Add to imports array:
SearchModule,
```

- [ ] **Step 8: Run all backend tests**

```bash
cd backend && npm run test
```

Expected: All existing tests pass, new search tests pass.

- [ ] **Step 9: TypeScript check**

```bash
cd backend && npm run lint
```

Fix any type errors before committing.

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/search/ backend/src/app.module.ts backend/src/modules/inventory/inventory.module.ts backend/src/modules/purchasing/purchasing.module.ts
git commit -m "feat(search): add SearchModule, SearchService, SearchController"
```

---

## Task 7: Frontend types and RTK Query slice

**Files:**
- Create: `frontend/src/types/search.ts`
- Create: `frontend/src/store/api/searchApi.ts`
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Create frontend types**

```typescript
// frontend/src/types/search.ts
export type GlobalSearchResultType = 'page' | 'customer' | 'product' | 'transaction'

export interface GlobalSearchResultDto {
  type: GlobalSearchResultType
  id?: string
  label: string
  description?: string
  route: string
  score?: number
}

export interface GlobalSearchResponse {
  query: string
  results: GlobalSearchResultDto[]
}
```

- [ ] **Step 2: Create the RTK Query slice**

```typescript
// frontend/src/store/api/searchApi.ts
import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './baseQuery'
import type { GlobalSearchResponse } from '@/types/search'

export const searchApiSlice = createApi({
  reducerPath: 'searchApi',
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    searchGlobal: builder.query<GlobalSearchResponse, { q: string }>({
      query: ({ q }) => ({ url: '/search/global', params: { q } }),
      // axiosBaseQuery returns result.data (the HTTP body) directly.
      // The search endpoint returns { query, results } — no extra wrapper needed.
      transformResponse: (response: any): GlobalSearchResponse =>
        response as GlobalSearchResponse,
      keepUnusedDataFor: 0,
    }),
  }),
})

export const { useSearchGlobalQuery } = searchApiSlice
```

- [ ] **Step 3: Register in the store**

In `frontend/src/store/index.ts`, add the import and register the reducer and middleware following the same pattern as other API slices:

```typescript
// Add import:
import { searchApiSlice } from './api/searchApi'

// Add to rootReducer combineReducers:
[searchApiSlice.reducerPath]: searchApiSlice.reducer,

// Add to middleware .concat():
searchApiSlice.middleware,
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Fix any errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/search.ts frontend/src/store/api/searchApi.ts frontend/src/store/index.ts
git commit -m "feat(search): add searchApi RTK Query slice and frontend types"
```

---

## Task 8: SearchModal — replace placeholder with real behavior

**Files:**
- Modify: `frontend/src/components/common/SearchModal.tsx`
- Modify: `frontend/src/components/common/__tests__/SearchModal.test.tsx`

The current `SearchModal` renders a "Coming Soon" placeholder. This task replaces it entirely while keeping the same props interface (`open: boolean, onClose: () => void`).

- [ ] **Step 1: Write the failing tests first**

Replace the entire content of `frontend/src/components/common/__tests__/SearchModal.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import SearchModal from '../SearchModal'
import { searchApiSlice } from '@/store/api/searchApi'
import type { GlobalSearchResponse } from '@/types/search'

// Helper to create a minimal store for tests
function makeStore(searchResult?: GlobalSearchResponse) {
  return configureStore({
    reducer: {
      [searchApiSlice.reducerPath]: searchApiSlice.reducer,
    },
    middleware: (getDefault) => getDefault().concat(searchApiSlice.middleware),
  })
}

// Mock useSearchGlobalQuery
const mockUseSearchGlobal = vi.fn()
vi.mock('@/store/api/searchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/searchApi')>()
  return {
    ...actual,
    useSearchGlobalQuery: (...args: any[]) => mockUseSearchGlobal(...args),
  }
})

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderModal(open = true) {
  const onClose = vi.fn()
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter>
        <SearchModal open={open} onClose={onClose} />
      </MemoryRouter>
    </Provider>
  )
  return { onClose }
}

describe('SearchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSearchGlobal.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: false })
  })

  it('renders nothing when closed', () => {
    renderModal(false)
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
  })

  it('shows help text when query is shorter than 2 characters', () => {
    renderModal()
    expect(screen.getByText(/type at least 2 characters/i)).toBeInTheDocument()
  })

  it('skips the query when trimmed length is less than 2', () => {
    renderModal()
    expect(mockUseSearchGlobal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true })
    )
  })

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows loading state while fetching with no prior results', () => {
    mockUseSearchGlobal.mockReturnValue({ data: undefined, isLoading: true, isFetching: true, isError: false })
    renderModal()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders grouped results by type', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          { type: 'page', label: 'Customers', description: 'Navigation', route: '/customers' },
          { type: 'customer', id: '1', label: 'ABC Trading', description: 'CUST-001', route: '/customers/1' },
          { type: 'product', id: '2', label: 'ABC Widget', description: 'SKU-001', route: '/inventory/products/2' },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })
    renderModal()
    expect(screen.getByText('Pages')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('ABC Trading')).toBeInTheDocument()
    expect(screen.getByText('ABC Widget')).toBeInTheDocument()
  })

  it('shows no-results message when results are empty', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: { query: 'zzz', results: [] },
      isLoading: false,
      isFetching: false,
      isError: false,
    })
    renderModal()
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })

  it('navigates and closes when Enter is pressed on selected result', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          { type: 'customer', id: '1', label: 'ABC Trading', route: '/customers/1' },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })
    const { onClose } = renderModal()
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/customers/1')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error message when query fails', () => {
    mockUseSearchGlobal.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: true })
    renderModal()
    expect(screen.getByText(/search unavailable/i)).toBeInTheDocument()
  })

  it('skips the query when typing fewer than 2 characters (debounce integration)', async () => {
    renderModal()
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'a' } })
    // With a real debounce the skip flag stays true for single chars.
    // The mock is called synchronously on render; verify skip: true is still in effect.
    expect(mockUseSearchGlobal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true })
    )
  })

  it('resets query when modal reopens', () => {
    const store = makeStore()
    const onClose = vi.fn()
    const { rerender } = render(
      <Provider store={store}>
        <MemoryRouter>
          <SearchModal open={true} onClose={onClose} />
        </MemoryRouter>
      </Provider>
    )
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(input).toHaveValue('abc')

    // Simulate close then reopen
    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <SearchModal open={false} onClose={onClose} />
        </MemoryRouter>
      </Provider>
    )
    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <SearchModal open={true} onClose={onClose} />
        </MemoryRouter>
      </Provider>
    )
    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('')
  })

  it('ArrowDown wraps from last result to first', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          { type: 'customer', id: '1', label: 'First', route: '/customers/1' },
          { type: 'customer', id: '2', label: 'Second', route: '/customers/2' },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })
    renderModal()
    const input = screen.getByPlaceholderText(/search/i)
    // Navigate to last item (index 1)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Navigate past last item — should wrap to first
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Press Enter — should navigate to first item (index 0)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/customers/1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SearchModal.test.tsx
```

Expected: Several failures since the component still has placeholder content.

- [ ] **Step 3: Replace SearchModal with real implementation**

Replace the entire content of `frontend/src/components/common/SearchModal.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  CircularProgress,
  Divider,
  InputBase,
  Modal,
  Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { useSearchGlobalQuery } from '@/store/api/searchApi'
import type { GlobalSearchResultDto, GlobalSearchResultType } from '@/types/search'

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

const GROUP_ORDER: GlobalSearchResultType[] = ['page', 'customer', 'product', 'transaction']
const GROUP_LABELS: Record<GlobalSearchResultType, string> = {
  page: 'Pages',
  customer: 'Customers',
  product: 'Products',
  transaction: 'Transactions',
}
const TYPE_BADGES: Record<GlobalSearchResultType, string> = {
  page: 'Page',
  customer: 'Customer',
  product: 'Product',
  transaction: 'Transaction',
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 250)
  const trimmed = debouncedQuery.trim()

  const { data, isLoading, isFetching, isError } = useSearchGlobalQuery(
    { q: trimmed },
    { skip: trimmed.length < 2 }
  )

  // Flatten results in group order for keyboard navigation
  const flatResults: GlobalSearchResultDto[] = data
    ? GROUP_ORDER.flatMap((type) => data.results.filter((r) => r.type === type))
    : []

  // Reset selectedIndex when a completed fetch delivers new results
  const prevDataRef = useRef(data)
  useEffect(() => {
    if (data !== prevDataRef.current) {
      setSelectedIndex(0)
      prevDataRef.current = data
    }
  }, [data])

  // Auto-focus and reset state on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleClose = () => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  const navigateTo = (route: string) => {
    navigate(route)
    handleClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % Math.max(flatResults.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + Math.max(flatResults.length, 1)) % Math.max(flatResults.length, 1))
    } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
      navigateTo(flatResults[selectedIndex].route)
    }
  }

  // Group results for rendering
  const groups = GROUP_ORDER.map((type) => ({
    type,
    label: GROUP_LABELS[type],
    items: flatResults.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0)

  // Flat index offset per group for selectedIndex mapping
  const groupOffsets = groups.reduce<Record<string, number>>((acc, g, i) => {
    const prev = groups.slice(0, i).reduce((sum, pg) => sum + pg.items.length, 0)
    acc[g.type] = prev
    return acc
  }, {})

  const showLoading = (isLoading || isFetching) && !data
  const showEmpty = !isLoading && !isFetching && data && flatResults.length === 0
  const showHelp = trimmed.length < 2 && !isLoading

  return (
    <Modal open={open} onClose={handleClose}>
      <Box
        sx={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: '90vw', sm: 560 },
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#1E1E1E',
          border: '1px solid #2A2A2A',
          borderRadius: 2,
          overflow: 'hidden',
          boxShadow: 24,
        }}
      >
        {/* Input row */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, gap: 1 }}>
          <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <InputBase
            inputRef={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, customers, products, transactions..."
            fullWidth
            sx={{ color: 'text.primary', fontSize: 14 }}
            inputProps={{ 'aria-label': 'global search' }}
          />
          {(isLoading || isFetching) && (
            <CircularProgress size={16} sx={{ color: 'text.secondary' }} />
          )}
        </Box>

        <Divider sx={{ borderColor: '#2A2A2A' }} />

        {/* Results area */}
        <Box sx={{ overflowY: 'auto', maxHeight: 'calc(60vh - 56px)' }}>
          {showHelp && (
            <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, textAlign: 'center' }}>
              Type at least 2 characters to search pages, customers, products, and transactions.
            </Typography>
          )}

          {showLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} role="progressbar" />
            </Box>
          )}

          {isError && (
            <Typography variant="body2" sx={{ color: 'error.main', p: 2, textAlign: 'center' }}>
              Search unavailable, please try again.
            </Typography>
          )}

          {showEmpty && (
            <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, textAlign: 'center' }}>
              No results for &ldquo;{data?.query}&rdquo;
            </Typography>
          )}

          {groups.map((group) =>
            <Box key={group.type}>
              <Typography
                variant="caption"
                sx={{ display: 'block', px: 2, py: 0.75, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}
              >
                {group.label}
              </Typography>
              {group.items.map((item, itemIndex) => {
                const flatIdx = groupOffsets[group.type] + itemIndex
                const isSelected = flatIdx === selectedIndex
                return (
                  <Box
                    key={`${item.type}-${item.id ?? item.route}`}
                    ref={isSelected ? selectedRef : undefined}
                    onClick={() => navigateTo(item.route)}
                    onMouseEnter={() => setSelectedIndex(flatIdx)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 2,
                      py: 1,
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>
                        {item.label}
                      </Typography>
                      {item.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {item.description}
                        </Typography>
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        color: 'text.disabled',
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {TYPE_BADGES[item.type]}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      </Box>
    </Modal>
  )
}
```

- [ ] **Step 4: Run the tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SearchModal.test.tsx
```

Expected: All tests pass. If any fail, inspect the failure message and fix the implementation.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Fix any type errors.

- [ ] **Step 6: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/SearchModal.tsx frontend/src/components/common/__tests__/SearchModal.test.tsx
git commit -m "feat(search): implement SearchModal with real search behavior"
```

---

## Task 9: Smoke test end-to-end

- [ ] **Step 1: Build and start the backend dev server**

```bash
cd backend && npm run start:dev
```

Or if using Docker:

```bash
docker compose build backend && docker compose up -d backend
```

- [ ] **Step 2: Test the endpoint directly**

```bash
curl -s -H "Authorization: Bearer <your-token>" \
  "http://localhost:3000/search/global?q=cust" | jq .
```

Expected: `{ "query": "cust", "results": [...] }` with customer and page results.

To get a token quickly: `POST /auth/login` with `{ "username": "admin", "password": "Admin@123!" }` and use the returned `accessToken`.

- [ ] **Step 3: Start the frontend and test the modal**

```bash
cd frontend && npm run dev
```

Open the app, press `Ctrl+K`, type at least 2 characters. Verify:
- Results appear grouped
- Arrow keys navigate
- Enter opens the result
- Esc closes the modal

- [ ] **Step 4: Commit any smoke-test fixes**

If you found and fixed issues during smoke testing, commit them:

```bash
git add -p
git commit -m "fix(search): address smoke test issues"
```

---

## Task 10: Final cleanup and lint

- [ ] **Step 1: Run backend lint**

```bash
cd backend && npm run lint && npm run format
```

- [ ] **Step 2: Run frontend lint**

```bash
cd frontend && npm run lint
```

- [ ] **Step 3: Run all tests one final time**

```bash
cd backend && npm run test
cd frontend && npm run test
```

- [ ] **Step 4: Final commit if any lint fixes were needed**

```bash
git add .
git commit -m "chore(search): lint and format fixes"
```
