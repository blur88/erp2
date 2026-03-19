# Global Command Search — Phase 1 Design Spec

**Issue:** #142
**Date:** 2026-03-20
**Scope:** Phase 1 only — functional global search with unified backend endpoint, searchable core ERP entities, grouped results, and keyboard navigation. Does not cover advanced relevance tuning, recent searches, or dedicated search-engine infrastructure.

---

## 1. Architecture Overview

This feature has three layers:

1. **Backend search module (`search/`)** — a new NestJS module exposing `GET /search/global?q=abc&limit=20`. It orchestrates search across four sources in parallel, normalizes results into a shared response shape, applies basic permission-safe filtering via domain methods, and returns a capped result set.

2. **Domain search methods** — one focused `searchGlobal(query, user)` method added to each relevant domain service: customers, products, and transaction services (sales orders and purchase orders). Each method owns its domain-specific query rules and permission-aware filtering. Transactions are internally aggregated from sales orders and purchase orders by a private `searchTransactions()` helper in the search service. Static page/route search lives inside the search service itself.

3. **Frontend** — the existing `SearchModal` becomes functional through an RTK Query endpoint for `/search/global`, 250 ms debounced input, grouped result rendering, and keyboard navigation (`↑`, `↓`, `Enter`, `Esc`).

**Data flow:** `Ctrl+K` opens the modal → user types → query is trimmed → if trimmed length is at least 2 characters, a 250 ms debounce triggers the RTK Query request → `/search/global` returns normalized results → results render grouped by type (pages, customers, products, transactions) → user navigates with keyboard or mouse → `Enter` or click calls `navigate(result.route)` → modal closes and state resets.

---

## 2. Backend

### Module structure

```
backend/src/modules/search/
  search.module.ts
  search.controller.ts
  search.service.ts
  dto/
    global-search-query.dto.ts
    global-search-result.dto.ts
    global-search-response.dto.ts
```

### DTOs

