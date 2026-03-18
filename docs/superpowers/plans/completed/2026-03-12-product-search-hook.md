# Product Search Hook Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix product search filtering on `CreateSalesOrderPage` (issue #88) and eliminate duplication by extracting a shared `useProductSearch` hook used by both SO and PO pages.

**Architecture:** A new `useProductSearch` hook owns the `products` state, stale-request guard, `loadProducts` (replace-on-search), and `seedProducts` (edit-mode pre-population). Both `CreateSalesOrderPage` and `CreatePurchaseOrderPage` adopt the hook, removing inline duplicated logic. The SO page Autocomplete also gets two prop fixes to match the already-correct PO implementation.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, `@testing-library/react-hooks` (via `renderHook`), MUI v7 Autocomplete, `ApiService` (Axios wrapper at `@/services/api`)

---

## Chunk 1: `useProductSearch` hook + unit tests

**Files:**
- Create: `frontend/src/hooks/useProductSearch.ts`
- Create: `frontend/src/hooks/useProductSearch.test.ts`

---

### Task 1: Write failing unit tests for `useProductSearch`

**Files:**
- Create: `frontend/src/hooks/useProductSearch.test.ts`

- [ ] **Step 1: Create the test file**

```ts
// frontend/src/hooks/useProductSearch.test.ts
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

import { useProductSearch } from './useProductSearch'

const makeProduct = (id: string, name: string) => ({ id, name })

describe('useProductSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with an empty products list', () => {
    const { result } = renderHook(() => useProductSearch())
    expect(result.current.products).toEqual([])
  })

  it('loadProducts replaces the list with API results', async () => {
    mockGet.mockResolvedValue({ data: { data: [makeProduct('1', 'Alpha')] } })
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())

    expect(result.current.products).toEqual([makeProduct('1', 'Alpha')])
    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { isActive: true },
    })
  })

  it('loadProducts sends search param when searchTerm is provided', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } })
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts('apple'))

    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { isActive: true, search: 'apple' },
    })
  })

  it('loadProducts replaces the list, not merges', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [makeProduct('1', 'Alpha')] } })
      .mockResolvedValueOnce({ data: { data: [makeProduct('2', 'Beta')] } })
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())
    await act(() => result.current.loadProducts('B'))

    expect(result.current.products).toEqual([makeProduct('2', 'Beta')])
    expect(result.current.products).not.toContainEqual(makeProduct('1', 'Alpha'))
  })

  it('loadProducts discards stale responses (race condition guard)', async () => {
    let resolveFirst!: (v: any) => void
    let resolveSecond!: (v: any) => void
    const first = new Promise((res) => { resolveFirst = res })
    const second = new Promise((res) => { resolveSecond = res })

    mockGet
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)

    const { result } = renderHook(() => useProductSearch())

    // Fire both requests without awaiting
    act(() => { result.current.loadProducts('a') })
    act(() => { result.current.loadProducts('b') })

    // Resolve second first (it should win)
    await act(async () => {
      resolveSecond({ data: { data: [makeProduct('2', 'Second')] } })
      await Promise.resolve()
    })

    // Resolve first late (should be discarded)
    await act(async () => {
      resolveFirst({ data: { data: [makeProduct('1', 'First')] } })
      await Promise.resolve()
    })

    expect(result.current.products).toEqual([makeProduct('2', 'Second')])
  })

  it('seedProducts merges products without duplicates', () => {
    const { result } = renderHook(() => useProductSearch())

    act(() => result.current.seedProducts([makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')]))
    act(() => result.current.seedProducts([makeProduct('2', 'Beta'), makeProduct('3', 'Gamma')]))

    expect(result.current.products).toHaveLength(3)
    expect(result.current.products.map(p => p.id)).toEqual(['1', '2', '3'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/hooks/useProductSearch.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module './useProductSearch'`

---

### Task 2: Implement `useProductSearch`

