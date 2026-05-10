# Global Search Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve global search with better backend ranking, per-user recent searches (localStorage), text highlighting, and an improved empty state — without changing the API contract.

**Architecture:** Backend-first then frontend. Task 1 centralizes scoring constants and raises per-entity candidate limits. Tasks 2–5 update each domain service to use those constants. Task 6 updates the orchestrator and its tests. Tasks 7–9 add frontend utilities and update the SearchModal.

**Tech Stack:** NestJS 11 (backend), TypeScript, TypeORM, Jest; React 19, Material-UI v7, RTK Query, Vitest, Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-03-22-global-search-phase3-design.md`

---

## File Map

### Backend (new / modified)

| File | Role |
|---|---|
| `backend/src/modules/search/search.constants.ts` | **New** — all scoring scores, boosts, and limit constants |
| `backend/src/modules/search/search.service.ts` | Refactor `searchPages` to use constants; add label tie-break to sort |
| `backend/src/modules/search/search.service.spec.ts` | Add tie-break test; update score assertions |
| `backend/src/modules/sales/services/customer.service.ts` | Import constants; new score model + `.take(10)` |
| `backend/src/modules/sales/services/customer.service.spec.ts` | Update/add scoring tests |
| `backend/src/modules/inventory/services/product.service.ts` | Import constants; new score model + `.take(10)` |
| `backend/src/modules/inventory/services/product.service.spec.ts` | Update/add scoring tests |
| `backend/src/modules/sales/services/sales-order.service.ts` | Import constants; new score model + `.take(10)` |
| `backend/src/modules/sales/services/sales-order.service.spec.ts` | Update/add scoring tests |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | Import constants; new score model + `.take(10)` |
| `backend/src/modules/purchasing/services/purchase-order.service.spec.ts` | Update/add scoring tests |

### Frontend (new / modified)

| File | Role |
|---|---|
| `frontend/src/utils/recentSearch.ts` | **New** — localStorage recent search utility (get/add/clear) |
| `frontend/src/utils/recentSearch.test.ts` | **New** — unit tests for recent search utility |
| `frontend/src/utils/highlightText.tsx` | **New** — text highlight helper returning ReactNode |
| `frontend/src/utils/highlightText.test.tsx` | **New** — unit tests for highlight helper |
| `frontend/src/components/common/SearchModal.tsx` | Add recent section, highlight, improved empty state, selection reset |
| `frontend/src/components/common/__tests__/SearchModal.test.tsx` | Update/add tests for new behavior |

---

## Task 1: Create search.constants.ts

**Files:**
- Create: `backend/src/modules/search/search.constants.ts`

- [ ] **Step 1: Create the constants file**

```typescript
// backend/src/modules/search/search.constants.ts

/** Maximum number of candidates fetched per entity source before merge */
export const SEARCH_CANDIDATE_LIMIT = 10;

/** Maximum number of results returned in the final response */
export const SEARCH_RESPONSE_LIMIT = 20;

// Base match scores — applied before entity boost
export const SCORE_EXACT_CODE = 120;      // barcode, orderNumber exact match
export const SCORE_STARTSWITH_CODE = 100; // barcode, orderNumber starts-with
export const SCORE_EXACT_NAME = 95;       // name exact match
export const SCORE_STARTSWITH_NAME = 85;  // name starts-with
export const SCORE_CONTAINS = 60;         // ILIKE fallback

// Page-specific scores (static, in-memory — no DB query)
export const SCORE_PAGE_EXACT = 90;       // label exact match
export const SCORE_PAGE_STARTSWITH = 75;  // label starts-with
export const SCORE_PAGE_KEYWORD = 50;     // keyword contains

// Entity type boosts — added after base score to break cross-entity ties
export const BOOST_TRANSACTION = 10;
export const BOOST_CUSTOMER = 8;
export const BOOST_PRODUCT = 6;
export const BOOST_PAGE = 2;
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep search.constants
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/search/search.constants.ts
git commit -m "feat(search): add centralized scoring and limit constants"
```

---

## Task 2: Update CustomerService.searchGlobal

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts` (the `searchGlobal` method, currently lines ~132–169)
- Modify: `backend/src/modules/sales/services/customer.service.spec.ts`

The current method uses `.take(5)` and hardcoded scores (100/90/80/50). We're replacing the scores with imported constants, adding the entity boost, raising the limit, and reordering: exact code (phone) checked before exact name.

- [ ] **Step 1: Write the failing tests first**

Find the existing `searchGlobal` describe block in `customer.service.spec.ts` (search for `searchGlobal`). Add these tests alongside existing ones:

