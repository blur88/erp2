# Global Search UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 high-impact search improvements from issue #184: rebalance result priority (data > pages), replace "Navigation" labels with meaningful route-derived categories, add highlight color to matched text, and boost exact-match records to the top.

**Architecture:** Backend scoring changes live in individual entity service files (not search.service.ts, which only orchestrates); page label derivation is a pure module-level helper in search.service.ts; frontend highlight color threads through the pure `highlightText` utility with the theme color provided by the caller.

**Tech Stack:** NestJS 11 (backend), React 19 + MUI v7 (frontend), Vitest (frontend tests), Jest (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-25-global-search-ux-polish-design.md`

---

## File Map

| File | Change |
|------|--------|
| `backend/src/modules/search/search.constants.ts` | `BOOST_PAGE = 0`; add `BOOST_EXACT_MATCH = 20` |
| `backend/src/modules/search/search.service.ts` | Add `getPageCategory()` module-level fn; use in `searchPages()` |
| `backend/src/modules/search/search.service.spec.ts` | Update hardcoded page score expectations; add `getPageCategory` tests |
| `backend/src/modules/sales/services/customer.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/inventory/services/product.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/purchasing/services/supplier.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/sales/services/sales-order.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/sales/services/invoice.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/sales/services/payment.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/purchasing/services/vendor-payment.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/accounting/services/journal-entry.service.ts` | Apply `BOOST_EXACT_MATCH` |
| `frontend/src/utils/highlightText.tsx` | Add optional `highlightColor` param |
| `frontend/src/utils/highlightText.test.tsx` | Add tests for color param |
| `frontend/src/components/common/SearchModal.tsx` | Move `page` last in `GROUP_ORDER`; add `useTheme`; pass color |
| `frontend/src/components/common/__tests__/SearchModal.test.tsx` | Add GROUP_ORDER test |

---

## Task 1: Update scoring constants

**Files:**
- Modify: `backend/src/modules/search/search.constants.ts`

- [ ] **Step 1: Update `BOOST_PAGE` and add `BOOST_EXACT_MATCH`**

Open `backend/src/modules/search/search.constants.ts`. Make two changes:

Change:
```ts
export const BOOST_PAGE = 2;
```
To:
```ts
export const BOOST_PAGE = 0; // intentionally zero — pages remain in formula for consistency but contribute no score boost
```

Add after the existing boost constants:
```ts
// Applied once after baseScore resolves, when baseScore === SCORE_EXACT_CODE or SCORE_EXACT_NAME
// Only for non-page entities — ensures exact record matches decisively outrank all partial matches
export const BOOST_EXACT_MATCH = 20;
```

- [ ] **Step 2: Fix existing backend tests that hardcode old page scores**

Open `backend/src/modules/search/search.service.spec.ts`. Three test expectations reference the old `BOOST_PAGE = 2`. Update them:

Find and update:
```ts
expect(dashPage?.score).toBe(92); // SCORE_PAGE_EXACT(90) + BOOST_PAGE(2)
```
→
```ts
expect(dashPage?.score).toBe(90); // SCORE_PAGE_EXACT(90) + BOOST_PAGE(0)
```

```ts
expect(invoicesPage?.score).toBe(77); // SCORE_PAGE_STARTSWITH(75) + BOOST_PAGE(2)
```
→
```ts
expect(invoicesPage?.score).toBe(75); // SCORE_PAGE_STARTSWITH(75) + BOOST_PAGE(0)
```

```ts
expect(customersPage?.score).toBe(52); // SCORE_PAGE_KEYWORD(50) + BOOST_PAGE(2)
```
→
```ts
expect(customersPage?.score).toBe(50); // SCORE_PAGE_KEYWORD(50) + BOOST_PAGE(0)
```

- [ ] **Step 3: Run backend tests to verify constants change is clean**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/search/search.constants.ts backend/src/modules/search/search.service.spec.ts
git commit -m "feat(search): lower BOOST_PAGE to 0, add BOOST_EXACT_MATCH constant"
```

---

## Task 2: Add `getPageCategory` helper and fix "Navigation" labels

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`
- Modify: `backend/src/modules/search/search.service.spec.ts`

- [ ] **Step 1: Write failing tests for `getPageCategory`**

The helper will be a module-level function in `search.service.ts`. Since it's not exported, test it indirectly through the page description output. Add these tests to the existing page-scoring describe block in `search.service.spec.ts`:

```ts
describe('page descriptions (getPageCategory)', () => {
  it('returns "Dashboard" for /dashboard', async () => {
    const results = await service.searchGlobal({ q: 'dashboard' }, mockAdminUser);
    const page = results.results.find(r => r.route === '/dashboard');
    expect(page?.description).toBe('Dashboard');
  });

  it('returns "Sales" for /sales routes', async () => {
    const results = await service.searchGlobal({ q: 'customers' }, mockAdminUser);
    const page = results.results.find(r => r.route === '/sales/customers');
    expect(page?.description).toBe('Sales');
  });

  it('returns "Report" for /reports routes (not "Sales")', async () => {
    const results = await service.searchGlobal({ q: 'product summary' }, mockAdminUser);
    const page = results.results.find(r => r.route?.startsWith('/reports/sales/'));
    expect(page?.description).toBe('Report');
  });

  it('returns "Accounting" for /accounting routes', async () => {
    const results = await service.searchGlobal({ q: 'journal' }, mockAdminUser);
    const page = results.results.find(r => r.route?.startsWith('/accounting/'));
    expect(page?.description).toBe('Accounting');
  });

  it('returns "Audit" for /audit-logs', async () => {
    const results = await service.searchGlobal({ q: 'audit' }, mockAdminUser);
    const page = results.results.find(r => r.route === '/audit-logs');
    expect(page?.description).toBe('Audit');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```
Expected: the new tests fail with description `'Navigation'`.

- [ ] **Step 3: Add `getPageCategory` and update `searchPages()`**

In `backend/src/modules/search/search.service.ts`, add this function **above the `STATIC_PAGES` constant** (module level, outside the class):

```ts
function getPageCategory(route: string): string {
  const r = route.toLowerCase().trim();
  if (r === '/dashboard') return 'Dashboard';
  if (r === '/reports' || r.startsWith('/reports/')) return 'Report';
  if (r === '/accounting' || r.startsWith('/accounting/')) return 'Accounting';
  if (r === '/sales' || r.startsWith('/sales/')) return 'Sales';
  if (r === '/purchasing' || r.startsWith('/purchasing/')) return 'Purchasing';
  if (r === '/inventory' || r.startsWith('/inventory/')) return 'Inventory';
  if (r === '/settings' || r.startsWith('/settings/')) return 'Settings';
  if (r === '/audit-logs' || r.startsWith('/audit-logs/')) return 'Audit';
  return 'Page';
}
```

Then in the `searchPages()` private method, find this line:
```ts
description: 'Navigation',
```
Replace with:
```ts
description: getPageCategory(page.route),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/search/search.service.ts backend/src/modules/search/search.service.spec.ts
git commit -m "feat(search): replace 'Navigation' page descriptions with route-derived category labels"
```

---

## Task 3: Apply `BOOST_EXACT_MATCH` to entity services

**Files (all Modify):**
- `backend/src/modules/sales/services/customer.service.ts`
- `backend/src/modules/inventory/services/product.service.ts`
- `backend/src/modules/purchasing/services/supplier.service.ts`
- `backend/src/modules/sales/services/sales-order.service.ts`
- `backend/src/modules/sales/services/invoice.service.ts`
- `backend/src/modules/sales/services/payment.service.ts`
- `backend/src/modules/purchasing/services/purchase-order.service.ts`
- `backend/src/modules/purchasing/services/vendor-payment.service.ts`
- `backend/src/modules/accounting/services/journal-entry.service.ts`

**Pattern to apply in each file:**

Each file has a `mapX()` private method that computes `baseScore` and returns `score: baseScore + BOOST_X`. The change is mechanical:

1. Import `BOOST_EXACT_MATCH` alongside the existing constants import from `../../search/search.constants` (or the equivalent relative path)
2. Change the `score` line from:
   ```ts
   score: baseScore + BOOST_X,
   ```
   to:
   ```ts
   score: baseScore + BOOST_X + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
   ```

The boost applies only when `baseScore` is already `SCORE_EXACT_CODE` or `SCORE_EXACT_NAME` — it is applied once after the priority chain resolves, not per-field.

- [ ] **Step 1: Write failing backend tests for exact match boost**

Add to `backend/src/modules/search/search.service.spec.ts` in an appropriate describe block:

```ts
describe('exact match boost', () => {
  it('exact customer name scores higher than startsWith page match', async () => {
    // A customer whose name exactly equals the query should outscore any page
    // Expected: exact customer name = SCORE_EXACT_NAME(95) + BOOST_CUSTOMER(8) + BOOST_EXACT_MATCH(20) = 123
    // Best possible page score = SCORE_PAGE_EXACT(90) + BOOST_PAGE(0) = 90
    const results = await service.searchGlobal({ q: 'Alpha Industries' }, mockAdminUser);
    const customer = results.results.find(r => r.type === 'customer' && r.label === 'Alpha Industries');
    expect(customer?.score).toBe(123);
  });
});
```

Note: this test requires a customer named "Alpha Industries" in the test database setup — check how the existing spec file sets up test data and add the fixture if needed. Add `expect(customer).toBeDefined()` before the score assertion so a missing fixture fails loudly rather than silently passing with `undefined`.

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage --testNamePattern="exact match boost"
```
Expected: FAIL (score is currently 103, not 123).

- [ ] **Step 3: Apply boost to `customer.service.ts`**

File: `backend/src/modules/sales/services/customer.service.ts`

Add `BOOST_EXACT_MATCH` to the import from `../../search/search.constants`:
```ts
import {
  BOOST_CUSTOMER,
  BOOST_EXACT_MATCH,
  SCORE_EXACT_CODE,
  SCORE_EXACT_NAME,
  // ... existing imports
} from '../../search/search.constants';
```

In `mapCustomer()`, change:
```ts
score: baseScore + BOOST_CUSTOMER,
```
to:
```ts
score: baseScore + BOOST_CUSTOMER + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 4: Apply boost to `product.service.ts`**

File: `backend/src/modules/inventory/services/product.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In `mapProduct()`, change:
```ts
score: baseScore + BOOST_PRODUCT,
```
to:
```ts
score: baseScore + BOOST_PRODUCT + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 5: Apply boost to `supplier.service.ts`**

File: `backend/src/modules/purchasing/services/supplier.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In `mapSupplier()`, change:
```ts
score: baseScore + BOOST_SUPPLIER,
```
to:
```ts
score: baseScore + BOOST_SUPPLIER + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 6: Apply boost to `sales-order.service.ts`**

File: `backend/src/modules/sales/services/sales-order.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In `mapSalesOrder()`, change:
```ts
score: baseScore + BOOST_TRANSACTION,
```
to:
```ts
score: baseScore + BOOST_TRANSACTION + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 7: Apply boost to `invoice.service.ts`**

File: `backend/src/modules/sales/services/invoice.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In the invoice map method (around line 306), change:
```ts
score: baseScore + BOOST_INVOICE,
```
to:
```ts
score: baseScore + BOOST_INVOICE + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 8: Apply boost to `payment.service.ts`**

File: `backend/src/modules/sales/services/payment.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In the payment map method (around line 593), change:
```ts
score: baseScore + BOOST_CUSTOMER_PAYMENT,
```
to:
```ts
score: baseScore + BOOST_CUSTOMER_PAYMENT + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 9: Apply boost to `purchase-order.service.ts`**

File: `backend/src/modules/purchasing/services/purchase-order.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In the purchase order map method (around line 397), change:
```ts
score: baseScore + BOOST_TRANSACTION,
```
to:
```ts
score: baseScore + BOOST_TRANSACTION + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 10: Apply boost to `vendor-payment.service.ts`**

File: `backend/src/modules/purchasing/services/vendor-payment.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In the vendor payment map method (around line 275), change:
```ts
score: baseScore + BOOST_VENDOR_PAYMENT,
```
to:
```ts
score: baseScore + BOOST_VENDOR_PAYMENT + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 11: Apply boost to `journal-entry.service.ts`**

File: `backend/src/modules/accounting/services/journal-entry.service.ts`

Add `BOOST_EXACT_MATCH` to imports. In the journal entry map method (around line 433), change:
```ts
score: baseScore + BOOST_JOURNAL,
```
to:
```ts
score: baseScore + BOOST_JOURNAL + (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
```

- [ ] **Step 12: Run all backend search tests**

```bash
cd backend && npx jest src/modules/search/ --no-coverage
```
Expected: all tests pass.

Also run tests for each modified entity service to catch any pre-existing test expectations on scores:
```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts src/modules/inventory/services/product.service.spec.ts src/modules/purchasing/services/supplier.service.spec.ts --no-coverage 2>/dev/null || echo "no spec files found for these"
```

- [ ] **Step 13: Commit**

```bash
git add \
  backend/src/modules/search/search.service.spec.ts \
  backend/src/modules/sales/services/customer.service.ts \
  backend/src/modules/inventory/services/product.service.ts \
  backend/src/modules/purchasing/services/supplier.service.ts \
  backend/src/modules/sales/services/sales-order.service.ts \
  backend/src/modules/sales/services/invoice.service.ts \
  backend/src/modules/sales/services/payment.service.ts \
  backend/src/modules/purchasing/services/purchase-order.service.ts \
  backend/src/modules/purchasing/services/vendor-payment.service.ts \
  backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(search): apply BOOST_EXACT_MATCH to all entity services for exact-match priority"
```

---

## Task 4: Add highlight color to `highlightText`

**Files:**
- Modify: `frontend/src/utils/highlightText.tsx`
- Modify: `frontend/src/utils/highlightText.test.tsx`

- [ ] **Step 1: Write failing tests for the color param**

Add to `frontend/src/utils/highlightText.test.tsx`:

```ts
it('applies highlightColor when provided', () => {
  const { container } = render(<>{highlightText('abc and more', 'abc', 700, '#ff0000')}</>)
  const span = container.querySelector('span')
  expect(span?.style.color).toBe('rgb(255, 0, 0)')
})

it('does not set color when highlightColor is not provided', () => {
  const { container } = render(<>{highlightText('abc and more', 'abc')}</>)
  const span = container.querySelector('span')
  expect(span?.style.color).toBe('')
})

it('applies both weight and color when both are provided', () => {
  const { container } = render(<>{highlightText('abc and more', 'abc', 600, '#0000ff')}</>)
  const span = container.querySelector('span')
  expect(span?.style.fontWeight).toBe('600')
  expect(span?.style.color).toBe('rgb(0, 0, 255)')
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/utils/highlightText.test.tsx
```
Expected: the three new color tests fail.

- [ ] **Step 3: Add `highlightColor` param to `highlightText`**

Open `frontend/src/utils/highlightText.tsx`. Change the function signature and span:

```ts
export function highlightText(
  text: string,
  query: string,
  highlightWeight = 700,
  highlightColor?: string,
): ReactNode {
  const trimmed = query.trim()
  if (!trimmed) return text

  const regex = new RegExp(escapeRegex(trimmed), 'i')
  const match = regex.exec(text)

  if (!match) return text

  const start = match.index
  const end = start + match[0].length

  return (
    <>
      {text.slice(0, start)}
      <span style={{ fontWeight: highlightWeight, ...(highlightColor ? { color: highlightColor } : {}) }}>
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/utils/highlightText.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/highlightText.tsx frontend/src/utils/highlightText.test.tsx
git commit -m "feat(search): add optional highlightColor param to highlightText utility"
```

---

## Task 5: Wire highlight color and reorder GROUP_ORDER in SearchModal

**Files:**
- Modify: `frontend/src/components/common/SearchModal.tsx`
- Modify: `frontend/src/components/common/__tests__/SearchModal.test.tsx`

- [ ] **Step 1: Write failing test for GROUP_ORDER (pages last)**

Add to `frontend/src/components/common/__tests__/SearchModal.test.tsx`:

```ts
it('renders data result groups before page group', async () => {
  mockUseSearchGlobal.mockReturnValue({
    data: {
      results: [
        { type: 'page', label: 'Sales', description: 'Sales', route: '/sales', score: 90 },
        { type: 'customer', label: 'Alpha Industries', description: '', route: '/sales/customers/1', score: 103 },
      ],
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  })

  renderModal()

  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: /search/i }), {
      target: { value: 'al' },
    })
  })

  const headers = screen.getAllByText(/^(Customers|Pages)$/i)
  expect(headers[0].textContent).toBe('Customers')
  expect(headers[1].textContent).toBe('Pages')
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SearchModal.test.tsx
```
Expected: the new test fails (currently Pages renders first).

- [ ] **Step 3: Move `page` to end of `GROUP_ORDER` and add highlight color**

Open `frontend/src/components/common/SearchModal.tsx`.

**Change 1 — GROUP_ORDER:** Move `'page'` from first position to last:

```ts
const GROUP_ORDER: GlobalSearchResultType[] = [
  'customer',
  'product',
  'transaction',
  'supplier',
  'invoice',
  'customer_payment',
  'vendor_payment',
  'journal_entry',
  'page',
]
```

**Change 2 — useTheme:** Add `useTheme` import from MUI and call it at the top of `SearchModal`:

Add to the MUI imports:
```ts
import { ..., useTheme } from '@mui/material'
```

Add inside `SearchModal` component, near the top of the function body:
```ts
const theme = useTheme()
```

**Change 3 — pass color to SearchResultRow:** The `theme` object needs to reach `SearchResultRow`. Pass `highlightColor` as a prop:

Add to `SearchResultRowProps`:
```ts
highlightColor: string
```

Update all three `<SearchResultRow ... />` render sites to pass:
```ts
highlightColor={theme.palette.primary.light}
```

**Change 4 — use color in SearchResultRow:** In `SearchResultRow`, receive `highlightColor` and pass it to `highlightText` calls:

- Label call: `highlightText(item.label, query, 700, highlightColor)`
- Description call: `highlightText(item.description, query, 400, highlightColor)`
  - Note: the current code uses `600` here — this intentionally changes it to `400` to match the surrounding `variant="caption"` text weight. The highlight adds color only, no weight increase. This is a deliberate spec decision.

- [ ] **Step 4: Run all frontend tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SearchModal.test.tsx
```
Expected: all tests pass including the new GROUP_ORDER test.

Also run the full frontend test suite to catch any regressions:
```bash
cd frontend && npm run test
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/SearchModal.tsx frontend/src/components/common/__tests__/SearchModal.test.tsx
git commit -m "feat(search): move pages section last, add primary.light highlight color to search results"
```

---

## Final Verification

- [ ] **Run full backend test suite**

```bash
cd backend && npm run test
```
Expected: all tests pass.

- [ ] **Run full frontend test suite**

```bash
cd frontend && npm run test
```
Expected: all tests pass.

- [ ] **Manual QA checklist** (in running app — `docker compose up -d` or local dev servers)

Test these searches in the Global Search modal (Ctrl+K or wherever it's triggered):

| Query | Expected top result type | Expected page section position |
|-------|--------------------------|-------------------------------|
| `customer` | Customers section first | Pages section last |
| `invoice` | Invoices section first | Pages section last |
| `[exact customer name]` | That exact customer at top, score 123+ | — |
| `[exact order number]` | That exact order at top | — |
| `sales` | Sales section first, Pages section last | Page descriptions show "Sales" not "Navigation" |
| `dashboard` | Dashboard page description = "Dashboard" | — |
| `product summary` | Report page description = "Report" (not "Sales") | — |
| `audit` | Audit Logs page description = "Audit" | — |
| Any 2-char query | Highlights in results use blue/primary color | — |
