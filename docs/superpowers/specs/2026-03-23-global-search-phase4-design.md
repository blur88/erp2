# Global Search — Phase 4: Fuzzy Matching and Expanded Entity Coverage

**Date:** 2026-03-23
**Issue:** #156
**Status:** Approved

## Overview

Phase 4 improves search quality and coverage through two workstreams:

1. **Fuzzy matching** — `pg_trgm`-based fallback when ILIKE returns no results
2. **Expanded entities** — five new searchable entity types: Suppliers, Invoices, Customer Payments, Vendor Payments, Journal Entries

**Out of scope (deferred to Phase 5):**
- Search analytics (query logging, click tracking, analytics table/endpoints)
- Semantic or AI-powered search
- Dedicated search engines (Elasticsearch, Meilisearch)
- Splitting `'transaction'` type into `'sales_order'` / `'purchase_order'`

---

## Architecture

No structural changes to the search architecture. `SearchService` remains a pure orchestrator: fan-out via `Promise.all`, merge, sort by score, slice to `SEARCH_RESPONSE_LIMIT`. Each domain service continues to own its own query logic.

**Option chosen:** Option A — inline fuzzy fallback in each service. No shared fuzzy utility function. Each `searchGlobal` method follows the same standardized pattern.

---

## Part 1: Migration

**File:** `backend/src/database/migrations/1773400000000-AddPgTrgmAndTrigramIndexes.ts`

**Important constraints:**
- Run with `transaction: false` — `CREATE INDEX CONCURRENTLY` is not allowed inside a transaction
- Do **not** drop the extension in `down()` — it is shared across the DB and may be used by other features