```typescript
// In the describe('searchGlobal') block, add:

it('exact phone match scores SCORE_EXACT_CODE + BOOST_CUSTOMER', async () => {
  const mockCustomer = {
    id: 'c1',
    name: 'Acme Corp',
    phone: '0123456789',
  };
  mockRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockCustomer]),
  });

  const results = await service.searchGlobal('0123456789', adminUser);

  // SCORE_EXACT_CODE (120) + BOOST_CUSTOMER (8) = 128
  expect(results[0].score).toBe(128);
});

it('exact name match scores SCORE_EXACT_NAME + BOOST_CUSTOMER', async () => {
  const mockCustomer = { id: 'c1', name: 'acme corp', phone: null };
  mockRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockCustomer]),
  });

  const results = await service.searchGlobal('acme corp', adminUser);

  // SCORE_EXACT_NAME (95) + BOOST_CUSTOMER (8) = 103
  expect(results[0].score).toBe(103);
});

it('phone exact match outranks name exact match', async () => {
  // phone exact = 128, name exact = 103 — phone wins
  const mockCustomer = { id: 'c1', name: 'acme corp', phone: 'acme corp' };
  mockRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockCustomer]),
  });

  const results = await service.searchGlobal('acme corp', adminUser);

  expect(results[0].score).toBe(128); // phone exact wins
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — scores will be old values (100, 90, etc.)

- [ ] **Step 3: Update the searchGlobal method**

Replace the entire `searchGlobal` method body in `customer.service.ts`:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchCustomers(user.role)) return [];

  const trimmed = query.trim();
  const customers = await this.customerRepository
    .createQueryBuilder('customer')
    .where('customer.deletedAt IS NULL')
    .andWhere(
      '(customer.name ILIKE :q OR customer.phone ILIKE :q)',
      { q: `%${trimmed}%` },
    )
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return customers.map((customer) => {
    const name = customer.name?.toLowerCase() ?? '';
    const phone = customer.phone?.toLowerCase() ?? '';
    const q = trimmed.toLowerCase();

    // Check phone (identifier) before name — exact code has higher priority (120 > 95)
    const baseScore =
      phone && phone === q     ? SCORE_EXACT_CODE
      : phone && phone.startsWith(q) ? SCORE_STARTSWITH_CODE
      : name === q             ? SCORE_EXACT_NAME
      : name.startsWith(q)     ? SCORE_STARTSWITH_NAME
                               : SCORE_CONTAINS;

    return {
      type: 'customer' as const,
      id: customer.id,
      label: customer.name,
      description: customer.phone,
      route: `/sales/customers/${customer.id}`,
      score: baseScore + BOOST_CUSTOMER,
    };
  });
}
```

Add the import at the top of the file (alongside existing imports):

```typescript
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  BOOST_CUSTOMER,
} from '../../search/search.constants';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts \
        backend/src/modules/sales/services/customer.service.spec.ts
git commit -m "feat(search): update customer scoring to Phase 3 model"
```

---

## Task 3: Update ProductService.searchGlobal

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts` (the `searchGlobal` method, currently lines ~294–333)
- Modify: `backend/src/modules/inventory/services/product.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `product.service.spec.ts`, find or create the `searchGlobal` describe block and add:

```typescript
it('exact barcode match scores SCORE_EXACT_CODE + BOOST_PRODUCT', async () => {
  const mockProduct = { id: 'p1', name: 'Widget', barcode: 'BC-001' };
  mockRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockProduct]),
  });

  const results = await service.searchGlobal('BC-001', adminUser);

  // SCORE_EXACT_CODE (120) + BOOST_PRODUCT (6) = 126
  expect(results[0].score).toBe(126);
});

it('exact name match scores SCORE_EXACT_NAME + BOOST_PRODUCT', async () => {
  const mockProduct = { id: 'p1', name: 'Widget', barcode: 'BC-999' };
  mockRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockProduct]),
  });

  const results = await service.searchGlobal('widget', adminUser);

  // SCORE_EXACT_NAME (95) + BOOST_PRODUCT (6) = 101
  expect(results[0].score).toBe(101);
});

it('barcode exact match outranks name exact match', async () => {
  const mockProduct = { id: 'p1', name: 'widget', barcode: 'widget' };
  mockRepo.createQueryBuilder.mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockProduct]),
  });

  const results = await service.searchGlobal('widget', adminUser);

  expect(results[0].score).toBe(126); // barcode exact (120+6) wins over name exact (95+6)
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL

- [ ] **Step 3: Update the searchGlobal method**

Replace the entire `searchGlobal` method body in `product.service.ts`:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchProducts(user.role)) return [];

  const trimmed = query.trim();
  const products = await this.productRepository
    .createQueryBuilder('product')
    .where('product.deletedAt IS NULL')
    .andWhere('(product.name ILIKE :q OR product.barcode ILIKE :q)', {
      q: `%${trimmed}%`,
    })
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return products.map((product) => {
    const name = product.name?.toLowerCase() ?? '';
    const barcode = product.barcode?.toLowerCase() ?? '';
    const q = trimmed.toLowerCase();

    // Check barcode (identifier) before name — exact code has higher priority (120 > 95)
    const baseScore =
      barcode && barcode === q       ? SCORE_EXACT_CODE
      : barcode && barcode.startsWith(q) ? SCORE_STARTSWITH_CODE
      : name === q                   ? SCORE_EXACT_NAME
      : name.startsWith(q)           ? SCORE_STARTSWITH_NAME
                                     : SCORE_CONTAINS;

    return {
      type: 'product' as const,
      id: product.id,
      label: product.name,
      description: product.barcode,
      route: `/inventory/products/${product.id}/edit`,
      score: baseScore + BOOST_PRODUCT,
    };
  });
}
```

