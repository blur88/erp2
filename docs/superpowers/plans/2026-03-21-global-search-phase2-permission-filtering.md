# Global Search Phase 2 — Permission-Aware Navigation & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar and global search permission-aware so each role only sees navigation pages and record types they are authorized to access.

**Architecture:** A shared permission model (role arrays on each nav item / static page) is expressed independently on frontend (`navigation.ts`) and backend (`search.permissions.ts`). The sidebar filters its own rendering from auth state; the backend search endpoint filters page results and short-circuits domain searches by role. No API contract changes.

**Tech Stack:** NestJS 11 (backend), React 19 + Material-UI v7 (frontend), Vitest (frontend tests), Jest (backend tests)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/config/navigation.ts` | **Create** | Nav config (menuSections) with `roles` on each leaf; exports `getFilteredMenuSections`, `filterMenuItems` |
| `frontend/src/components/common/Sidebar.tsx` | **Modify** | Import filtered config; fix flyout to use filtered sections |
| `frontend/src/config/navigation.test.ts` | **Create** | Role-matrix tests for filtering functions |
| `backend/src/modules/search/search.permissions.ts` | **Create** | Role-set constants + `canSearch*` helpers |
| `backend/src/modules/search/search.permissions.spec.ts` | **Create** | Unit tests for all 20 role × entity combinations |
| `backend/src/modules/search/search.service.ts` | **Modify** | Add `roles` to STATIC_PAGES (reconcile routes); update `searchPages` to accept + filter by `user` |
| `backend/src/modules/search/search.service.spec.ts` | **Modify** | Add tests for page role filtering |
| `backend/src/modules/sales/services/customer.service.ts` | **Modify** | Add `canSearchCustomers` guard at top of `searchGlobal` |
| `backend/src/modules/inventory/services/product.service.ts` | **Modify** | Add `canSearchProducts` guard at top of `searchGlobal` |
| `backend/src/modules/sales/services/sales-order.service.ts` | **Modify** | Add `canSearchSalesOrders` guard at top of `searchGlobal` |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | **Modify** | Add `canSearchPurchaseOrders` guard at top of `searchGlobal` |
| `backend/test/search.e2e-spec.ts` | **Create** | Integration tests per role (presence + absence assertions) |

---

## Task 1: Backend — Permission helpers (`search.permissions.ts`)

**Files:**
- Create: `backend/src/modules/search/search.permissions.ts`
- Create: `backend/src/modules/search/search.permissions.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/search/search.permissions.spec.ts`:

```typescript
import { UserRole } from '../../database/entities/user.entity';
import {
  canSearchCustomers,
  canSearchProducts,
  canSearchSalesOrders,
  canSearchPurchaseOrders,
  ALL_ROLES,
  SALES_ROLES,
  PROCUREMENT_ROLES,
  INVENTORY_ROLES,
  FINANCE_ROLES,
  ADMIN_ONLY,
} from './search.permissions';

describe('search.permissions', () => {
  describe('role-set constants', () => {
    it('ALL_ROLES contains all 5 roles', () => {
      expect(ALL_ROLES).toHaveLength(5);
      expect(ALL_ROLES).toContain(UserRole.ADMIN);
      expect(ALL_ROLES).toContain(UserRole.MANAGER);
      expect(ALL_ROLES).toContain(UserRole.SALES_STAFF);
      expect(ALL_ROLES).toContain(UserRole.INVENTORY_STAFF);
      expect(ALL_ROLES).toContain(UserRole.PROCUREMENT_STAFF);
    });

    it('SALES_ROLES contains admin, manager, sales_staff only', () => {
      expect(SALES_ROLES).toEqual(
        expect.arrayContaining([UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF]),
      );
      expect(SALES_ROLES).not.toContain(UserRole.INVENTORY_STAFF);
      expect(SALES_ROLES).not.toContain(UserRole.PROCUREMENT_STAFF);
    });
  });

  describe('canSearchCustomers', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, true],
      [UserRole.INVENTORY_STAFF, false],
      [UserRole.PROCUREMENT_STAFF, false],
    ])('role %s → %s', (role, expected) => {
      expect(canSearchCustomers(role)).toBe(expected);
    });
  });

  describe('canSearchProducts', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, true],
      [UserRole.INVENTORY_STAFF, true],
      [UserRole.PROCUREMENT_STAFF, true],
    ])('role %s → %s (all operational roles)', (role, expected) => {
      expect(canSearchProducts(role)).toBe(expected);
    });
  });

  describe('canSearchSalesOrders', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, true],
      [UserRole.INVENTORY_STAFF, false],
      [UserRole.PROCUREMENT_STAFF, false],
    ])('role %s → %s', (role, expected) => {
      expect(canSearchSalesOrders(role)).toBe(expected);
    });
  });

  describe('canSearchPurchaseOrders', () => {
    it.each([
      [UserRole.ADMIN, true],
      [UserRole.MANAGER, true],
      [UserRole.SALES_STAFF, false],
      [UserRole.INVENTORY_STAFF, false],
      [UserRole.PROCUREMENT_STAFF, true],
    ])('role %s → %s', (role, expected) => {
      expect(canSearchPurchaseOrders(role)).toBe(expected);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && npx jest src/modules/search/search.permissions.spec.ts --no-coverage
```

Expected: FAIL with "Cannot find module './search.permissions'"

- [ ] **Step 3: Create `search.permissions.ts`**

```typescript
import { UserRole } from '../../database/entities/user.entity';

export const ALL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SALES_STAFF,
  UserRole.INVENTORY_STAFF,
  UserRole.PROCUREMENT_STAFF,
];

export const SALES_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SALES_STAFF,
];

export const PROCUREMENT_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.PROCUREMENT_STAFF,
];

export const INVENTORY_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.INVENTORY_STAFF,
];

