# FilterBar Phase 4 — Rollout & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shared FilterBar system to 5 remaining list pages (Customers, Suppliers, Payments, Stock Adjustments, User Management) and ship polish improvements to all FilterBar-enabled pages.

**Architecture:** Shared component polish first (reset button, chip spacing, ListSkeleton loading component), then sequential per-page migration using the established config-driven pattern. Each page migration is independently committable. The Payments page includes a backend fix to wire up `search` in `payment.service.ts findAll`.

**Tech Stack:** React 19, MUI v7, RTK Query, React Router v6 (URL sync via `window.history.replaceState`), Vitest + React Testing Library, NestJS 11 (backend fix only for Payments)

**Spec:** `docs/superpowers/specs/2026-03-26-filterbar-phase4-design.md`

---

## File Map

### New files
- `frontend/src/components/common/ListSkeleton.tsx` — shared skeleton for list pages (initial load)

### Modified: shared FilterBar components
- `frontend/src/components/filters/FilterBar.tsx` — reset button style + spacing
- `frontend/src/components/filters/ActiveFilterChips.tsx` — chip row margin-top

### Modified: backend
- `backend/src/modules/sales/services/payment.service.ts` — wire `search` param into `findAll`

### Modified: per-page (one per task)
- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/settings/UserManagementPage.tsx`

### New test files (one per page)
- `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx`
- `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`
- `frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx`
- `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx`
- `frontend/src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx`

---

## Task 1: Shared Component Polish

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Modify: `frontend/src/components/filters/ActiveFilterChips.tsx`

- [ ] **Step 1: Update Reset button in FilterBar.tsx**

Find the Reset button render (search for `Reset` in the file). Change it from:
```tsx
{hasActiveFilters ? (
  <Button size="small" onClick={handlers.onClearAll}>
    Reset
  </Button>
) : null}
```
To:
```tsx
{hasActiveFilters ? (
  <Button size="small" variant="outlined" color="inherit" sx={{ ml: 1 }} onClick={handlers.onClearAll}>
    Reset
  </Button>
) : null}
```

- [ ] **Step 2: Update chip row spacing in ActiveFilterChips.tsx**

Find the Stack in `ActiveFilterChips.tsx`. Change `sx={{ pt: 1 }}` to `sx={{ mt: '7px' }}`:
```tsx
<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: '7px' }}>
```

- [ ] **Step 3: Run existing FilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/ --reporter=verbose
```
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx frontend/src/components/filters/ActiveFilterChips.tsx
git commit -m "feat(filters): polish reset button hierarchy and chip row spacing"
```

---

## Task 2: ListSkeleton Component

**Files:**
- Create: `frontend/src/components/common/ListSkeleton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/common/ListSkeleton.tsx
import { Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'

interface Props {
  rows?: number
  columns?: number
}

export function ListSkeleton({ rows = 8, columns = 4 }: Props) {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableCell key={i}>
                <Skeleton variant="rectangular" height={20} />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <TableRow key={rowIdx}>
              {Array.from({ length: columns }).map((_, colIdx) => (
                <TableCell key={colIdx}>
                  <Skeleton variant="rectangular" height={18} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default ListSkeleton
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|ListSkeleton" | head -20
```
Expected: no errors referencing ListSkeleton

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/ListSkeleton.tsx
git commit -m "feat(common): add ListSkeleton component for list page loading states"
```

---

## Task 3: Payments Backend Fix

**Files:**
- Modify: `backend/src/modules/sales/services/payment.service.ts:150-195`

- [ ] **Step 1: Wire search into findAll**

Open `backend/src/modules/sales/services/payment.service.ts`. In `findAll` at line ~151, the destructuring currently reads:
```typescript
const {
  customerId,
  invoiceId,
  fromDate,
  toDate,
  sortBy = 'paymentDate',
  sortOrder = 'DESC',
} = query;
```

Add `search` to the destructuring:
```typescript
const {
  customerId,
  invoiceId,
  fromDate,
  toDate,
  search,
  sortBy = 'paymentDate',
  sortOrder = 'DESC',
} = query;
```

Then after the existing `.orderBy(...)` call on the queryBuilder (before `getManyAndCount()`), add:
```typescript
if (search) {
  queryBuilder.andWhere(
    '(payment.paymentNumber ILIKE :search OR customer.name ILIKE :search)',
    { search: `%${search}%` }
  );
}
```

The `customer` join (`leftJoinAndSelect('payment.customer', 'customer')`) is already present — do not add it again.

- [ ] **Step 2: Run backend tests**

```bash
cd backend && npx jest src/modules/sales --no-coverage 2>&1 | tail -20
```
Expected: all pass (no regressions)

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/sales/services/payment.service.ts
git commit -m "fix(payments): wire search param into findAll for payment number and customer name filtering"
```

---

## Task 4: Customers Page FilterBar

Follow the ProductsPage pattern exactly. CustomersPage is currently a large monolithic component using `useSearchAndFilter` — we replace only the filter portion.

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Create: `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx`

**Filter config:**
```typescript
interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'individual' | 'business' | null
}

const filterConfig = useMemo<FilterBarConfig<CustomerFilters>>(() => ({
  search: { placeholder: 'Search by name or phone...' },
  quick: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ],
  advanced: [
    {
      field: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'individual', label: 'Individual' },
        { value: 'business', label: 'Business' },
      ],
    },
  ],
  defaults: { search: '', status: null, type: null },
}), [])
```

**Query params mapping:**
```typescript
const customerQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  isActive:
    appliedFilters.status === 'active' ? true
    : appliedFilters.status === 'inactive' ? false
    : undefined,
  type: appliedFilters.type ?? undefined,
}), [appliedFilters])
```

**Loading pattern** (apply to the table area):
```tsx
{(isLoading || (isFetching && !customersResponse)) ? (
  <ListSkeleton rows={8} columns={4} />
) : (
  <Box sx={{ opacity: isFetching ? 0.6 : 1, position: 'relative' }}>
    {isFetching && (
      <CircularProgress size={16} sx={{ position: 'absolute', top: 8, right: 8 }} />
    )}
    {/* existing table JSX */}
  </Box>
)}
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomersPage from '../CustomersPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetCustomersQuery } = vi.hoisted(() => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery,
  useCreateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
  useDeleteCustomerMutation: vi.fn(() => [vi.fn(), {}]),
  useUpdateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <CustomersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomersPage FilterBar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or phone/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes them to query', () => {
    renderPage('/?search=acme&status=active&type=business')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'acme', isActive: true, type: 'business' }),
    )
  })

  it('passes no isActive when status is unset', () => {
    renderPage('/')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx --reporter=verbose
```
Expected: FAIL (FilterBar not yet in CustomersPage)

- [ ] **Step 3: Migrate CustomersPage to FilterBar**

In `CustomersPage.tsx`:
1. Add imports: `import { FilterBar, useFilterBar } from '@/components/filters'` and `import type { FilterBarConfig } from '@/components/filters'`
2. Add import: `import { ListSkeleton } from '@/components/common/ListSkeleton'`
3. Add import: `import { useLocation } from 'react-router-dom'` (if not present)
4. Remove the old `useSearchAndFilter` call and its local search/filter state variables
5. Add the `CustomerFilters` interface and `filterConfig` (as above)
6. Add `useFilterBar(filterConfig)` call
7. Add `customerQueryParams` useMemo (as above)
8. Replace the existing `useGetCustomersQuery(...)` args with `customerQueryParams`
9. Replace the inline search `<TextField>` and status `<Select>` with `<FilterBar ...>`
10. Apply the loading pattern to the table area

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx --reporter=verbose
```
Expected: all 3 pass

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
git commit -m "feat(customers): migrate CustomersPage to shared FilterBar system"
```

---

## Task 5: Suppliers Page FilterBar

Mirror of Task 4. The Suppliers page uses Redux slice state (`selectSupplierFilters`) for filters — replace with `useFilterBar`.

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Create: `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`

**Filter config:**
```typescript
interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'local' | 'international' | null
}

const filterConfig = useMemo<FilterBarConfig<SupplierFilters>>(() => ({
  search: { placeholder: 'Search by company name...' },
  quick: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ],
  advanced: [
    {
      field: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'local', label: 'Local' },
        { value: 'international', label: 'International' },
      ],
    },
  ],
  defaults: { search: '', status: null, type: null },
}), [])
```

**Query params mapping:**
```typescript
const supplierQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  isActive:
    appliedFilters.status === 'active' ? true
    : appliedFilters.status === 'inactive' ? false
    : undefined,
  type: appliedFilters.type ?? undefined,
}), [appliedFilters])
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SuppliersPage from '../SuppliersPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const { useGetSuppliersQuery } = vi.hoisted(() => ({
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery,
  useCreateSupplierMutation: vi.fn(() => [vi.fn(), {}]),
  useDeleteSupplierMutation: vi.fn(() => [vi.fn(), {}]),
  useUpdateSupplierMutation: vi.fn(() => [vi.fn(), {}]),
  useLazyCheckDuplicateCompanyNameQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { purchasing: purchasingReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <SuppliersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('SuppliersPage FilterBar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by company name/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes them to query', () => {
    renderPage('/?search=acme&status=inactive&type=international')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'acme', isActive: false, type: 'international' }),
    )
  })

  it('passes no isActive when status is unset', () => {
    renderPage('/')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx --reporter=verbose
```
Expected: FAIL

- [ ] **Step 3: Migrate SuppliersPage to FilterBar**

Same pattern as CustomersPage:
1. Add FilterBar imports + ListSkeleton import
2. Remove `useSearchAndFilter`, `selectSupplierFilters`, `setSupplierFilters` usage (and their imports if unused after)
3. Add `SupplierFilters` interface, `filterConfig`, `useFilterBar`
4. Add `supplierQueryParams` useMemo
5. Replace `useGetSuppliersQuery(...)` args with `supplierQueryParams`
6. Replace inline search TextField + type Select with `<FilterBar ...>`
7. Apply loading pattern to table area

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx --reporter=verbose
```
Expected: all 3 pass

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/SuppliersPage.tsx frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
git commit -m "feat(suppliers): migrate SuppliersPage to shared FilterBar system"
```

---

## Task 6: Payments Page FilterBar

The Payments page has one unique behavior: when opened from a customer profile (via `location.state.customerId`), the `customerId` filter is preset and locked (no × chip).

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`
- Create: `frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx`

**Filter config:**
```typescript
interface PaymentFilters {
  search: string
  dateRange: DateRangeValue
  customerId: string | null
}

// In the component, after loading customers:
const filterConfig = useMemo<FilterBarConfig<PaymentFilters>>(() => ({
  search: { placeholder: 'Search by payment number or customer...' },
  quick: [
    {
      field: 'dateRange',
      label: 'Date',
      type: 'date-range',
      paramKey: 'paymentDate',
    },
  ],
  advanced: [
    {
      field: 'customerId',
      label: 'Customer',
      type: 'select',
      options: customers.map((c) => ({ value: c.id, label: c.name })),
      chipFormatter: (value) => {
        if (!value) return null as unknown as string
        const customer = customers.find((c) => c.id === value)
        return `Customer: ${customer?.name ?? value}`
      },
    },
  ],
  defaults: { search: '', dateRange: { from: null, to: null }, customerId: null },
}), [customers])
```

**Query params mapping:**
```typescript
const paymentQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  fromDate: appliedFilters.dateRange.from ?? undefined,
  toDate: appliedFilters.dateRange.to ?? undefined,
  customerId: appliedFilters.customerId ?? undefined,
}), [appliedFilters])
```

**Context preset (customer profile navigation):**

`useFilterBar` reads `window.location.search` once on mount via a ref. To preset `customerId` from navigation state, write it into the URL *before* the hook initializes. Do this by calling `window.history.replaceState` in a `useMemo` that runs before `useFilterBar`:

```typescript
const location = useLocation()
const presetCustomerId = (location.state as { customerId?: string } | null)?.customerId ?? null

// Inject preset into URL before useFilterBar reads it on mount.
// useMemo runs synchronously during render, before any effects.
useMemo(() => {
  if (presetCustomerId) {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('customerId')) {
      params.set('customerId', presetCustomerId)
      window.history.replaceState(null, '', `${location.pathname}?${params.toString()}`)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []) // mount-only: intentional

// useFilterBar is called AFTER the above useMemo — it will see customerId in the URL
```

This works because `useFilterBar` captures `location.search` into a ref (`mountSearchRef`) at the top of the hook, which reads `window.location.search` synchronously — so the `replaceState` call above happens first.

**Locked chip rendering:** `FilterBar` renders `ActiveFilterChips` internally. To prevent a removable chip for `customerId` appearing inside `FilterBar` when it's locked, pass a filtered `activeChips` to `FilterBar` that excludes `customerId`. Then render the locked chip manually *outside* `<FilterBar>`, below it:

```tsx
{/* Pass chips to FilterBar with customerId excluded when locked */}
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  activeChips={presetCustomerId
    ? activeChips.filter((chip) => chip.field !== 'customerId')
    : activeChips}
  hasActiveFilters={hasActiveFilters}
  hasUnappliedChanges={hasUnappliedChanges}
/>

{/* Render locked customer chip outside FilterBar */}
{presetCustomerId && (
  <Stack direction="row" sx={{ mt: '7px' }}>
    <Chip
      label={`Customer: ${customers.find((c) => c.id === presetCustomerId)?.name ?? presetCustomerId}`}
      size="small"
      variant="filled"
    />
  </Stack>
)}
```

This keeps `FilterBar` unchanged while giving the locked chip its own rendering path with no × button.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentsPage from '../PaymentsPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetPaymentsQuery } = vi.hoisted(() => ({
  useGetPaymentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetPaymentsQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Acme Corp' }], meta: { total: 1 } },
  })),
  useDeletePaymentMutation: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/', state?: unknown) {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: initialUrl, state }]}>
        <PaymentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PaymentsPage FilterBar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by payment number or customer/i)).toBeInTheDocument()
  })

  it('restores date range from URL and passes to query', () => {
    renderPage('/?paymentDate_from=2026-01-01&paymentDate_to=2026-03-31')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromDate: '2026-01-01', toDate: '2026-03-31' }),
    )
  })

  it('presets customerId from URL when navigated from customer profile', () => {
    // The component writes location.state.customerId into the URL before useFilterBar mounts.
    // In tests, simulate this by passing the URL directly (the component would write it on a real nav).
    renderPage('/?customerId=cust-1')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
    )
  })

  it('renders locked chip (no × button) when customerId is preset via location state', () => {
    renderPage('/', { customerId: 'cust-1' })
    // The component writes cust-1 into the URL via replaceState; useFilterBar reads it on mount.
    // The locked chip renders the customer name from the customers list.
    const chip = screen.getByText(/customer: acme corp/i)
    expect(chip).toBeInTheDocument()
    const chipEl = chip.closest('[class*="MuiChip"]')
    expect(chipEl?.querySelector('[data-testid="CancelIcon"]')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx --reporter=verbose
```
Expected: FAIL

- [ ] **Step 3: Migrate PaymentsPage to FilterBar**

1. Add imports: `FilterBar`, `useFilterBar`, `FilterBarConfig`, `DateRangeValue`, `ListSkeleton`, `useLocation`
2. Add `useGetCustomersQuery` import from salesApi
3. Remove old inline search TextField and customer Select
4. Remove old `useSearchAndFilter` state
5. Add `PaymentFilters` interface and `filterConfig` (customers loaded first so options are available)
6. Add `presetCustomerId` from location state
7. Add the `useMemo` URL-inject block (see Context Preset section above) — this MUST appear before `useFilterBar` is called
8. Call `useFilterBar(filterConfig)` after the preset useMemo
9. Add `paymentQueryParams` useMemo
10. Replace `useGetPaymentsQuery(...)` args with `paymentQueryParams`
11. Render locked chip manually + filter it from `activeChips` as shown in the locked chip section above
12. Apply loading pattern to table area

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx --reporter=verbose
```
Expected: all 4 pass

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/PaymentsPage.tsx frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
git commit -m "feat(payments): migrate PaymentsPage to shared FilterBar with context preset and locked chip"
```

---

## Task 7: Stock Adjustments Page FilterBar

**Files:**
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- Create: `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx`

**Filter config:**
```typescript
interface StockAdjustmentFilters {
  search: string
  status: 'draft' | 'completed' | null
  dateRange: DateRangeValue
}

const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(() => ({
  search: { placeholder: 'Search by adjustment number or notes...' },
  quick: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'completed', label: 'Completed' },
      ],
    },
  ],
  advanced: [
    {
      field: 'dateRange',
      label: 'Date',
      type: 'date-range',
      paramKey: 'adjustmentDate',
    },
  ],
  defaults: { search: '', status: null, dateRange: { from: null, to: null } },
}), [])
```

**Query params mapping:**
```typescript
const adjustmentQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  status: appliedFilters.status ?? undefined,
  fromDate: appliedFilters.dateRange.from ?? undefined,
  toDate: appliedFilters.dateRange.to ?? undefined,
}), [appliedFilters])
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StockAdjustmentsPage from '../StockAdjustmentsPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetStockAdjustmentsQuery } = vi.hoisted(() => ({
  useGetStockAdjustmentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetStockAdjustmentsQuery,
  useLazyGetStockAdjustmentQuery: vi.fn(() => [vi.fn(), { data: undefined }]),
  useCompleteStockAdjustmentMutation: vi.fn(() => [vi.fn(), {}]),
  useDeleteStockAdjustmentMutation: vi.fn(() => [vi.fn(), {}]),
  useUncompleteStockAdjustmentMutation: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { inventory: inventoryReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <StockAdjustmentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('StockAdjustmentsPage FilterBar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by adjustment number or notes/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes to query', () => {
    renderPage('/?status=draft&adjustmentDate_from=2026-01-01')
    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft', fromDate: '2026-01-01' }),
    )
  })

  it('passes no status when unset', () => {
    renderPage('/')
    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    )
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx --reporter=verbose
```
Expected: FAIL

- [ ] **Step 3: Migrate StockAdjustmentsPage to FilterBar**

Same pattern as Customers/Suppliers:
1. Add FilterBar + ListSkeleton imports
2. Remove old inline search TextField + status Select
3. Remove old `useSearchAndFilter` state
4. Add `StockAdjustmentFilters` interface, `filterConfig`, `useFilterBar`
5. Add `adjustmentQueryParams` useMemo
6. Replace `useGetStockAdjustmentsQuery(...)` args with `adjustmentQueryParams`
7. Replace inline filters with `<FilterBar ...>`
8. Apply loading pattern to table area

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx --reporter=verbose
```
Expected: all 3 pass

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/StockAdjustmentsPage.tsx frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
git commit -m "feat(inventory): migrate StockAdjustmentsPage to shared FilterBar system"
```

---

## Task 8: User Management Page FilterBar

User Management is in `frontend/src/pages/settings/UserManagementPage.tsx`. It currently manages filter state locally (`searchQuery`, `roleFilter`, `statusFilter`). No advanced filters — the "More Filters" button is automatically hidden when `config.advanced.length === 0`.

**Files:**
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`
- Create: `frontend/src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx`

**Filter config:**
```typescript
interface UserFilters {
  search: string
  role: 'admin' | 'manager' | 'sales_staff' | 'inventory_staff' | 'procurement_staff' | null
  status: 'active' | 'inactive' | 'suspended' | null
}

const filterConfig = useMemo<FilterBarConfig<UserFilters>>(() => ({
  search: { placeholder: 'Search by name, email, or username...' },
  quick: [
    {
      field: 'role',
      label: 'Role',
      type: 'select',
      options: [
        { value: 'admin', label: 'Admin' },
        { value: 'manager', label: 'Manager' },
        { value: 'sales_staff', label: 'Sales Staff' },
        { value: 'inventory_staff', label: 'Inventory Staff' },
        { value: 'procurement_staff', label: 'Procurement Staff' },
      ],
    },
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
        { value: 'suspended', label: 'Suspended' },
      ],
    },
  ],
  advanced: [],
  defaults: { search: '', role: null, status: null },
}), [])
```

**Query params mapping:**
```typescript
const userQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  role: appliedFilters.role ?? undefined,
  status: appliedFilters.status ?? undefined,
}), [appliedFilters])
```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserManagementPage from '../UserManagementPage'
import authReducer from '@/store/slices/authSlice'

const { useGetUsersQuery } = vi.hoisted(() => ({
  useGetUsersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/userManagementApi', () => ({
  useGetUsersQuery,
  useGetStatisticsQuery: vi.fn(() => ({ data: undefined })),
  useDeactivateUserMutation: vi.fn(() => [vi.fn(), {}]),
  useUnlockUserMutation: vi.fn(() => [vi.fn(), {}]),
  useUpdateUserMutation: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: { id: 'u1', role: 'admin' }, token: 'tok' } },
  })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <UserManagementPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('UserManagementPage FilterBar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name, email, or username/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes to query', () => {
    renderPage('/?role=manager&status=active&search=john')
    expect(useGetUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ role: 'manager', status: 'active', search: 'john' }),
    )
  })

  it('does not render More Filters button (no advanced filters)', () => {
    renderPage()
    expect(screen.queryByText(/more filters/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx --reporter=verbose
```
Expected: FAIL

- [ ] **Step 3: Migrate UserManagementPage to FilterBar**

1. Add FilterBar + ListSkeleton imports
2. Remove local `searchQuery`, `roleFilter`, `statusFilter` state
3. Remove `useLocation` / `useNavigate` URL sync if it exists locally
4. Add `UserFilters` interface, `filterConfig`, `useFilterBar`
5. Add `userQueryParams` useMemo
6. Replace `useGetUsersQuery(...)` args with `userQueryParams`
7. Replace inline search TextField + role Select + status Select with `<FilterBar ...>`
8. Apply loading pattern to table area

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx --reporter=verbose
```
Expected: all 3 pass

- [ ] **Step 5: Run the full test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```
Expected: all pass (no regressions across the project)

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/settings/UserManagementPage.tsx frontend/src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx
git commit -m "feat(users): migrate UserManagementPage to shared FilterBar system"
```

---

## Final Verification

- [ ] **Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```
Expected: all pass

- [ ] **Run full backend test suite**

```bash
cd backend && npm run test 2>&1 | tail -20
```
Expected: all pass

- [ ] **TypeScript check**

```bash
cd frontend && npm run type-check && cd ../backend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

---

## Notes for Implementer

**CustomersPage is large (~800 lines).** It contains inline CRUD dialogs. When migrating, only touch the filter-related parts — do not refactor other sections.

**SuppliersPage uses Redux slice for filter state** (`selectSupplierFilters` / `setSupplierFilters`). After migration, the Redux filter state for suppliers is no longer needed in the page. Remove only the usage from the page; leave the slice untouched if it's used elsewhere.

**PaymentsPage context preset:** The preset is injected via `window.history.replaceState` in a `useMemo` *before* `useFilterBar` is called. This is intentional — `useFilterBar` reads the URL once on mount via `mountSearchRef`, so the replaceState must happen synchronously during the same render. Do NOT use `useEffect` for this — effects run after render, after `useFilterBar` has already captured its mount URL. The `useMemo` with an empty dep array (and an ESLint disable comment) is the correct pattern here.

**chipFormatter returning null:** TypeScript will complain that `chipFormatter` must return `string`. Cast: `return null as unknown as string`. The chip derivation logic in `filterBar.chips.ts` checks for falsy before rendering a chip, so `null` suppresses it correctly.

**UserManagementPage authSlice shape:** The page reads `state.auth?.user` for the current user. The test's `preloadedState` must match the auth slice's initial state shape — check `authSlice` if the test fails due to selector errors.