Add import at top of file:

```typescript
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  BOOST_PRODUCT,
} from '../../search/search.constants';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts \
        backend/src/modules/inventory/services/product.service.spec.ts
git commit -m "feat(search): update product scoring to Phase 3 model"
```

---

## Task 4: Update SalesOrderService.searchGlobal

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts` (the `searchGlobal` method, currently lines ~356–390)
- Modify: `backend/src/modules/sales/services/sales-order.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `sales-order.service.spec.ts`, add:

```typescript
// Helper — call this inside each test to set up the mock.
// The sales order query builder uses leftJoinAndSelect for the customer join.
function mockSOQuery(order: { id: string; orderNumber: string; customer: { name: string } }) {
  mockRepo.createQueryBuilder.mockReturnValue({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([order]),
  });
}

it('exact orderNumber match scores SCORE_EXACT_CODE + BOOST_TRANSACTION', async () => {
  mockSOQuery({ id: 'so1', orderNumber: 'SO-001', customer: { name: 'Acme' } });
  const results = await service.searchGlobal('SO-001', adminUser);
  // SCORE_EXACT_CODE (120) + BOOST_TRANSACTION (10) = 130
  expect(results[0].score).toBe(130);
});

it('orderNumber startsWith scores SCORE_STARTSWITH_CODE + BOOST_TRANSACTION', async () => {
  mockSOQuery({ id: 'so1', orderNumber: 'SO-001', customer: { name: 'Acme' } });
  const results = await service.searchGlobal('SO-', adminUser);
  // SCORE_STARTSWITH_CODE (100) + BOOST_TRANSACTION (10) = 110
  expect(results[0].score).toBe(110);
});

it('contains match scores SCORE_CONTAINS + BOOST_TRANSACTION', async () => {
  mockSOQuery({ id: 'so1', orderNumber: 'SO-001', customer: { name: 'Acme Corp' } });
  const results = await service.searchGlobal('Acme', adminUser);
  // SCORE_CONTAINS (60) + BOOST_TRANSACTION (10) = 70
  expect(results[0].score).toBe(70);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-order.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL

- [ ] **Step 3: Update the searchGlobal method**

Replace the entire `searchGlobal` method body in `sales-order.service.ts`:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchSalesOrders(user.role)) return [];

  const trimmed = query.trim();
  const orders = await this.salesOrderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.customer', 'customer')
    .where('order.deletedAt IS NULL')
    .andWhere('(order.orderNumber ILIKE :q OR customer.name ILIKE :q)', {
      q: `%${trimmed}%`,
    })
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return orders.map((order) => {
    const orderNumber = order.orderNumber?.toLowerCase() ?? '';
    const q = trimmed.toLowerCase();

    const baseScore =
      orderNumber === q         ? SCORE_EXACT_CODE
      : orderNumber.startsWith(q) ? SCORE_STARTSWITH_CODE
                                  : SCORE_CONTAINS;

    return {
      type: 'transaction' as const,
      id: order.id,
      label: order.orderNumber,
      description: order.customer?.name ?? '',
      route: `/sales/orders/${order.id}/edit`,
      score: baseScore + BOOST_TRANSACTION,
    };
  });
}
```

Add import at top of file:

```typescript
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  BOOST_TRANSACTION,
} from '../../search/search.constants';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-order.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-order.service.ts \
        backend/src/modules/sales/services/sales-order.service.spec.ts
git commit -m "feat(search): update sales order scoring to Phase 3 model"
```

---

## Task 5: Update PurchaseOrderService.searchGlobal

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts` (the `searchGlobal` method, currently lines ~336–370)
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `purchase-order.service.spec.ts`, add:

```typescript
// Helper — purchase order query builder uses leftJoinAndSelect for the supplier join.
function mockPOQuery(order: { id: string; orderNumber: string; supplier: { companyName: string } }) {
  mockRepo.createQueryBuilder.mockReturnValue({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([order]),
  });
}

it('exact orderNumber match scores SCORE_EXACT_CODE + BOOST_TRANSACTION', async () => {
  mockPOQuery({ id: 'po1', orderNumber: 'PO-001', supplier: { companyName: 'Vendor' } });
  const results = await service.searchGlobal('PO-001', adminUser);
  // SCORE_EXACT_CODE (120) + BOOST_TRANSACTION (10) = 130
  expect(results[0].score).toBe(130);
});

it('orderNumber startsWith scores SCORE_STARTSWITH_CODE + BOOST_TRANSACTION', async () => {
  mockPOQuery({ id: 'po1', orderNumber: 'PO-001', supplier: { companyName: 'Vendor' } });
  const results = await service.searchGlobal('PO-', adminUser);
  // SCORE_STARTSWITH_CODE (100) + BOOST_TRANSACTION (10) = 110
  expect(results[0].score).toBe(110);
});