### `up()`

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY idx_products_name_trgm       ON products        USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_products_barcode_trgm    ON products        USING gin (barcode gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_customers_name_trgm      ON customers       USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_customers_phone_trgm     ON customers       USING gin (phone gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_sales_orders_ordernumber_trgm    ON sales_orders    USING gin ("orderNumber" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_purchase_orders_ordernumber_trgm ON purchase_orders USING gin ("orderNumber" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_suppliers_companyname_trgm       ON suppliers       USING gin ("companyName" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_invoices_invoicenumber_trgm      ON invoices        USING gin ("invoiceNumber" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_payments_paymentnumber_trgm      ON payments        USING gin ("paymentNumber" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_vendor_payments_paymentnumber_trgm   ON vendor_payments USING gin ("paymentNumber" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_vendor_payments_referencenumber_trgm ON vendor_payments USING gin ("referenceNumber" gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_journal_entries_referencenumber_trgm ON journal_entries USING gin ("referenceNumber" gin_trgm_ops);
```

### `down()`

```sql
DROP INDEX IF EXISTS idx_products_name_trgm;
DROP INDEX IF EXISTS idx_products_barcode_trgm;
DROP INDEX IF EXISTS idx_customers_name_trgm;
DROP INDEX IF EXISTS idx_customers_phone_trgm;
DROP INDEX IF EXISTS idx_sales_orders_ordernumber_trgm;
DROP INDEX IF EXISTS idx_purchase_orders_ordernumber_trgm;
DROP INDEX IF EXISTS idx_suppliers_companyname_trgm;
DROP INDEX IF EXISTS idx_invoices_invoicenumber_trgm;
DROP INDEX IF EXISTS idx_payments_paymentnumber_trgm;
DROP INDEX IF EXISTS idx_vendor_payments_paymentnumber_trgm;
DROP INDEX IF EXISTS idx_vendor_payments_referencenumber_trgm;
DROP INDEX IF EXISTS idx_journal_entries_referencenumber_trgm;
-- DO NOT drop pg_trgm extension
```

**Columns intentionally skipped (long free-text, poor trigram candidates):**
- `journal_entries.description`
- `suppliers.notes`
- `payments.notes` / `vendor_payments.notes`

---

## Part 2: Constants

**File:** `backend/src/modules/search/search.constants.ts`

Add to the existing constants file:

```ts
// New entity boosts (Phase 4)
export const BOOST_INVOICE  = 9;  // closely tied to transactions, high-frequency lookup
export const BOOST_PAYMENT  = 8;  // same tier as CUSTOMER
export const BOOST_SUPPLIER = 7;  // slightly below Customer in typical usage
export const BOOST_JOURNAL  = 4;  // specialist/accounting use, low search frequency

// Fuzzy fallback score: below all normal text-match tiers.
// Used only when exact/startsWith/contains return zero results.
export const SCORE_FUZZY = 40;
```

**Complete boost hierarchy:**
```
+10  Sales/Purchase Orders (transaction)
 +9  Invoices
 +8  Customers, Customer/Vendor Payments
 +7  Suppliers
 +6  Products
 +4  Journal Entries
 +2  Pages
```

---

## Part 3: Permission Guards

**File:** `backend/src/modules/search/search.permissions.ts`

Add five new guard functions following the existing pattern:

```ts
export function canSearchSuppliers(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);  // Admin, Manager, Procurement Staff
}

export function canSearchInvoices(role: UserRole): boolean {
  return SALES_ROLES.includes(role);  // Admin, Manager, Sales Staff
}

export function canSearchCustomerPayments(role: UserRole): boolean {
  return SALES_ROLES.includes(role);
}

export function canSearchVendorPayments(role: UserRole): boolean {
  return PROCUREMENT_ROLES.includes(role);
}

export function canSearchJournalEntries(role: UserRole): boolean {
  return FINANCE_ROLES.includes(role);  // Admin, Manager only
}
```

Role assignments match existing page visibility from Phase 2 — no new role logic introduced.

---

## Part 4: searchGlobal Pattern

### Canonical shape (Supplier as example)

Each `searchGlobal` follows this standardized structure:

```ts
async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
  if (!canSearchSuppliers(user.role)) return [];

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

  // Fuzzy fallback — only runs when ILIKE returns zero results
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

### Key decisions for all services

- **Similarity threshold:** 0.3 (pg_trgm default — catches common typos without noise)
- **Parameter passing:** use `.setParameter('q', trimmed)` once; reference `:q` in `.andWhere()` and `.orderBy()`
- **Similarity alias:** `.addSelect('similarity(...)', 'sim')` then `.orderBy('sim', 'DESC')` to avoid repeating the expression
- **Mapper pattern:** private mapper method with `fuzzy: boolean` flag controls scoring branch
- **Soft-delete filter:** always `WHERE deletedAt IS NULL`

### Entity-specific details

**Invoice:**
- ILIKE on `invoiceNumber` only
- Fuzzy on `invoiceNumber` only
- Use `leftJoinAndSelect('invoice.customer', 'customer')` to get customer name for description
- Join must not cause row duplication — select only needed fields if needed
- Route: `/sales/invoices/${invoice.id}`
- Type: `'invoice'`

**Customer Payment:**
- ILIKE on `paymentNumber` only
- Fuzzy on `paymentNumber` only
- Route: `/sales/payments/${payment.id}`
- Type: `'customer_payment'`

**Vendor Payment:**
- ILIKE on `paymentNumber OR referenceNumber`
- Fuzzy on both with `similarity(vp.paymentNumber, :q) > 0.3 OR similarity(vp.referenceNumber, :q) > 0.3`
- Route: `/purchasing/vendor-payments/${vp.id}`
- Type: `'vendor_payment'`

**Journal Entry:**
- ILIKE on `referenceNumber OR description` (description is searched via ILIKE only)
- Fuzzy fallback on `referenceNumber` only (no trigram index on description)
- Route: `/accounting/journal-entries/${je.id}`
- Type: `'journal_entry'`

**Supplier:**
- ILIKE on `companyName`
- Fuzzy on `companyName`
- Description: `supplier.phone ?? undefined`
- Route: `/purchasing/suppliers/${supplier.id}`
- Type: `'supplier'`

### Multi-column fuzzy ordering

For Customer and Product (two fuzzy columns each):

**Customer:**
```sql
similarity(customer.name, :q) > 0.3 OR similarity(customer.phone, :q) > 0.3
ORDER BY GREATEST(similarity(customer.name, :q), similarity(customer.phone, :q)) DESC
```

**Product:**
```sql
similarity(product.name, :q) > 0.3 OR similarity(product.barcode, :q) > 0.3
ORDER BY GREATEST(similarity(product.name, :q), similarity(product.barcode, :q)) DESC
```

Use `.addSelect('GREATEST(similarity(product.name, :q), similarity(product.barcode, :q))', 'sim')` and `.orderBy('sim', 'DESC')`.

---

## Part 5: SearchService Wiring

**File:** `backend/src/modules/search/search.service.ts`

Five new injected services added to constructor. `Promise.all` expands to 10 sources:

```ts
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
  this.safeSearch('pages', async () => Promise.resolve(this.searchPages(trimmed, user))),
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
```

Merge/sort/slice is unchanged — it already handles any `GlobalSearchResultDto[]`.

**Implementation verification checklist:**
- Confirm `SupplierService` is exported from `PurchasingModule`
- Confirm `InvoiceService` is exported from `SalesModule`
- Confirm `PaymentService` is exported from `SalesModule`
- Confirm `VendorPaymentService` is exported from `PurchasingModule`
- Confirm `JournalEntryService` is exported from `AccountingModule`
- Add `AccountingModule` to `SearchModule` imports
- No circular dependency introduced

---

## Part 6: Existing Services — Fuzzy Fallback Addition

The four existing services (Customer, Product, SalesOrder, PurchaseOrder) get fuzzy fallback added to their existing `searchGlobal` methods. No signature changes.

**Columns per service:**

| Service | ILIKE fields | Fuzzy field(s) |
|---|---|---|
| Customer | `name`, `phone` | `name`, `phone` (GREATEST ordering) |
| Product | `name`, `barcode` | `name`, `barcode` (GREATEST ordering) |
| SalesOrder | `orderNumber` | `orderNumber` |
| PurchaseOrder | `orderNumber` | `orderNumber` |

Fuzzy results from existing services use `SCORE_FUZZY + BOOST_<entity>` — same scoring pattern as new entities.

---

## Part 7: Frontend Changes

**Files affected:**
- `frontend/src/types/search.ts` — extend `GlobalSearchResultType`
- `frontend/src/components/common/SearchModal.tsx` — extend `GROUP_ORDER`, `GROUP_LABELS`, `TYPE_BADGES`
- `frontend/src/utils/recentSearch.ts` — extend type union

### Type extension

```ts
export type GlobalSearchResultType =
  | 'page'
  | 'customer'
  | 'product'
  | 'transaction'        // SO + PO — unchanged
  | 'supplier'
  | 'invoice'
  | 'customer_payment'
  | 'vendor_payment'
  | 'journal_entry'
```

### SearchModal additions

```ts
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
  customer_payment: 'Payment',
  vendor_payment: 'Vendor Payment',
  journal_entry: 'Journal',
}
```

No changes to keyboard navigation, selection logic, highlighting, or recent search behavior.

---

## Testing

### Backend

- Unit tests for each new `searchGlobal` method: ILIKE path returns results, fuzzy path triggers on empty, permission guard returns `[]` for unauthorized roles
- Unit tests for fuzzy fallback addition to existing 4 services
- Existing `search.service.spec.ts` extended to cover new sources in `Promise.all`
- Migration test: indexes exist after `up()`, not present after `down()`, extension remains after `down()`

### Frontend

- `SearchModal.test.tsx` extended to cover new type values in `GROUP_ORDER` and `TYPE_BADGES`
- `recentSearch.test.ts` extended for new type values
- TypeScript strict type check passes with no `GlobalSearchResultType` exhaustiveness errors

---

## Out of Scope (Phase 5)

- Query logging / analytics table
- Click tracking endpoint (`POST /search/track-click`)
- Zero-result analysis
- Search usage reporting
- Splitting `'transaction'` into `'sales_order'` / `'purchase_order'`
- Hybrid fuzzy+ILIKE ranking (always-on fuzzy)
- Similarity threshold tuning based on measured data
