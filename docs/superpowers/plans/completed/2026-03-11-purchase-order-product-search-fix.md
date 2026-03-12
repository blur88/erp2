# Purchase Order Product Search Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the product search dropdown in Create/Edit Purchase Order so it shows only results matching the current search term instead of accumulating all previous results.

**Architecture:** Replace the merge logic in `loadProducts` with a simple state replacement. The Autocomplete value is controlled independently of the options list, so replacing options does not clear selected values. The edit-mode product seeding in `loadPurchaseOrder` is unrelated and stays as-is.

**Tech Stack:** React 19, MUI Autocomplete, react-hook-form, Vitest

---

## Chunk 1: Fix and test

### Task 1: Write the failing test

**Files:**
- Test: `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx` (create)

The project uses a `__tests__/` subdirectory under each page folder (e.g. `frontend/src/pages/purchasing/__tests__/`). Place the test file there.

- [ ] **Step 1: Confirm the __tests__ directory exists**

```bash
ls frontend/src/pages/purchasing/__tests__/
```

Expected: Directory exists (may be empty).

- [ ] **Step 2: Write the failing test**

Create `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import CreatePurchaseOrderPage from '../CreatePurchaseOrderPage'

// Minimal mock store
const mockStore = configureStore({
  reducer: {
    purchasing: (state = {}) => state,
  },
})

// Mock RTK Query hooks
vi.mock('@/store/api/purchasingApi', () => ({
  useCreatePurchaseOrderMutation: () => [vi.fn(), {}],
  useGetSuppliersQuery: () => ({ data: { data: [] } }),
  useUpdatePurchaseOrderMutation: () => [vi.fn(), {}],
  useLazyGetPurchaseOrderQuery: () => [vi.fn()],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: 'USD' }),
}))

vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => vi.fn(),
}))

vi.mock('@/store/slices/purchasingSlice', () => ({
  updatePurchaseOrderInPlace: vi.fn(),
}))

// Mock api service
const mockGet = vi.fn()
vi.mock('@/services/api', () => ({
  default: { get: mockGet },
}))

const renderPage = () =>
  render(
    <Provider store={mockStore}>
      <MemoryRouter>
        <CreatePurchaseOrderPage />
      </MemoryRouter>
    </Provider>
  )

describe('CreatePurchaseOrderPage - product search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Initial load: returns product A
    mockGet.mockResolvedValueOnce({ data: { data: [{ id: '1', name: 'Alpha Widget', baseCost: 10 }] } })
  })

  it('replaces search results on each new search instead of accumulating them', async () => {
    const user = userEvent.setup()
    renderPage()

    // Wait for initial load
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))

    // Second search returns only "Beta Gadget"
    mockGet.mockResolvedValueOnce({ data: { data: [{ id: '2', name: 'Beta Gadget', baseCost: 20 }] } })

    // Open the product autocomplete and type "B"
    const input = screen.getByPlaceholderText('Search by name or barcode...')
    await user.click(input)
    await user.type(input, 'B')

    // Wait for the second API call
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))

    // "Alpha Widget" should NOT appear — it was from the previous search
    expect(screen.queryByText('Alpha Widget')).toBeNull()

    // "Beta Gadget" SHOULD appear
    expect(await screen.findByText('Beta Gadget')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx
```

Expected: FAIL with the assertion `expect(screen.queryByText('Alpha Widget')).toBeNull()` — because with the current (buggy) merge logic, "Alpha Widget" is still in the `products` array after the second search and appears in the dropdown.

If the test fails for a different reason (e.g. mock setup error, component crash), fix the mock setup before proceeding — do not move to Task 2 until you have a red test caused by the actual bug.

---

### Task 2: Fix the bug

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx:263-267`

- [ ] **Step 1: Open the file and locate `loadProducts`**

The relevant section is around line 252. The `setProducts` call that merges:

```tsx
// Current (buggy) code at lines ~263-267
setProducts((prevProducts) => {
  const existingIds = new Set(prevProducts.map(p => p.id))
  const productsToAdd = newProducts.filter((p: any) => !existingIds.has(p.id))
  return [...prevProducts, ...productsToAdd]
})
```

- [ ] **Step 2: Replace the merge with a simple replacement**

Change those 5 lines to:

```tsx
setProducts(newProducts)
```

The full `loadProducts` function after the change should look like:

```tsx
const loadProducts = async (searchTerm: string = '') => {
  try {
    const params: any = { isActive: true }
    if (searchTerm && searchTerm.trim().length >= 1) {
      params.search = searchTerm.trim()
    }
    const response = await api.get('/inventory/products', { params })
    console.log('Products loaded:', response) // pre-existing debug log, out of scope
    const newProducts = (response as any).data?.data || []

    setProducts(newProducts)
  } catch (err) {
    console.error('Error loading products:', err)
  }
}
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx
```

Expected: PASS

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx \
        frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx
git commit -m "fix(purchasing): replace product search accumulation with replacement (closes #72)"
```

---

### Task 3: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

(Backend must be running — `docker compose up -d` or `cd backend && npm run start:dev`)

- [ ] **Step 2: Navigate to Create Purchase Order**

Go to `http://localhost:5173/purchasing/orders/new` (or the equivalent local URL).

- [ ] **Step 3: Reproduce the original bug scenario**

1. Click the Product field in the first row.
2. Type "A" — observe results. Note which products appear.
3. Clear the field and type "B".
4. Confirm only products matching "B" appear — no carryover from the "A" search.

- [ ] **Step 4: Verify edit mode still works**

1. Open an existing purchase order in edit mode.
2. Confirm the existing line items still show their products correctly — each row's Product field should be pre-populated with the product name (not blank).
3. Search for a new product in an empty row — confirm the dropdown shows only matching results.