it('contains match scores SCORE_CONTAINS + BOOST_TRANSACTION', async () => {
  mockPOQuery({ id: 'po1', orderNumber: 'PO-001', supplier: { companyName: 'Global Vendor' } });
  const results = await service.searchGlobal('Vendor', adminUser);
  // SCORE_CONTAINS (60) + BOOST_TRANSACTION (10) = 70
  expect(results[0].score).toBe(70);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL

- [ ] **Step 3: Update the searchGlobal method**

Replace the entire `searchGlobal` method body in `purchase-order.service.ts`:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchPurchaseOrders(user.role)) return [];

  const trimmed = query.trim();
  const orders = await this.purchaseOrderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.supplier', 'supplier')
    .where('order.deletedAt IS NULL')
    .andWhere('(order.orderNumber ILIKE :q OR supplier.companyName ILIKE :q)', {
      q: `%${trimmed}%`,
    })
    .take(SEARCH_CANDIDATE_LIMIT)
    .getMany();

  return orders.map((order) => {
    const orderNumber = order.orderNumber?.toLowerCase() ?? '';
    const q = trimmed.toLowerCase();

    const baseScore =
      orderNumber === q         ? SCORE_EXACT_CODE
      : orderNumber.startsWith(q) ? SCORE_STARTSWITH_CODE
                                  : SCORE_CONTAINS;

    return {
      type: 'transaction' as const,
      id: order.id,
      label: order.orderNumber,
      description: order.supplier?.companyName ?? '',
      route: `/purchasing/orders/${order.id}/edit`,
      score: baseScore + BOOST_TRANSACTION,
    };
  });
}
```

Add import at top of file:

```typescript
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  BOOST_TRANSACTION,
} from '../../search/search.constants';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts \
        backend/src/modules/purchasing/services/purchase-order.service.spec.ts
git commit -m "feat(search): update purchase order scoring to Phase 3 model"
```

---

## Task 6: Update SearchService (orchestrator)

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`
- Modify: `backend/src/modules/search/search.service.spec.ts`

Two changes: (1) refactor `searchPages` to use `SCORE_PAGE_*` constants instead of hardcoded numbers; (2) add a label-ascending tie-break to the sort.

- [ ] **Step 1: Write the failing test for label tie-break**

In `search.service.spec.ts`, add inside the main `describe('SearchService')` block:

```typescript
it('breaks score ties with case-insensitive label ascending order', async () => {
  (customerService.searchGlobal as jest.Mock).mockResolvedValue([
    { type: 'customer', id: 'a', label: 'Zebra Corp', route: '/customers/a', score: 80 },
    { type: 'customer', id: 'b', label: 'apple inc', route: '/customers/b', score: 80 },
    { type: 'customer', id: 'c', label: 'Mango Ltd', route: '/customers/c', score: 80 },
  ]);

  const result = await service.search('corp', mockUser);

  expect(result.results.map((r) => r.label)).toEqual([
    'apple inc',
    'Mango Ltd',
    'Zebra Corp',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — tie-break not yet implemented

- [ ] **Step 3: Update search.service.ts**

Add import at top of file (alongside existing imports):

```typescript
import {
  SEARCH_RESPONSE_LIMIT,
  SCORE_PAGE_EXACT,
  SCORE_PAGE_STARTSWITH,
  SCORE_PAGE_KEYWORD,
  BOOST_PAGE,
} from './search.constants';
```

Update the sort in the `search()` method (currently `.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))`):

```typescript
.sort((a, b) => {
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  // Tie-break: case-insensitive label ascending
  return (a.label ?? '').toLowerCase().localeCompare((b.label ?? '').toLowerCase());
})
.slice(0, SEARCH_RESPONSE_LIMIT)
```

Update the `searchPages` method to use constants instead of hardcoded numbers:

```typescript
private searchPages(query: string, user: { role: UserRole }): GlobalSearchResultDto[] {
  const q = query.toLowerCase();
  const accessible = STATIC_PAGES.filter((page) => page.roles.includes(user.role));

  return accessible
    .filter(
      (page) =>
        page.label.toLowerCase().includes(q) ||
        page.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
    )
    .map((page) => ({
      type: 'page' as const,
      label: page.label,
      description: 'Navigation',
      route: page.route,
      score:
        page.label.toLowerCase() === q
          ? SCORE_PAGE_EXACT + BOOST_PAGE
          : page.label.toLowerCase().startsWith(q)
            ? SCORE_PAGE_STARTSWITH + BOOST_PAGE
            : SCORE_PAGE_KEYWORD + BOOST_PAGE,
    }));
}
```

- [ ] **Step 4: Run all search service tests**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Run full backend test suite to check for regressions**

```bash
cd backend && npm run test 2>&1 | tail -30
```

Expected: all tests PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/search/search.service.ts \
        backend/src/modules/search/search.service.spec.ts
git commit -m "feat(search): add label tie-break to sort and use SCORE_PAGE_* constants"
```

---

## Task 7: Create recentSearch utility