**Files:**
- Create: `frontend/src/hooks/useProductSearch.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/hooks/useProductSearch.ts
import { useState, useRef } from 'react'
import { ApiService } from '@/services/api'

export function useProductSearch() {
  const [products, setProducts] = useState<any[]>([])
  const latestRequestRef = useRef(0)

  const loadProducts = async (searchTerm: string = '') => {
    const requestId = ++latestRequestRef.current

    try {
      const params: any = { isActive: true }
      if (searchTerm && searchTerm.trim().length >= 1) {
        params.search = searchTerm.trim()
      }
      const response = await ApiService.get('/inventory/products', { params })

      if (requestId !== latestRequestRef.current) {
        return
      }

      const newProducts = (response as any).data?.data || []
      setProducts(newProducts)
    } catch (err) {
      console.error('Error loading products:', err)
    }
  }

  const seedProducts = (incoming: any[]) => {
    setProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id))
      const toAdd = incoming.filter((p) => !existingIds.has(p.id))
      return [...prev, ...toAdd]
    })
  }

  return { products, loadProducts, seedProducts }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/hooks/useProductSearch.test.ts --no-coverage
```

Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useProductSearch.ts frontend/src/hooks/useProductSearch.test.ts
git commit -m "feat: add useProductSearch hook with race condition guard"
```

---

## Chunk 2: Fix `CreateSalesOrderPage`

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- Create: `frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx`

---

### Task 3: Write failing integration tests for SO product search

The test structure mirrors the existing PO tests at `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx`. Read those tests before starting — the mock setup is nearly identical.

**Files:**
- Create: `frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx`

- [ ] **Step 1: Create the test file**

```ts
// frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import CreateSalesOrderPage from '../CreateSalesOrderPage'

const replacementSearchTerm = 'B'

const {
  mockDispatch,
  mockGet,
  mockCreateSalesOrder,
  mockUpdateSalesOrder,
  mockFetchSalesOrder,
  mockParams,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockGet: vi.fn(),
  mockCreateSalesOrder: vi.fn(),
  mockUpdateSalesOrder: vi.fn(),
  mockFetchSalesOrder: vi.fn(),
  mockParams: vi.fn(() => ({})),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => mockParams() }
})

vi.mock('@/hooks/useRedux', () => ({ useAppDispatch: () => mockDispatch }))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: '$' }),
}))

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery: () => ({ data: { data: [{ id: 'customer-1', name: 'Test Customer' }] } }),
  useCreateSalesOrderMutation: () => [mockCreateSalesOrder],
  useUpdateSalesOrderMutation: () => [mockUpdateSalesOrder],
  useLazyGetSalesOrderQuery: () => [mockFetchSalesOrder],
}))

vi.mock('@/store/api/salesOrderCache', () => ({
  patchSalesOrderCaches: vi.fn(),
}))

vi.mock('@/store/slices/salesSlice', () => ({
  setSelectedOrder: vi.fn((v) => ({ type: 'sales/setSelectedOrder', payload: v })),
}))