**`GlobalSearchResultDto`**
```ts
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

**`GlobalSearchQueryDto`** — validates `q` (string, min 2, max 100) and `limit` (number, default 20, max 20).

**`GlobalSearchResponseDto`**
```ts
export class GlobalSearchResponseDto {
  query: string;
  results: GlobalSearchResultDto[];
}
```

### Controller

`GET /search/global` protected by `JwtAuthGuard`. Validates query via `GlobalSearchQueryDto`. Passes `req.user` into the service. Returns `GlobalSearchResponseDto`.

### Search service

Orchestrates four sources in parallel:

```ts
const [pages, customers, products, transactions] = await Promise.all([
  this.searchPages(query),
  this.customersService.searchGlobal(query, user),
  this.inventoryService.searchGlobal(query, user),
  this.searchTransactions(query, user),
]);
```

Each source call is wrapped with per-source error handling — failed sources are caught, logged, and treated as empty arrays so the overall response still succeeds.

`searchTransactions()` is a private method that fans out to sales and purchase orders:

```ts
private async searchTransactions(query: string, user: AuthUserDto): Promise<GlobalSearchResultDto[]> {
  const [salesOrders, purchaseOrders] = await Promise.all([
    this.salesOrdersService.searchGlobal(query, user),
    this.purchaseOrdersService.searchGlobal(query, user),
  ]);
  return [...salesOrders, ...purchaseOrders];
}
```

After fan-out, the service merges all results, sorts by descending `score`, slices to the requested limit (max 20), and returns `{ query, results }`.

A defensive early return prevents unnecessary fan-out:
```ts
if (!query?.trim() || query.trim().length < 2) {
  return { query, results: [] };
}
```

### Domain search methods

Each method returns `GlobalSearchResultDto[]` with score assigned by the domain method. Scores follow these rules: exact match = 100, startsWith = 80, contains = 50, code/SKU/number match = 90.

**Customers** (`CustomersService.searchGlobal`)
- Search fields: name, code, email
- Filter: not soft-deleted, applying the same baseline visibility rules already used by the customers module
- Result shape: `label = name`, `description = code`, `route = /customers/:id`, `type = 'customer'`

**Products** (`InventoryService.searchGlobal` / `ProductsService.searchGlobal`)
- Search fields: name, SKU
- Filter: not soft-deleted, baseline visibility rules
- Result shape: `label = name`, `description = SKU`, `route = /inventory/products/:id`, `type = 'product'`

**Sales Orders** (`SalesOrdersService.searchGlobal`)
- Search fields: order number, customer name
- Filter: not soft-deleted, baseline visibility rules
- Result shape: `label = order number`, `description = customer name`, `route = /sales/orders/:id`, `type = 'transaction'`

**Purchase Orders** (`PurchaseOrdersService.searchGlobal`)
- Search fields: order number, supplier name
- Filter: not soft-deleted, baseline visibility rules
- Result shape: `label = order number`, `description = supplier name`, `route = /purchasing/orders/:id`, `type = 'transaction'`

**Pages** (static, inside `search.service.ts`)
- A static array of ~20 app routes, each with label, keywords, and route
- Filtered with `includes()` on label and keywords
- Result shape: `label = page title`, `description = 'Navigation'`, `route = static route`, `type = 'page'`

### Permission filtering

Each domain method applies the same baseline visibility rules already used by its module, excluding soft-deleted records and any records the current authenticated user should not see. Advanced role-based search shaping and module-aware exclusion (e.g. accounting) are deferred to Phase 2.

---

## 3. Frontend

### RTK Query slice

New file: `frontend/src/store/api/searchApi.ts`

Single query endpoint: `GET /search/global?q=abc&limit=20` returning `{ query: string, results: GlobalSearchResultDto[] }`.

Search results are treated as ephemeral and refreshed per debounced query rather than reused as long-lived cached data. No custom retry or timeout behavior is added; the existing base query behavior is used as-is.

### SearchModal

**State:** `query`, `debouncedQuery` (250 ms via `useEffect`), `selectedIndex` (reset to 0 on new results).

**Behavior on open:** Input auto-focuses immediately. Query resets to empty on each fresh open. State (query, selectedIndex) resets to clean defaults on close.

**RTK Query usage:**
```ts
useSearchGlobalQuery(
  { q: debouncedQuery.trim(), limit: 20 },
  { skip: debouncedQuery.trim().length < 2 }
)
```

Query is trimmed before threshold evaluation and before sending the request.

**Render states:**
- `trimmed query < 2 chars` → help text: "Type at least 2 characters to search pages, customers, products, and transactions."
- `isLoading` (initial fetch, no prior results) → skeleton/spinner
- `isFetching` while prior results exist → keep results visible with subtle loading indicator near input to avoid flicker
- `results.length === 0` (query satisfied) → "No results for '…'"
- RTK Query error → modal remains open and usable; inline message in results area: "Search unavailable, please try again." User can edit query and retry immediately.
- `results.length > 0` → grouped sections

**Grouped result rendering:**

Results are rendered in group order: `page → customer → product → transaction`. Only groups with results are rendered. Each group has a header label ("Pages", "Customers", "Products", "Transactions"). Each row shows `label` (bold), `description` (muted), and a user-facing type badge ("Page", "Customer", "Product", "Transaction").

A single flattened ordered results array is maintained for selection and keyboard navigation. Grouped rendering maps visually over this same array — the highlighted row and the keyboard-selected index always refer to the same item.

**Keyboard navigation:**
- `ArrowDown` — advance `selectedIndex`; wraps from last item to first
- `ArrowUp` — retreat `selectedIndex`; wraps from first item to last
- `Enter` — `navigate(results[selectedIndex].route)`, close modal, reset state
- `Esc` — close modal, reset state (already implemented in TopBar.tsx)
- Mouse hover — sync `selectedIndex` to hovered item
- Mouse click — navigate and close

Selected row calls `scrollIntoView({ block: 'nearest' })` to stay visible during keyboard navigation.

**No changes needed to `TopBar.tsx`** — the Ctrl+K handler and modal open/close are already implemented.

---

## 4. Error Handling, Testing & Out of Scope

### Error handling

**Backend:** Each source (`searchPages`, `customersService.searchGlobal`, etc.) is executed independently with per-source error handling. Failed sources are logged and treated as empty result sets so the overall search response still succeeds with results from the remaining sources.

**Frontend:** The modal remains open and usable when an error occurs. An inline message is shown in the results area so the user can retry by editing the query. No custom timeout or retry behavior is added in Phase 1; the existing API client/base query behavior is used as-is.

### Testing

**Backend unit tests — `SearchService`:**
- Verify fan-out to all four sources via `Promise.all`
- Verify results merged and sorted by descending score
- Verify limit cap applied correctly
- Verify early return for queries shorter than 2 characters
- Verify a failing source returns empty array without breaking the overall response

**Backend unit tests — each `searchGlobal()` domain method:**
- Verify correct field matching (exact, prefix, contains)
- Verify soft-deleted records are excluded
- Verify only records visible to the current user under baseline access rules are returned
- Verify result shape matches `GlobalSearchResultDto`

**Frontend component tests (Vitest) — `SearchModal`:**
- Verify input auto-focuses on open
- Verify RTK Query is skipped when trimmed query length < 2
- Verify 250 ms debounce before request fires
- Verify grouped rendering with correct section headers
- Verify ArrowDown/ArrowUp keyboard navigation with wrap-around
- Verify Enter navigates to selected result and closes modal
- Verify Esc closes modal
- Verify state resets on close
- Verify inline error message when RTK Query returns an error

No dedicated E2E coverage is included in Phase 1; this is deferred once the interaction and endpoint contract stabilize.

### Explicitly out of scope (Phase 2+)

- Advanced ranking/scoring beyond exact/prefix/contains
- Recent searches and search history
- Fuzzy matching and typo tolerance
- Fine-grained RBAC per module (e.g. accounting exclusion from search)
- Search analytics
- Elasticsearch / Meilisearch / external search infrastructure
- Journal Entry search (not included in Phase 1 transaction scope)
- Advanced performance optimization beyond basic query limits, indexing, and capped result sets