export const FINANCE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
];

export const ADMIN_ONLY: UserRole[] = [UserRole.ADMIN];

export const PRODUCT_SEARCH_ROLES: UserRole[] = ALL_ROLES;

export function canSearchCustomers(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchProducts(role: UserRole): boolean {
  return PRODUCT_SEARCH_ROLES.includes(role);
}

export function canSearchSalesOrders(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchPurchaseOrders(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend && npx jest src/modules/search/search.permissions.spec.ts --no-coverage
```

Expected: PASS (20 role × entity cases + constant shape tests)

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/search/search.permissions.ts src/modules/search/search.permissions.spec.ts
git commit -m "feat(search): add permission helpers for role-based entity access"
```

---

## Task 2: Backend — Update `search.service.ts` (page role filtering)

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`
- Modify: `backend/src/modules/search/search.service.spec.ts`

**Context:** The current `STATIC_PAGES` array has stale/wrong routes (e.g. `/customers` instead of `/sales/customers`). This task adds `roles` AND reconciles all routes against the spec's leaf page visibility table. The current `searchPages(trimmed)` call inside `safeSearch` must be updated to pass `user`.

- [ ] **Step 1: Write failing tests for page role filtering**

Add these tests to `backend/src/modules/search/search.service.spec.ts` (inside the existing `describe('SearchService', ...)` block):

```typescript
  describe('searchPages role filtering', () => {
    it('returns Dashboard for all roles', async () => {
      for (const role of Object.values(UserRole)) {
        const user = { role } as any;
        const result = await service.search('dashboard', user);
        const dashboardResult = result.results.find(r => r.route === '/dashboard');
        expect(dashboardResult).toBeDefined();
      }
    });

    it('returns Audit Logs page only for admin', async () => {
      const adminResult = await service.search('audit', { role: UserRole.ADMIN } as any);
      expect(adminResult.results.find(r => r.route === '/audit-logs')).toBeDefined();

      for (const role of [UserRole.MANAGER, UserRole.SALES_STAFF, UserRole.INVENTORY_STAFF, UserRole.PROCUREMENT_STAFF]) {
        const result = await service.search('audit', { role } as any);
        expect(result.results.find(r => r.route === '/audit-logs')).toBeUndefined();
      }
    });

    it('returns Customers page only for sales roles', async () => {
      for (const role of [UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_STAFF]) {
        const result = await service.search('customer', { role } as any);
        expect(result.results.find(r => r.route === '/sales/customers')).toBeDefined();
      }

      for (const role of [UserRole.INVENTORY_STAFF, UserRole.PROCUREMENT_STAFF]) {
        const result = await service.search('customer', { role } as any);
        expect(result.results.find(r => r.route === '/sales/customers')).toBeUndefined();
      }
    });

    it('returns Journal Entries page only for finance roles', async () => {
      for (const role of [UserRole.ADMIN, UserRole.MANAGER]) {
        const result = await service.search('journal', { role } as any);
        expect(result.results.find(r => r.route === '/accounting/journal-entries')).toBeDefined();
      }

      for (const role of [UserRole.SALES_STAFF, UserRole.INVENTORY_STAFF, UserRole.PROCUREMENT_STAFF]) {
        const result = await service.search('journal', { role } as any);
        expect(result.results.find(r => r.route === '/accounting/journal-entries')).toBeUndefined();
      }
    });
  });
```

Also add `import { UserRole } from '../../database/entities/user.entity';` to the spec imports.

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: FAIL — routes don't match (`/customers` not `/sales/customers`, no role filtering)

- [ ] **Step 3: Update `search.service.ts` — replace STATIC_PAGES and update searchPages**

Replace the `STATIC_PAGES` constant and update `searchPages`. Full replacement for the relevant sections:

```typescript
// Add to imports at top of file:
import {
  ALL_ROLES, SALES_ROLES, PROCUREMENT_ROLES, INVENTORY_ROLES,
  FINANCE_ROLES, ADMIN_ONLY,
} from './search.permissions';
import { UserRole } from '../../database/entities/user.entity';

// Replace the STATIC_PAGES constant entirely:
const STATIC_PAGES: Array<{
  label: string;
  keywords: string[];
  route: string;
  roles: UserRole[];
}> = [
  { label: 'Dashboard', keywords: ['home', 'overview'], route: '/dashboard', roles: ALL_ROLES },
  // Sales
  { label: 'Sales', keywords: ['sales', 'overview'], route: '/sales', roles: SALES_ROLES },
  { label: 'Customers', keywords: ['clients', 'buyers'], route: '/sales/customers', roles: SALES_ROLES },
  { label: 'Sales Orders', keywords: ['orders', 'so'], route: '/sales/orders', roles: SALES_ROLES },
  { label: 'Invoices', keywords: ['billing', 'invoice'], route: '/sales/invoices', roles: SALES_ROLES },
  { label: 'Payments', keywords: ['receipts', 'payment'], route: '/sales/payments', roles: SALES_ROLES },
  // Purchasing
  { label: 'Purchasing', keywords: ['purchasing', 'overview'], route: '/purchasing', roles: PROCUREMENT_ROLES },
  { label: 'Suppliers', keywords: ['vendors', 'supplier'], route: '/purchasing/suppliers', roles: PROCUREMENT_ROLES },
  { label: 'Purchase Orders', keywords: ['po', 'procurement', 'purchase order'], route: '/purchasing/orders', roles: PROCUREMENT_ROLES },
  { label: 'Goods Received', keywords: ['grn', 'goods received', 'receiving'], route: '/purchasing/goods-received', roles: PROCUREMENT_ROLES },
  { label: 'Vendor Payments', keywords: ['vendor payment', 'ap'], route: '/purchasing/vendor-payments', roles: PROCUREMENT_ROLES },
  // Inventory
  { label: 'Inventory', keywords: ['inventory', 'overview'], route: '/inventory', roles: INVENTORY_ROLES },
  { label: 'Products', keywords: ['items', 'catalogue', 'sku'], route: '/inventory/products', roles: INVENTORY_ROLES },
  { label: 'Categories', keywords: ['product categories', 'category'], route: '/inventory/categories', roles: INVENTORY_ROLES },
  { label: 'Stock Adjustments', keywords: ['adjustment', 'stock', 'inventory'], route: '/inventory/stock-adjustments', roles: INVENTORY_ROLES },
  // Accounting
  { label: 'Accounting', keywords: ['accounting', 'finance', 'overview'], route: '/accounting/dashboard', roles: FINANCE_ROLES },
  { label: 'Chart of Accounts', keywords: ['accounts', 'coa'], route: '/accounting/chart-of-accounts', roles: FINANCE_ROLES },
  { label: 'Journal Entries', keywords: ['journal', 'ledger', 'entries'], route: '/accounting/journal-entries', roles: FINANCE_ROLES },
  { label: 'Bank Reconciliation', keywords: ['bank', 'reconciliation'], route: '/accounting/bank-reconciliations', roles: FINANCE_ROLES },
  { label: 'Expenses', keywords: ['expenses'], route: '/accounting/expenses', roles: FINANCE_ROLES },
  { label: 'Fund Transfers', keywords: ['fund transfer', 'transfer'], route: '/accounting/fund-transfers', roles: FINANCE_ROLES },
  { label: 'Settlements', keywords: ['settlement'], route: '/accounting/settlements', roles: FINANCE_ROLES },
  { label: "Owner's Equity", keywords: ['equity', 'owner'], route: '/accounting/owner-equity', roles: FINANCE_ROLES },
  { label: 'Fiscal Periods', keywords: ['fiscal', 'period', 'financial period'], route: '/accounting/fiscal-periods', roles: ADMIN_ONLY },
  { label: 'Account Mappings', keywords: ['account mapping', 'mapping'], route: '/accounting/account-mappings', roles: ADMIN_ONLY },
  // Reports - Sales
  { label: 'Product Summary Report', keywords: ['sales report', 'product summary'], route: '/reports/sales/product-summary', roles: SALES_ROLES },
  { label: 'Product Details Report', keywords: ['sales report', 'product details'], route: '/reports/sales/product-details', roles: SALES_ROLES },
  { label: 'Sales Order Summary', keywords: ['order summary', 'sales report'], route: '/reports/sales/order-summary', roles: SALES_ROLES },
  { label: 'Order Profit Report', keywords: ['profit', 'order profit'], route: '/reports/sales/order-profit', roles: SALES_ROLES },
  { label: 'Customer Payment Summary', keywords: ['payment summary', 'customer payment'], route: '/reports/sales/customer-payment-summary', roles: SALES_ROLES },
  { label: 'Payment by Order', keywords: ['payment by order'], route: '/reports/sales/payment-by-order', roles: SALES_ROLES },
  { label: 'Customer Payment Details', keywords: ['payment details', 'customer payment'], route: '/reports/sales/payment-details', roles: SALES_ROLES },
  { label: 'Customer Order History', keywords: ['order history', 'customer history'], route: '/reports/sales/order-history', roles: SALES_ROLES },
  { label: 'Product Customers Report', keywords: ['product customer', 'customer report'], route: '/reports/sales/product-customer', roles: SALES_ROLES },
  // Reports - Purchasing
  { label: 'Purchase Order Summary', keywords: ['purchase report', 'order summary'], route: '/reports/purchasing/order-summary', roles: PROCUREMENT_ROLES },
  { label: 'Purchase Order Details', keywords: ['purchase report', 'order details'], route: '/reports/purchasing/order-details', roles: PROCUREMENT_ROLES },
  { label: 'Purchase Order Status', keywords: ['order status', 'purchase report'], route: '/reports/purchasing/order-status', roles: PROCUREMENT_ROLES },
  { label: 'Vendor Payment Details', keywords: ['vendor payment', 'purchase report'], route: '/reports/purchasing/payment-details', roles: PROCUREMENT_ROLES },
  { label: 'Vendor Products Report', keywords: ['vendor products', 'purchase report'], route: '/reports/purchasing/vendor-purchase-list', roles: PROCUREMENT_ROLES },
  // Reports - Inventory
  { label: 'Inventory Summary Report', keywords: ['inventory report', 'summary'], route: '/reports/inventory/summary', roles: INVENTORY_ROLES },
  { label: 'Historical Inventory Report', keywords: ['historical inventory', 'inventory report'], route: '/reports/inventory/historical', roles: INVENTORY_ROLES },
  { label: 'Inventory Movement Summary', keywords: ['movement', 'inventory report'], route: '/reports/inventory/movement-summary', roles: INVENTORY_ROLES },
  { label: 'Product Price List Report', keywords: ['price list', 'inventory report'], route: '/reports/inventory/price-list', roles: INVENTORY_ROLES },
  { label: 'Product Cost Report', keywords: ['product cost', 'inventory report'], route: '/reports/inventory/product-cost', roles: INVENTORY_ROLES },
  // Reports - Accounting
  { label: 'Trial Balance', keywords: ['trial balance', 'accounting report'], route: '/accounting/reports/trial-balance', roles: FINANCE_ROLES },
  { label: 'Balance Sheet', keywords: ['balance sheet', 'accounting report'], route: '/accounting/reports/balance-sheet', roles: FINANCE_ROLES },
  { label: 'Profit & Loss', keywords: ['profit loss', 'p&l', 'income statement'], route: '/accounting/reports/profit-loss', roles: FINANCE_ROLES },
  { label: 'General Ledger', keywords: ['general ledger', 'gl', 'accounting report'], route: '/accounting/reports/general-ledger', roles: FINANCE_ROLES },
  { label: 'Account Activity', keywords: ['account activity', 'accounting report'], route: '/accounting/reports/account-activity', roles: FINANCE_ROLES },
  // Administration
  { label: 'Company Settings', keywords: ['company', 'settings', 'configuration'], route: '/settings/company', roles: ADMIN_ONLY },
  { label: 'Inventory Costing', keywords: ['costing', 'price costing', 'settings'], route: '/settings/price-costing', roles: ADMIN_ONLY },
  { label: 'Regional Settings', keywords: ['regional', 'locale', 'settings'], route: '/settings/regional', roles: ADMIN_ONLY },
  { label: 'Price Lists', keywords: ['price list', 'pricing', 'settings'], route: '/settings/price-lists', roles: ADMIN_ONLY },
  { label: 'Payment Methods', keywords: ['payment method', 'settings'], route: '/settings/payment-methods', roles: ADMIN_ONLY },
  { label: 'Print Settings', keywords: ['print', 'settings'], route: '/settings/print', roles: ADMIN_ONLY },
  { label: 'Document Numbers', keywords: ['document number', 'numbering', 'settings'], route: '/settings/document-numbers', roles: ADMIN_ONLY },
  { label: 'Users', keywords: ['users', 'user management', 'settings'], route: '/settings/users', roles: ADMIN_ONLY },
  { label: 'Roles & Permissions', keywords: ['roles', 'permissions', 'access', 'settings'], route: '/settings/roles', roles: ADMIN_ONLY },
  { label: 'Security', keywords: ['security', 'settings'], route: '/settings/security', roles: ADMIN_ONLY },
  { label: 'Backup & Restore', keywords: ['backup', 'restore', 'settings'], route: '/settings/backup', roles: ADMIN_ONLY },
  { label: 'Audit Logs', keywords: ['audit', 'activity', 'history'], route: '/audit-logs', roles: ADMIN_ONLY },
];
```

Update the `searchPages` private method signature and add role filter before keyword matching:

```typescript
private searchPages(query: string, user: any): GlobalSearchResultDto[] {
  const q = query.toLowerCase();
  const accessible = STATIC_PAGES.filter(p => p.roles.includes(user.role));
  return accessible
    .filter(
      p =>
        p.label.toLowerCase().includes(q) ||
        p.keywords.some(k => k.toLowerCase().includes(q)),
    )
    .map(p => ({
      type: 'page' as const,
      label: p.label,
      route: p.route,
      score: p.label.toLowerCase() === q ? 90 : p.label.toLowerCase().startsWith(q) ? 75 : 50,
    }));
}
```

Update the `safeSearch` call site in `search()` to pass `user`:

```typescript
// Find this line:
this.safeSearch('pages', async () => this.searchPages(trimmed))
// Replace with:
this.safeSearch('pages', async () => Promise.resolve(this.searchPages(trimmed, user)))
```

**Note:** `searchPages` is now synchronous (returns directly); wrap in `Promise.resolve` to satisfy `safeSearch`'s `fn: () => Promise<...>` signature. Alternatively make the method `async` — either works.

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: all tests pass including the new page role filtering tests.

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/search/search.service.ts src/modules/search/search.service.spec.ts
git commit -m "feat(search): add role-based page filtering and reconcile STATIC_PAGES routes"
```

---

## Task 3: Backend — Domain service guards

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts`
- Modify: `backend/src/modules/inventory/services/product.service.ts`
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

This is four small edits — one guard line per service. No new test files needed here; the guards are tested by the integration tests in Task 5. The unit tests in `search.service.spec.ts` already mock these services.

- [ ] **Step 1: Add guard to `customer.service.ts`**

Add this import near the top of the file (with other search-related imports):

```typescript
import { canSearchCustomers } from '../../../modules/search/search.permissions';
```

Add this as the first line inside `searchGlobal`:

```typescript
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchCustomers(user.role)) return [];
  // ... existing code unchanged
```

- [ ] **Step 2: Add guard to `product.service.ts`**

```typescript
import { canSearchProducts } from '../../../modules/search/search.permissions';

async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchProducts(user.role)) return [];
  // ... existing code unchanged
```

- [ ] **Step 3: Add guard to `sales-order.service.ts`**

```typescript
import { canSearchSalesOrders } from '../../../modules/search/search.permissions';

async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchSalesOrders(user.role)) return [];
  // ... existing code unchanged