describe('CreateSalesOrderPage — product search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})

    mockGet.mockImplementation(async (_url: string, config?: { params?: { search?: string } }) => {
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: { data: [{ id: 'product-2', name: 'Beta Gadget', basePrice: 22 }] } }
      }
      return { data: { data: [{ id: 'product-1', name: 'Alpha Widget', basePrice: 11 }] } }
    })
  })

  it('replaces autocomplete options with only the latest search results', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><CreateSalesOrderPage /></BrowserRouter>)

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    await user.click(productInput)

    const initialListbox = await screen.findByRole('listbox')
    expect(within(initialListbox).getByText('Alpha Widget')).toBeInTheDocument()

    await user.clear(productInput)
    await user.type(productInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    const updatedListbox = await screen.findByRole('listbox')
    expect(within(updatedListbox).getByText('Beta Gadget')).toBeInTheDocument()
    expect(within(updatedListbox).queryByText('Alpha Widget')).toBeNull()
  })

  it('keeps the selected product visible when another search replaces the shared options list', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><CreateSalesOrderPage /></BrowserRouter>)

    const [firstProductInput] = screen.getAllByPlaceholderText('Search by name or barcode...')
    await user.click(firstProductInput)

    const initialListbox = await screen.findByRole('listbox')
    await user.click(within(initialListbox).getByText('Alpha Widget'))

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })

    await user.click(screen.getByRole('button', { name: /add item/i }))

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const secondProductInput = productInputs[1]

    await user.click(secondProductInput)
    await user.type(secondProductInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })
  })

  it('keeps hydrated edit-mode product visible after search replaces options', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ id: 'so-1' })

    mockFetchSalesOrder.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        data: {
          id: 'so-1',
          customerId: 'customer-1',
          orderDate: '2026-03-01T00:00:00.000Z',
          shippingAmount: 0,
          items: [
            {
              productId: 'product-9',
              quantity: 2,
              unitPrice: 44,
              discountType: 'percentage',
              discountValue: 0,
              discountPercent: 0,
              discountAmount: 0,
              totalPrice: 88,
              product: { id: 'product-9', name: 'Hydrated Product', basePrice: 44 },
            },
          ],
        },
      }),
    })

    render(<BrowserRouter><CreateSalesOrderPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Hydrated Product')).toBeInTheDocument()
    })

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const firstProductInput = productInputs[0]

    await user.type(firstProductInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Hydrated Product')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx --no-coverage
```

Expected: Tests FAIL (merge bug and missing `isOptionEqualToValue` cause assertion failures)

---

### Task 4: Apply fixes to `CreateSalesOrderPage`

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`

There are 4 changes. Make them one at a time.

**Change 1 — Import `useProductSearch` and replace inline state/function**

Find the existing import at the top of the file (around line 36) and add:
```ts
import { useProductSearch } from '@/hooks/useProductSearch'
```

Find (around line 100):
```ts
const [products, setProducts] = useState<any[]>([])
```
Replace with:
```ts
const { products, loadProducts, seedProducts } = useProductSearch()
```

Also remove the entire `loadProducts` function (around lines 315–330):
```ts
const loadProducts = async (searchTerm: string = '') => {
  try {
    const params: any = { isActive: true }
    if (searchTerm && searchTerm.trim().length >= 1) {
      params.search = searchTerm.trim()
    }
    const response = await ApiService.get('/inventory/products', { params })
    const newProducts = (response as any).data || []

    // Merge with existing products to preserve order item products
    setProducts((prevProducts) => {
      const existingIds = new Set(prevProducts.map(p => p.id))
      const productsToAdd = newProducts.filter((p: any) => !existingIds.has(p.id))
      return [...prevProducts, ...productsToAdd]
    })
  } catch (err) {
```

**Change 2 — Replace edit-mode setProducts merge with seedProducts**

Find (around lines 221–225) inside the edit-mode order loading block:
```ts
setProducts((prevProducts) => {
  const existingIds = new Set(prevProducts.map(p => p.id))
  const newProducts = orderProducts.filter((p: any) => !existingIds.has(p.id))
  return [...prevProducts, ...newProducts]
})
```
Replace with:
```ts
seedProducts(orderProducts)
```

**Change 3 — Fix Autocomplete `value` prop**

Find (around line 645):
```ts
value={products.find(p => p.id === productField.value) || null}
```
Replace with:
```ts
value={watchedItems[index]?.product || products.find(p => p.id === productField.value) || null}
```

**Change 4 — Add `isOptionEqualToValue`**

Find (around line 644), inside the same `<Autocomplete`:
```ts
getOptionLabel={(option) => option.name}
```
Replace with:
```ts
getOptionLabel={(option) => option?.name || ''}
isOptionEqualToValue={(option, value) => option.id === value.id}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx --no-coverage
```

Expected: All 3 tests PASS

- [ ] **Step 3: Run full frontend test suite to check for regressions**

```bash
cd frontend && npm run test -- --no-coverage
```

Expected: All tests PASS (no regressions)

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/CreateSalesOrderPage.tsx \
        frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx
git commit -m "fix(sales): fix product search filtering on CreateSalesOrderPage (issue #88)"
```

---

## Chunk 3: Refactor `CreatePurchaseOrderPage` to use hook

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`

---

### Task 5: Refactor `CreatePurchaseOrderPage` to use `useProductSearch`

The PO page already has correct search behavior — this is a pure refactor to remove duplication. The existing PO tests in `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx` serve as the regression guard; no new tests are needed.

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`

- [ ] **Step 1: Run existing PO tests to confirm green baseline**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx --no-coverage
```

Expected: All tests PASS

- [ ] **Step 2: Import `useProductSearch`**

Add to the existing imports at the top:
```ts
import { useProductSearch } from '@/hooks/useProductSearch'
```

- [ ] **Step 3: Replace inline state and ref**

Find (around lines 96–101):
```ts
const [products, setProducts] = useState<any[]>([])
...
const latestProductsRequestRef = React.useRef(0)
```
Replace `const [products, setProducts] = useState<any[]>([])` with:
```ts
const { products, loadProducts, seedProducts } = useProductSearch()
```
Remove the `latestProductsRequestRef` line entirely.

- [ ] **Step 4: Replace edit-mode setProducts merge with seedProducts**

Find (around lines 162–168):
```ts
// Merge with existing products, avoiding duplicates
setProducts((prevProducts) => {
  const existingIds = new Set(prevProducts.map(p => p.id))
  const newProducts = orderProducts.filter((p: any) => !existingIds.has(p.id))
  console.log('Merged products:', [...prevProducts, ...newProducts])
  return [...prevProducts, ...newProducts]
})
```
Replace with:
```ts
seedProducts(orderProducts)
```

- [ ] **Step 5: Remove the inline `loadProducts` function**

Find and delete the entire `loadProducts` function (around lines 257–278):
```ts
const loadProducts = async (searchTerm: string = '') => {
  const requestId = ++latestProductsRequestRef.current

  try {
    const params: any = { isActive: true }
    if (searchTerm && searchTerm.trim().length >= 1) {
      params.search = searchTerm.trim()
    }
    const response = await api.get('/inventory/products', { params })

    if (requestId !== latestProductsRequestRef.current) {
      return
    }

    console.log('Products loaded:', response)
    const newProducts = (response as any).data?.data || []

    setProducts(newProducts)
  } catch (err) {
    console.error('Error loading products:', err)
  }
}
```

Also remove unused imports: `api` (the direct `ApiService` import used only by the old `loadProducts`), if it is no longer referenced elsewhere in the file.

- [ ] **Step 6: Run PO tests to confirm no regressions**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx --no-coverage
```

Expected: All tests PASS

- [ ] **Step 7: Run full frontend test suite**

```bash
cd frontend && npm run test -- --no-coverage
```

Expected: All tests PASS

- [ ] **Step 8: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx
git commit -m "refactor(purchasing): adopt useProductSearch hook in CreatePurchaseOrderPage"
```

---

## Chunk 4: Fix `CreateStockAdjustmentPage`

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- Create: `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`

---

### Task 6: Write failing integration tests for stock adjustment product search

The test structure mirrors the SO tests in Chunk 2. Read `frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx` before starting — the mock setup is nearly identical.

**Files:**
- Create: `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`

- [ ] **Step 1: Create the test file**

```ts
// frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import CreateStockAdjustmentPage from '../CreateStockAdjustmentPage'

const replacementSearchTerm = 'B'

const {
  mockDispatch,
  mockGet,
  mockCreateAdjustment,
  mockUpdateAdjustment,
  mockParams,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn(),
  mockGet: vi.fn(),
  mockCreateAdjustment: vi.fn(),
  mockUpdateAdjustment: vi.fn(),
  mockParams: vi.fn(() => ({})),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => mockParams() }
})

vi.mock('@/hooks/useRedux', () => ({ useAppDispatch: () => mockDispatch }))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: '$' }),
}))

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useCreateStockAdjustmentMutation: () => [mockCreateAdjustment],
  useUpdateStockAdjustmentMutation: () => [mockUpdateAdjustment],
}))
```

> **Note:** Check the actual imports at the top of `CreateStockAdjustmentPage.tsx` to verify the exact RTK Query hook names used (e.g. `useCreateStockAdjustmentMutation`) and the API slice path (`@/store/api/inventoryApi` or similar). Adjust the `vi.mock` block above to match exactly.

```ts
describe('CreateStockAdjustmentPage — product search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.mockReturnValue({})

    mockGet.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
      // Per-product fetch in handleProductSelect
      if (url.includes('/inventory/products/')) {
        const id = url.split('/').pop()
        return { data: { id, name: id === 'product-1' ? 'Alpha Widget' : 'Beta Gadget', stockQuantity: 10 } }
      }
      // List fetch
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: { data: [{ id: 'product-2', name: 'Beta Gadget', stockQuantity: 5 }] } }
      }
      return { data: { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] } }
    })
  })

  it('replaces autocomplete options with only the latest search results', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><CreateStockAdjustmentPage /></BrowserRouter>)

    const productInput = screen.getByPlaceholderText('Search by name or barcode...')
    await user.click(productInput)

    const initialListbox = await screen.findByRole('listbox')
    expect(within(initialListbox).getByText('Alpha Widget')).toBeInTheDocument()

    await user.clear(productInput)
    await user.type(productInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    const updatedListbox = await screen.findByRole('listbox')
    expect(within(updatedListbox).getByText('Beta Gadget')).toBeInTheDocument()
    expect(within(updatedListbox).queryByText('Alpha Widget')).toBeNull()
  })

  it('keeps the selected product visible when another search replaces the shared options list', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><CreateStockAdjustmentPage /></BrowserRouter>)

    const [firstProductInput] = screen.getAllByPlaceholderText('Search by name or barcode...')
    await user.click(firstProductInput)

    const initialListbox = await screen.findByRole('listbox')
    await user.click(within(initialListbox).getByText('Alpha Widget'))

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })

    await user.click(screen.getByRole('button', { name: /add item/i }))

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    const secondProductInput = productInputs[1]

    await user.click(secondProductInput)
    await user.type(secondProductInput, replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(firstProductInput).toHaveValue('Alpha Widget')
    })
  })

  it('keeps hydrated edit-mode product visible after search replaces options', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ id: 'adj-1' })

    // Mock the adjustment fetch endpoint
    mockGet.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
      if (url === '/inventory/stock-adjustments/adj-1') {
        return {
          data: {
            id: 'adj-1',
            adjustmentDate: '2026-03-01T00:00:00.000Z',
            reason: 'Recount',
            items: [
              {
                productId: 'product-9',
                oldQuantity: 5,
                newQuantity: 8,
                difference: 3,
                product: { id: 'product-9', name: 'Hydrated Product', stockQuantity: 5 },
              },
            ],
          },
        }
      }
      if (url.includes('/inventory/products/')) {
        const id = url.split('/').pop()
        return { data: { id, name: id === 'product-1' ? 'Alpha Widget' : 'Beta Gadget', stockQuantity: 10 } }
      }
      if (config?.params?.search?.startsWith(replacementSearchTerm)) {
        return { data: { data: [{ id: 'product-2', name: 'Beta Gadget', stockQuantity: 5 }] } }
      }
      return { data: { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] } }
    })

    render(<BrowserRouter><CreateStockAdjustmentPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Hydrated Product')).toBeInTheDocument()
    })

    const productInputs = screen.getAllByPlaceholderText('Search by name or barcode...')
    await user.type(productInputs[0], replacementSearchTerm)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
        params: { isActive: true, search: replacementSearchTerm },
      })
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Hydrated Product')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx --no-coverage
```

Expected: Tests FAIL (merge bug and missing `isOptionEqualToValue` cause assertion failures)

---

### Task 7: Apply fixes to `CreateStockAdjustmentPage`

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`

**Change 1 — Import `useProductSearch` and replace inline state/function**

Add to imports at the top:
```ts
import { useProductSearch } from '@/hooks/useProductSearch'
```

Find (around line 70):
```ts
const [products, setProducts] = useState<any[]>([])
```
Replace with:
```ts
const { products, loadProducts, seedProducts } = useProductSearch()
```

Remove the entire inline `loadProducts` function (around lines 188–203):
```ts
const loadProducts = async (searchTerm: string = '') => {
  try {
    const params: any = { isActive: true }
    if (searchTerm && searchTerm.trim().length >= 1) {
      params.search = searchTerm.trim()
    }
    const response = await ApiService.get('/inventory/products', { params })
    const newProducts = (response as any).data || []

    // Merge with existing products
    setProducts((prevProducts) => {
      const existingIds = new Set(prevProducts.map(p => p.id))
      const productsToAdd = newProducts.filter((p: any) => !existingIds.has(p.id))
      return [...prevProducts, ...productsToAdd]
    })
  } catch (err) {
    console.error('Error loading products:', err)
  }
}
```

**Change 2 — Replace edit-mode setProducts merge with seedProducts**

Find (around lines 122–127):
```ts
// Merge with existing products, avoiding duplicates
setProducts((prevProducts) => {
  const existingIds = new Set(prevProducts.map(p => p.id))
  const newProducts = adjustmentProducts.filter((p: any) => !existingIds.has(p.id))
  return [...prevProducts, ...newProducts]
})
```
Replace with:
```ts
seedProducts(adjustmentProducts)
```

**Change 3 — Fix Autocomplete `value` prop**

Find (around line 463):
```ts
value={products.find(p => p.id === productField.value) || null}
```
Replace with:
```ts
value={watchedItems[index]?.product || products.find(p => p.id === productField.value) || null}
```

**Change 4 — Add `isOptionEqualToValue`**

Find (around line 462):
```ts
getOptionLabel={(option) => option.name}
```
Replace with:
```ts
getOptionLabel={(option) => option?.name || ''}
isOptionEqualToValue={(option, value) => option.id === value.id}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx --no-coverage
```

Expected: All 3 tests PASS

- [ ] **Step 3: Run full frontend test suite to check for regressions**

```bash
cd frontend && npm run test -- --no-coverage
```

Expected: All tests PASS

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx \
        frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
git commit -m "fix(inventory): fix product search filtering on CreateStockAdjustmentPage"
```