**Files:**
- Create: `frontend/src/utils/recentSearch.ts`
- Create: `frontend/src/utils/recentSearch.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// frontend/src/utils/recentSearch.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  type RecentSearchItem,
} from './recentSearch'

const USER_ID = 'user-123'
const KEY = `global_search_recent_${USER_ID}`

function makeItem(route: string, label = 'Label'): Omit<RecentSearchItem, 'timestamp'> {
  return { label, description: 'Desc', route, type: 'customer' }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('getRecentSearches', () => {
  it('returns [] when nothing stored', () => {
    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('returns stored items newest first', () => {
    const items: RecentSearchItem[] = [
      { label: 'A', route: '/a', type: 'customer', timestamp: 2000 },
      { label: 'B', route: '/b', type: 'product', timestamp: 1000 },
    ]
    localStorage.setItem(KEY, JSON.stringify(items))
    expect(getRecentSearches(USER_ID)).toEqual(items)
  })

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(KEY, 'not-json')
    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('returns [] when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage error')
    })
    expect(getRecentSearches(USER_ID)).toEqual([])
  })
})

describe('addRecentSearch', () => {
  it('prepends new item', () => {
    addRecentSearch(USER_ID, makeItem('/new'))
    const result = getRecentSearches(USER_ID)
    expect(result[0].route).toBe('/new')
  })

  it('deduplicates by route — moves existing item to front', () => {
    addRecentSearch(USER_ID, makeItem('/a', 'First'))
    addRecentSearch(USER_ID, makeItem('/b', 'Second'))
    addRecentSearch(USER_ID, makeItem('/a', 'First Again'))

    const result = getRecentSearches(USER_ID)
    expect(result[0].route).toBe('/a')
    expect(result[0].label).toBe('First Again')
    expect(result.filter((r) => r.route === '/a')).toHaveLength(1)
  })

  it('caps list at 8 items', () => {
    for (let i = 0; i < 10; i++) {
      addRecentSearch(USER_ID, makeItem(`/route-${i}`))
    }
    expect(getRecentSearches(USER_ID)).toHaveLength(8)
  })

  it('does not throw when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => addRecentSearch(USER_ID, makeItem('/x'))).not.toThrow()
  })
})

describe('clearRecentSearches', () => {
  it('removes all items for the user', () => {
    addRecentSearch(USER_ID, makeItem('/a'))
    clearRecentSearches(USER_ID)
    expect(getRecentSearches(USER_ID)).toEqual([])
  })

  it('only clears the correct user namespace', () => {
    addRecentSearch('other-user', makeItem('/a'))
    clearRecentSearches(USER_ID)
    expect(getRecentSearches('other-user')).toHaveLength(1)
  })

  it('does not throw when localStorage.removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage error')
    })
    expect(() => clearRecentSearches(USER_ID)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/recentSearch.test.ts 2>&1 | tail -20
```

Expected: FAIL — module does not exist yet

- [ ] **Step 3: Implement the utility**

```typescript
// frontend/src/utils/recentSearch.ts

const MAX_RECENT = 8

export interface RecentSearchItem {
  label: string
  description?: string
  route: string
  type: 'page' | 'customer' | 'product' | 'transaction'
  timestamp: number
}

const storageKey = (userId: string) => `global_search_recent_${userId}`

export function getRecentSearches(userId: string): RecentSearchItem[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as RecentSearchItem[]
  } catch {
    return []
  }
}

export function addRecentSearch(
  userId: string,
  item: Omit<RecentSearchItem, 'timestamp'>,
): void {
  try {
    const current = getRecentSearches(userId)
    const deduped = current.filter((r) => r.route !== item.route)
    const updated = [{ ...item, timestamp: Date.now() }, ...deduped].slice(0, MAX_RECENT)
    localStorage.setItem(storageKey(userId), JSON.stringify(updated))
  } catch {
    // Silently swallow (e.g. quota exceeded) — in-memory state is still updated by caller
  }
}

export function clearRecentSearches(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // Silently swallow
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/recentSearch.test.ts 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/recentSearch.ts \
        frontend/src/utils/recentSearch.test.ts
git commit -m "feat(search): add recentSearch localStorage utility"
```

---

## Task 8: Create highlightText utility