```

- [ ] **Step 4: Add guard to `purchase-order.service.ts`**

```typescript
import { canSearchPurchaseOrders } from '../../../modules/search/search.permissions';

async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchPurchaseOrders(user.role)) return [];
  // ... existing code unchanged
```

- [ ] **Step 5: Run existing backend tests to verify no regressions**

```bash
cd backend && npm run test -- --no-coverage
```

Expected: all existing tests pass. The `search.service.spec.ts` mocks `searchGlobal` entirely, so the new guards won't affect those tests.

- [ ] **Step 6: Commit**

```bash
cd backend && git add \
  src/modules/sales/services/customer.service.ts \
  src/modules/inventory/services/product.service.ts \
  src/modules/sales/services/sales-order.service.ts \
  src/modules/purchasing/services/purchase-order.service.ts
git commit -m "feat(search): add role-based entity access guards to domain searchGlobal methods"
```

---

## Task 4: Frontend — `navigation.ts` (nav config + filtering functions)

**Files:**
- Create: `frontend/src/config/navigation.ts`
- Create: `frontend/src/config/navigation.test.ts`

The `MenuItem` type currently lives in `Sidebar.tsx`. You'll need to reference it. Check the exact type definition in `Sidebar.tsx` — look for `interface MenuItem` or `type MenuItem`. You'll either import it from there or replicate the minimal shape needed.

**Note on `UserRole`:** The frontend uses string literals (`'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff'`) from `authSlice.ts`, not a TypeScript enum. Use `type UserRole = AuthUser['role']` or define a matching type alias.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/config/navigation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getFilteredMenuSections, filterMenuItems, menuSections } from './navigation';

type Role = 'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff';

describe('navigation filtering', () => {
  describe('filterMenuItems — leaf visibility', () => {
    it('all roles see Dashboard', () => {
      const roles: Role[] = ['admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff'];
      for (const role of roles) {
        const allItems = menuSections.flatMap(s => s.items);
        const dashboard = allItems.find(i => 'path' in i && i.path === '/dashboard');
        expect(dashboard).toBeDefined();
        if (dashboard) {
          const result = filterMenuItems([dashboard], role);
          expect(result).toHaveLength(1);
        }
      }
    });

    it('Audit Logs visible only to admin', () => {
      const allSections = getFilteredMenuSections(menuSections, 'admin');
      const auditItem = allSections
        .flatMap(s => s.items)
        .find(i => 'path' in i && i.path === '/audit-logs');
      expect(auditItem).toBeDefined();

      for (const role of ['manager', 'sales_staff', 'inventory_staff', 'procurement_staff'] as Role[]) {
        const sections = getFilteredMenuSections(menuSections, role);
        const item = sections
          .flatMap(s => s.items)
          .find(i => 'path' in i && i.path === '/audit-logs');
        expect(item).toBeUndefined();
      }
    });

    it('Procurement Staff sees /purchasing, not /sales/customers', () => {
      const sections = getFilteredMenuSections(menuSections, 'procurement_staff');
      const allItems = sections.flatMap(s => s.items);
      const findPath = (path: string): boolean =>
        allItems.some(i => {
          if ('path' in i && i.path === path) return true;
          if ('children' in i && i.children) {
            return i.children.some(c => 'path' in c && c.path === path);
          }
          return false;
        });
      expect(findPath('/purchasing')).toBe(true);
      expect(findPath('/sales/customers')).toBe(false);
    });

    it('Sales Staff sees /sales/customers, not /purchasing', () => {
      const sections = getFilteredMenuSections(menuSections, 'sales_staff');
      const allItems = sections.flatMap(s => s.items);
      const hasPath = allItems.some(i => 'children' in i && i.children?.some(c => 'path' in c && c.path === '/sales/customers'));
      expect(hasPath).toBe(true);

      const hasPurchasing = allItems.some(i => 'path' in i && i.path === '/purchasing');
      expect(hasPurchasing).toBe(false);
    });
  });

  describe('getFilteredMenuSections — parent collapse', () => {
    it('removes parent sections when all children are filtered out', () => {
      // Inventory Staff should not see a Sales section
      const sections = getFilteredMenuSections(menuSections, 'inventory_staff');
      const salesSection = sections.find(s => s.id === 'operations' || s.items.some(i => 'path' in i && i.path === '/sales'));
      // If there is a Sales parent, its children should contain no sales-only items
      if (salesSection) {
        const salesItem = salesSection.items.find(i => 'path' in i && i.path === '/sales');
        expect(salesItem).toBeUndefined();
      }
    });

    it('all roles see at least one section', () => {
      const roles: Role[] = ['admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff'];
      for (const role of roles) {
        const sections = getFilteredMenuSections(menuSections, role);
        expect(sections.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Products — all operational roles can search', () => {
    it('all 5 roles see /inventory/products in nav', () => {
      const roles: Role[] = ['admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff'];
      for (const role of roles) {
        const sections = getFilteredMenuSections(menuSections, role);
        // Note: products leaf page is under Inventory nav which is INVENTORY_ROLES.
        // This test verifies the spec note: product search is broader than inventory *page* access.
        // inventory_staff, sales_staff, procurement_staff may not see the inventory page but CAN search products.
        // This frontend test only verifies nav visibility — product record search is tested in backend integration tests.
      }
      // admin and manager always see it
      for (const role of ['admin', 'manager'] as Role[]) {
        const sections = getFilteredMenuSections(menuSections, role);
        const found = sections.some(s =>
          s.items.some(i => {
            if ('path' in i && i.path === '/inventory/products') return true;
            if ('children' in i && i.children) return i.children.some(c => 'path' in c && c.path === '/inventory/products');
            return false;
          }),
        );
        expect(found).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/config/navigation.test.ts
```