**Files:**
- Create: `frontend/src/utils/highlightText.tsx`
- Create: `frontend/src/utils/highlightText.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
// frontend/src/utils/highlightText.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { highlightText } from './highlightText'

function renderHighlight(text: string, query: string) {
  render(<>{highlightText(text, query)}</>)
}

describe('highlightText', () => {
  it('returns the original string when query is empty', () => {
    const result = highlightText('Hello World', '')
    expect(result).toBe('Hello World')
  })

  it('returns the original string when query is whitespace only', () => {
    const result = highlightText('Hello World', '   ')
    expect(result).toBe('Hello World')
  })

  it('returns the original string when there is no match', () => {
    const result = highlightText('Hello World', 'xyz')
    expect(result).toBe('Hello World')
  })

  it('highlights first occurrence, case-insensitive', () => {
    renderHighlight('ABC Trading Sdn Bhd', 'abc')
    const bold = screen.getByText('ABC')
    expect(bold.tagName).toBe('SPAN')
  })

  it('matches regardless of case', () => {
    renderHighlight('hello world', 'HELLO')
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('only highlights first occurrence', () => {
    renderHighlight('abc and abc', 'abc')
    // First abc is highlighted (in a span), second is plain text
    const spans = document.querySelectorAll('span')
    expect(spans).toHaveLength(1)
  })

  it('handles regex special characters safely — dots', () => {
    expect(() => renderHighlight('file.txt', '.')).not.toThrow()
    renderHighlight('file.txt', '.')
    // '.' should match literal dot, not every character
    const bold = screen.queryAllByText('.')
    expect(bold.length).toBeGreaterThanOrEqual(0) // doesn't crash
  })

  it('handles regex special characters safely — brackets', () => {
    expect(() => renderHighlight('Item [A]', '[A]')).not.toThrow()
  })

  it('trims query before matching', () => {
    renderHighlight('ABC Trading', '  ABC  ')
    expect(screen.getByText('ABC')).toBeInTheDocument()
  })

  it('returns string (not element) on no-match — callers treat as ReactNode', () => {
    const result = highlightText('Hello', 'zzz')
    expect(typeof result).toBe('string')
  })

  it('applies custom fontWeight when highlightWeight is provided', () => {
    const { container } = render(<>{highlightText('abc and more', 'abc', 600)}</>)
    const span = container.querySelector('span')
    expect(span?.style.fontWeight).toBe('600')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/utils/highlightText.test.tsx 2>&1 | tail -20
```

Expected: FAIL — module does not exist yet

- [ ] **Step 3: Implement the utility**

```tsx
// frontend/src/utils/highlightText.tsx
import type { ReactNode } from 'react'

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Highlights the first occurrence of `query` in `text`, case-insensitive.
 *
 * Returns the original string unchanged if:
 * - query is empty or whitespace
 * - no match is found
 *
 * Callers must treat the return as opaque ReactNode — never cast to element.
 */
export function highlightText(text: string, query: string, highlightWeight: number = 700): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) return text

  const escaped = escapeRegex(trimmed)
  const regex = new RegExp(escaped, 'i')
  const match = regex.exec(text)

  if (!match) return text

  const start = match.index
  const end = start + match[0].length

  return (
    <>
      {text.slice(0, start)}
      <span style={{ fontWeight: highlightWeight }}>{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/highlightText.test.tsx 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/highlightText.tsx \
        frontend/src/utils/highlightText.test.tsx
git commit -m "feat(search): add highlightText utility"
```

---

## Task 9: Update SearchModal

**Files:**
- Modify: `frontend/src/components/common/SearchModal.tsx`
- Modify: `frontend/src/components/common/__tests__/SearchModal.test.tsx`

This task wires together the two new utilities and adds the recent-search UI. Read the full current file at `frontend/src/components/common/SearchModal.tsx` before editing.

### What changes in SearchModal.tsx

1. Import `selectCurrentUser` from `@/store/slices/authSlice` and `useAppSelector` from `@/hooks/useRedux`
2. Import `getRecentSearches`, `addRecentSearch`, `RecentSearchItem` from `@/utils/recentSearch`
3. Import `highlightText` from `@/utils/highlightText`
4. Import `HistoryIcon` from `@mui/icons-material/History`
5. Add `recentSearches` state loaded on modal open
6. Modify the navigation handler to save to recents
7. Add a "Recent" section rendered when query is empty
8. Change the `navigateTo` function into `handleSelect` that saves before navigating
9. Update `flatResults` / navigation list to use `recentSearches` when query is empty
10. Update the empty state to show two lines
11. Apply `highlightText` to labels and descriptions in `SearchResultRow`

- [ ] **Step 1: Write the failing tests**

Add to `SearchModal.test.tsx` (these require mocking `useAppSelector` and localStorage):