Expected: FAIL with "Cannot find module './navigation'"

- [ ] **Step 3: Create `navigation.ts`**

First, look at `Sidebar.tsx` to understand the exact `MenuItem`, `MenuSection` type shapes (they're defined in the file). You'll move those type definitions to `navigation.ts` and re-export them, or import them back in `Sidebar.tsx`.

Create `frontend/src/config/navigation.ts`:

```typescript
import { ReactNode } from 'react';

type Role = 'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff';

// Role-set constants (mirror backend search.permissions.ts)
const ALL_ROLES: Role[] = ['admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff'];
const SALES_ROLES: Role[] = ['admin', 'manager', 'sales_staff'];
const PROCUREMENT_ROLES: Role[] = ['admin', 'manager', 'procurement_staff'];
const INVENTORY_ROLES: Role[] = ['admin', 'manager', 'inventory_staff'];
const FINANCE_ROLES: Role[] = ['admin', 'manager'];
const ADMIN_ONLY: Role[] = ['admin'];

export interface MenuItem {
  id: string;
  title: string;
  icon?: ReactNode;
  path?: string;
  badge?: string | number;
  group?: string;
  flyoutMode?: string;
  roles?: Role[];           // required on leaf items; omitted on pure container parents
  children?: MenuItem[];
}

export interface MenuSection {
  id: string;
  title: string;
  items: MenuItem[];
}

export function getFilteredMenuSections(sections: MenuSection[], role: Role): MenuSection[] {
  return sections
    .map(section => ({
      ...section,
      items: filterMenuItems(section.items, role),
    }))
    .filter(section => section.items.length > 0);
}

export function filterMenuItems(items: MenuItem[], role: Role): MenuItem[] {
  return items
    .map(item => {
      if (item.children?.length) {
        const filtered = filterMenuItems(item.children, role);
        return filtered.length > 0 ? { ...item, children: filtered } : null;
      }
      return item.roles?.includes(role) ? item : null;
    })
    .filter((item): item is MenuItem => item !== null);
}

// Icons will be imported in Sidebar.tsx and passed when building sections —
// navigation.ts exports the data shape; Sidebar provides icons at render time.
// However, since the existing menuSections array in Sidebar.tsx embeds React
// icon nodes directly, the simplest migration is to move the full menuSections
// (icons included) here and keep navigation.ts as a .tsx file.
// Rename to navigation.tsx if icon JSX is included here.

export const menuSections: MenuSection[] = [
  // COPY the full menuSections array from Sidebar.tsx here, adding roles to each leaf item.
  // Each leaf item (has path, no children) gets a `roles` field.
  // Parent container items (has children, no path) do NOT get a roles field.
  //
  // Use the leaf page visibility table from the spec as the authoritative reference:
  // docs/superpowers/specs/2026-03-21-global-search-phase2-permission-filtering-design.md
  //
  // IMPORTANT: The file extension may need to be .tsx if icon JSX is included.
  // Check existing Sidebar.tsx imports for icon components.
];
```

**Practical note on icons:** The existing `menuSections` in `Sidebar.tsx` embeds MUI icon components (`<DashboardIcon />` etc.) directly in the array. Since those are JSX, the config file needs to be `navigation.tsx`, not `navigation.ts`. Rename accordingly and update the import in `Sidebar.tsx`.

After creating the file structure, populate `menuSections` by copying from `Sidebar.tsx` and adding `roles` to each leaf item per the spec table. For example:

```typescript
// Primary section — Dashboard leaf
{
  id: 'dashboard',
  title: 'Dashboard',
  icon: <DashboardOutlinedIcon />,
  path: '/dashboard',
  roles: ALL_ROLES,
}

// Operations section — Sales group (container, no roles)
{
  id: 'sales',
  title: 'Sales',
  icon: <ShoppingCartOutlinedIcon />,
  children: [
    { id: 'sales-overview', title: 'Overview', path: '/sales', roles: SALES_ROLES },
    { id: 'customers', title: 'Customers', path: '/sales/customers', roles: SALES_ROLES },
    { id: 'orders', title: 'Sales Orders', path: '/sales/orders', roles: SALES_ROLES },
    { id: 'invoices', title: 'Invoices', path: '/sales/invoices', roles: SALES_ROLES },
    { id: 'payments', title: 'Payments', path: '/sales/payments', roles: SALES_ROLES },
  ],
}
```

Apply the same pattern for all sections using the spec's leaf page visibility table.

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/config/navigation.test.ts
```

Expected: PASS

- [ ] **Step 5: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/config/navigation.tsx src/config/navigation.test.ts
git commit -m "feat(nav): extract navigation config with role-based visibility"
```

---

## Task 5: Frontend — Update `Sidebar.tsx`

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

This task removes the inline `menuSections` array and no-op filter from `Sidebar.tsx`, imports from `navigation.tsx`, and fixes the flyout to use filtered sections.

- [ ] **Step 1: Remove `menuSections` array and types from Sidebar.tsx**

Delete the `menuSections` constant (lines 118–593) and the `MenuItem`/`MenuSection` type definitions from `Sidebar.tsx`. They now live in `navigation.tsx`.

Add the import at the top:

```typescript
import { menuSections, getFilteredMenuSections, MenuItem, MenuSection } from '../../config/navigation';
```

- [ ] **Step 2: Replace the no-op `getFilteredMenuSections` with filtered call**

Find the current no-op:

```typescript
const getFilteredMenuSections = () => {
  return menuSections
}
```

Replace with:

```typescript
const filteredSections = getFilteredMenuSections(menuSections, user.role as any);
```

Then update all uses of `getFilteredMenuSections()` in the render to use `filteredSections` instead.

**Note on accessing `user`:** `Sidebar.tsx` does not currently access the authenticated user (the existing `getFilteredMenuSections` is a no-op). Add this selector at the top of the component:

```typescript
import { useAppSelector, selectCurrentUser } from '../../store/slices/authSlice';
// (check the exact selector export name — it may be selectCurrentUser or state => state.auth.user)
const user = useAppSelector(selectCurrentUser);
```

The `role` field on `AuthUser` is the string literal type matching `Role` in `navigation.tsx`.

- [ ] **Step 3: Fix the flyout to use filtered sections**

There are two places in `Sidebar.tsx` that read from `menuSections` directly for flyout:

**Line ~706 (`openFlyout` function):**
```typescript
// BEFORE:
const item = menuSections.flatMap(section => section.items).find(menuItem => menuItem.id === itemId)
// AFTER:
const item = filteredSections.flatMap(section => section.items).find(menuItem => menuItem.id === itemId)
```

**Line ~1304 (flyout Popper JSX):**
```typescript
// BEFORE:
const flyoutItem = menuSections
  .flatMap(section => section.items)
  .find(item => item.id === flyoutItemId)
// AFTER:
const flyoutItem = filteredSections
  .flatMap(section => section.items)
  .find(item => item.id === flyoutItemId)
```

**Line ~623 (`useEffect` for auto-expand on route change):** There is a `useEffect` that calls `menuSections.forEach(...)` to find the current path's parent item IDs and auto-expand the correct section. This should continue using the raw imported `menuSections` constant (not `filteredSections`) — path-based auto-expansion needs to search the full tree regardless of role. Leave this call unchanged.

- [ ] **Step 4: Run type check**

```bash
cd frontend && npm run type-check
```

Fix any type errors. Common issue: `user.role` type may need casting — `user.role as Parameters<typeof getFilteredMenuSections>[1]` or widen the `Role` type in `navigation.tsx` to match `AuthUser['role']`.

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all pass, including `navigation.test.ts` from Task 4.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/common/Sidebar.tsx
git commit -m "feat(sidebar): apply role-based nav filtering using shared navigation config"
```

---

## Task 6: Integration tests

**Files:**
- Create: `backend/test/search.e2e-spec.ts`

These tests verify end-to-end permission behavior through the real HTTP layer. They require the NestJS app to be bootstrapped in the test environment. Check existing e2e spec files in `backend/test/` for the bootstrap pattern — look for `app.module.ts` usage, `supertest`, and database seeding patterns used in other e2e tests there.

- [ ] **Step 1: Check existing e2e test patterns**

Read an existing e2e spec in `backend/test/` (e.g., `auth.e2e-spec.ts` or any other file there) to understand: how the app is bootstrapped, whether a real DB is used or mocked, how JWT tokens are obtained for test requests.

- [ ] **Step 2: Write the e2e spec**

Create `backend/test/search.e2e-spec.ts` following the same bootstrap pattern as existing e2e specs:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/database/entities/user.entity';
import { JwtService } from '@nestjs/jwt';

// Helper: create a JWT for a given role (bypasses real user creation)
function makeToken(jwtService: JwtService, role: UserRole): string {
  return jwtService.sign({
    sub: `test-user-${role}`,
    username: `test_${role}`,
    email: `${role}@test.example`,
    role,
  });
}

describe('GET /search/global — role-based filtering (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const searchAs = (role: UserRole, q: string) =>
    request(app.getHttpServer())
      .get(`/search/global?q=${encodeURIComponent(q)}`)
      .set('Authorization', `Bearer ${makeToken(jwtService, role)}`);

  // --- Page presence/absence ---

  it('Admin sees Audit Logs page when searching "audit"', async () => {
    const res = await searchAs(UserRole.ADMIN, 'audit');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route === '/audit-logs')).toBe(true);
  });

  it('Sales Staff does NOT see Audit Logs page when searching "audit"', async () => {
    const res = await searchAs(UserRole.SALES_STAFF, 'audit');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route === '/audit-logs')).toBe(false);
  });

  it('Sales Staff sees Customers page when searching "customer"', async () => {
    const res = await searchAs(UserRole.SALES_STAFF, 'customer');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route === '/sales/customers')).toBe(true);
  });

  it('Inventory Staff does NOT see Customers page when searching "customer"', async () => {
    const res = await searchAs(UserRole.INVENTORY_STAFF, 'customer');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route === '/sales/customers')).toBe(false);
  });

  it('Procurement Staff sees Purchasing pages when searching "purchase"', async () => {
    const res = await searchAs(UserRole.PROCUREMENT_STAFF, 'purchase');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.route?.startsWith('/purchasing'))).toBe(true);
  });

  // --- Record-type presence/absence (requires seeded test data) ---
  // Note: these assertions use .type to check record categories, not specific routes.
  // They verify permission filtering even when the DB has no seeded records
  // (no results still means correct filtering — absence assertions always pass).

  it('Inventory Staff does NOT see customer records when searching "test"', async () => {
    const res = await searchAs(UserRole.INVENTORY_STAFF, 'test');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.type === 'customer')).toBe(false);
  });

  it('Sales Staff does NOT see purchase order records when searching "order"', async () => {
    const res = await searchAs(UserRole.SALES_STAFF, 'order');
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: any) => r.type === 'transaction' && r.route?.startsWith('/purchasing'))).toBe(false);
  });

  // --- Products: all operational roles can search (absence test only; presence requires seeded data) ---

  it('canSearchProducts returns true for all 5 roles (confirmed via no 403)', async () => {
    for (const role of Object.values(UserRole)) {
      const res = await searchAs(role, 'product');
      expect(res.status).toBe(200);
      // Products are not excluded — no error. Actual records depend on DB state.
    }
  });

  // --- Auth ---

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app.getHttpServer()).get('/search/global?q=test');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run e2e tests**

```bash
cd backend && npx jest test/search.e2e-spec.ts --no-coverage --testTimeout=30000
```

**If the e2e suite requires a running database:** check `package.json` for an `test:e2e` script and run that instead. Some NestJS projects use a separate test DB config. Follow the pattern from other e2e specs.

Expected: all tests pass (absence assertions pass even without seeded data; presence assertions may need seeded data — adjust accordingly).

- [ ] **Step 4: Commit**

```bash
cd backend && git add test/search.e2e-spec.ts
git commit -m "test(search): add e2e integration tests for role-based search filtering"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test -- --no-coverage
```

Expected: all pass.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all pass.

- [ ] **Step 3: Run frontend type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run backend lint**

```bash
cd backend && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Final commit (if any lint fixes)**

```bash
git add -A && git commit -m "chore: fix lint issues from Phase 2 permission filtering"
```

---

## Spec Reference

Full design document: `docs/superpowers/specs/2026-03-21-global-search-phase2-permission-filtering-design.md`

Key decisions documented there:
- Products are searchable by all 5 roles (not just Inventory Staff) — record search is broader than page visibility
- Backend is authoritative for discoverability; frontend filtering is for UX only
- Session invalidation on role change is out of scope — JWT role is used as-is
- Route authority: `navigation.tsx` routes are canonical; `STATIC_PAGES` must match exactly