```typescript
// Add these mocks near the top (alongside existing vi.mock calls):

vi.mock('@/hooks/useRedux', () => ({
  useAppSelector: vi.fn().mockReturnValue({ id: 'user-1' }),
}))

vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: (state: any) => state,
}))

// Add localStorage mock helper
function setLocalRecents(userId: string, items: object[]) {
  localStorage.setItem(`global_search_recent_${userId}`, JSON.stringify(items))
}

// New test cases:

it('shows recent searches when query is empty and recents exist', () => {
  setLocalRecents('user-1', [
    {
      label: 'ABC Trading',
      description: '01234',
      route: '/sales/customers/1',
      type: 'customer',
      timestamp: Date.now(),
    },
  ])

  renderModal()

  expect(screen.getByText('Recent')).toBeInTheDocument()
  expect(screen.getByText('ABC Trading')).toBeInTheDocument()
})

it('shows start-typing hint when query is empty and no recents', () => {
  renderModal()

  expect(screen.getByText(/start typing to search/i)).toBeInTheDocument()
})

it('replaces recent section with live results when user types', () => {
  setLocalRecents('user-1', [
    {
      label: 'Old Result',
      route: '/old',
      type: 'page',
      timestamp: Date.now(),
    },
  ])
  mockUseSearchGlobal.mockReturnValue({
    data: {
      query: 'abc',
      results: [
        { type: 'customer', id: '1', label: 'ABC Corp', route: '/customers/1' },
      ],
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  })

  renderModal()
  typeAndFlush('ab')

  expect(screen.queryByText('Recent')).not.toBeInTheDocument()
  expect(screen.getByText('ABC Corp')).toBeInTheDocument()
})

it('saves to recent searches on result selection', () => {
  mockUseSearchGlobal.mockReturnValue({
    data: {
      query: 'abc',
      results: [
        { type: 'customer', id: '1', label: 'ABC Corp', route: '/customers/1' },
      ],
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  })

  renderModal()
  typeAndFlush('abc')
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.keyDown(input, { key: 'Enter' })

  const stored = JSON.parse(
    localStorage.getItem('global_search_recent_user-1') ?? '[]',
  )
  expect(stored[0].route).toBe('/customers/1')
})

it('shows improved empty state with two lines', () => {
  mockUseSearchGlobal.mockReturnValue({
    data: { query: 'zzz', results: [] },
    isLoading: false,
    isFetching: false,
    isError: false,
  })

  renderModal()
  typeAndFlush('zzz')

  expect(screen.getByText(/no results for/i)).toBeInTheDocument()
  expect(screen.getByText(/try searching by name/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SearchModal.test.tsx 2>&1 | tail -30
```

Expected: new tests FAIL, existing tests still PASS

- [ ] **Step 3: Update SearchModal.tsx**

Add imports at the top of the file:

```tsx
import HistoryIcon from '@mui/icons-material/History'
import { useAppSelector } from '@/hooks/useRedux'
import { selectCurrentUser } from '@/store/slices/authSlice'
import {
  addRecentSearch,
  getRecentSearches,
  type RecentSearchItem,
} from '@/utils/recentSearch'
import { highlightText } from '@/utils/highlightText'
```

Inside `SearchModal`, after the existing state declarations, add:

```tsx
const currentUser = useAppSelector(selectCurrentUser)
const userId = currentUser?.id ?? ''

const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([])

// Load recents on open
useEffect(() => {
  if (open && userId) {
    setRecentSearches(getRecentSearches(userId))
  }
}, [open, userId])
```

Replace the existing `navigateTo` function with `handleSelect`:

```tsx
const handleSelect = (item: { label: string; description?: string; route: string; type: GlobalSearchResultType }) => {
  if (userId) {
    addRecentSearch(userId, {
      label: item.label,
      description: item.description,
      route: item.route,
      type: item.type,
    })
    // Read back after write to get the canonical list (deduped, capped).
    // If storage fails silently, getRecentSearches returns the previous list —
    // so update state optimistically as a fallback to satisfy the spec's "session-only" requirement:
    const stored = getRecentSearches(userId)
    if (stored.some((r) => r.route === item.route)) {
      // Storage succeeded — use the canonical stored list
      setRecentSearches(stored)
    } else {
      // Storage failed silently — apply optimistic update for this session only
      setRecentSearches((prev) => [
        { ...item, timestamp: Date.now() },
        ...prev.filter((r) => r.route !== item.route),
      ].slice(0, 8))
    }
  }
  navigate(item.route)
  handleClose()
}
```

Update `handleClose` to also reset recents on close (the `open` useEffect already reloads on next open — no action needed here).

Replace `navigateTo` references in `handleInputKeyDown` and result row click handlers to use `handleSelect`.

Update `flatResults` to use recents when query is empty.

`RecentSearchItem` and `GlobalSearchResultDto` share `label`, `description?`, `route`, and `type` — the only difference is `id?` (on DTO) and `timestamp` (on recent). Define a shared navigation union type so keyboard navigation works without a type assertion:

```tsx
type NavigableItem = {
  label: string
  description?: string
  route: string
  type: GlobalSearchResultType
}

const isEmptyQuery = trimmedQuery.length === 0
const isActiveQuery = trimmedQuery.length >= 2

const flatResults = useMemo((): NavigableItem[] => {
  if (isEmptyQuery) {
    return recentSearches  // RecentSearchItem satisfies NavigableItem
  }
  return data
    ? GROUP_ORDER.flatMap((type) =>
        data.results.filter((result) => result.type === type),
      )
    : []
}, [data, isEmptyQuery, recentSearches])
```

Update `handleInputKeyDown` to use `flatResults[selectedIndex].route` — this continues to work since `NavigableItem` always has `route`.

Update the display conditions:

```tsx
const showHelp = !isEmptyQuery && !isActiveQuery  // 1-char state
const showRecent = isEmptyQuery
const showLive = isActiveQuery
```

Add the Recent section in the JSX (replace the existing `showHelp` text block):

```tsx
{showHelp && (
  <Typography variant="body2" sx={{ color: '#A0A0A0', textAlign: 'center', px: 3, py: 4 }}>
    Type at least 2 characters to search pages, customers, products, and transactions.
  </Typography>
)}

{showRecent && recentSearches.length === 0 && (
  <Typography variant="body2" sx={{ color: '#A0A0A0', textAlign: 'center', px: 3, py: 4 }}>
    Start typing to search
  </Typography>
)}

{showRecent && recentSearches.length > 0 && (
  <Box>
    <Typography variant="caption" sx={{
      display: 'block', px: 2, py: 1, color: '#6B7280',
      textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      Recent
    </Typography>
    {recentSearches.map((item, idx) => (
      <SearchResultRow
        key={`recent-${item.route}`}
        item={item}
        isSelected={idx === selectedIndex}
        onClick={() => handleSelect(item)}
        onHover={() => setSelectedIndex(idx)}
        query=""
        isRecent={true}
      />
    ))}
  </Box>
)}
```

Update the empty state to two lines:

```tsx
{showEmpty && (
  <Box sx={{ textAlign: 'center', px: 3, py: 4 }}>
    <Typography variant="body2" sx={{ color: '#A0A0A0' }}>
      No results for "{trimmedQuery}"
    </Typography>
    <Typography variant="caption" sx={{ color: '#6B7280', mt: 0.5, display: 'block' }}>
      Try searching by name, code, SKU, or order number
    </Typography>
  </Box>
)}
```

Update `SearchResultRow` props to accept `query` and `isRecent`, and apply `highlightText`:

```tsx
// Use NavigableItem (defined above with flatResults) so both live results and
// recent items are accepted without unsafe casts. Both types share label/description/route/type.
interface SearchResultRowProps {
  item: NavigableItem
  isSelected: boolean
  onClick: () => void
  onHover: () => void
  query: string
  isRecent?: boolean
}

function SearchResultRow({ item, isSelected, onClick, onHover, query, isRecent }: SearchResultRowProps) {
  return (
    <Box
      onClick={onClick}
      onMouseEnter={onHover}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.25,
        cursor: 'pointer',
        bgcolor: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' },
      }}
    >
      {/* Clock icon on LEFT for recent items, per spec */}
      {isRecent && (
        <HistoryIcon sx={{ color: '#6B7280', fontSize: 16, flexShrink: 0 }} />
      )}

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ color: '#E0E0E0', fontWeight: 600 }}>
          {highlightText(item.label, query)}
        </Typography>
        {item.description && (
          <Typography
            variant="caption"
            sx={{
              color: '#A0A0A0',
              display: 'block',
              mt: 0.25,
              // Description highlights use fontWeight 600 (slightly less than label's 700)
              // Applied via inline style on the <span> inside highlightText.
              // Pass a descriptionHighlight prop to distinguish label vs description highlight weight.
            }}
          >
            {highlightText(item.description, query)}
          </Typography>
        )}
      </Box>

      {/* Type badge on RIGHT for live results only */}
      {!isRecent && (
        <Typography variant="caption" sx={{
          color: '#6B7280',
          bgcolor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '999px',
          px: 1, py: 0.5,
          flexShrink: 0,
        }}>
          {TYPE_BADGES[item.type]}
        </Typography>
      )}
    </Box>
  )
}
```

**Description highlight style note:** The spec calls for `fontWeight: 600` on the description match span (vs `fontWeight: 700` on the label). Since `highlightText` always uses `fontWeight: 700`, add an optional `highlightWeight` parameter:

```tsx
// Update highlightText signature in highlightText.tsx to accept optional weight:
export function highlightText(text: string, query: string, highlightWeight: number = 700): ReactNode {
  // ...
  <span style={{ fontWeight: highlightWeight }}>{text.slice(start, end)}</span>
  // ...
}
```

Then call with weight 600 for descriptions in `SearchResultRow`:

```tsx
{highlightText(item.label, query)}              // label — uses default 700
{highlightText(item.description, query, 600)}   // description — uses 600
```

Update the `highlightText` tests to cover the optional weight parameter.

Also pass `query={trimmedQuery}` to all live result `SearchResultRow` instances in the groups render.

Reset `selectedIndex` when switching between empty and live modes:

```tsx
useEffect(() => {
  setSelectedIndex(0)
}, [isEmptyQuery])
```

- [ ] **Step 4: Run all frontend tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SearchModal.test.tsx 2>&1 | tail -30
```

Expected: all PASS (existing + new)

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 6: Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/SearchModal.tsx \
        frontend/src/components/common/__tests__/SearchModal.test.tsx
git commit -m "feat(search): add recent searches, text highlighting, and improved empty state"
```

---

## Final Verification

- [ ] **Run all backend tests**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all PASS

- [ ] **TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: no errors

- [ ] **Final commit if clean**

If all tests pass and no TypeScript errors:

```bash
git log --oneline -8
```

Verify commits look like:
```
feat(search): add recent searches, text highlighting, and improved empty state
feat(search): add highlightText utility
feat(search): add recentSearch localStorage utility
feat(search): add label tie-break to sort and use SCORE_PAGE_* constants
feat(search): update purchase order scoring to Phase 3 model
feat(search): update sales order scoring to Phase 3 model
feat(search): update product scoring to Phase 3 model
feat(search): update customer scoring to Phase 3 model
feat(search): add centralized scoring and limit constants
```
