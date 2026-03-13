# Stock Adjustment RTK Query Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `CreateStockAdjustmentPage` from `ApiService` to RTK Query mutations so the stock adjustment list auto-refreshes after create/update (fixes issue #90).

**Architecture:** Replace `ApiService.post/put` calls with `useCreateStockAdjustmentMutation`/`useUpdateStockAdjustmentMutation` (which invalidate the `StockAdjustment` RTK Query tag), and replace `ApiService.get` for the edit-mode fetch with `useLazyGetStockAdjustmentQuery`, following the same pattern as `CreateSalesOrderPage`.

**Tech Stack:** React 19, RTK Query (`@reduxjs/toolkit`), Vitest, React Testing Library

---

## Chunk 1: Migrate `CreateStockAdjustmentPage` to RTK Query

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- Modify: `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`

---

### Task 1: Update imports and hook declarations

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx:32`

- [ ] **Step 1: Replace `ApiService` import with RTK Query hooks**

  Open `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`.

  Find line 32:
  ```ts
  import { ApiService } from '@/services/api'
  ```

  Replace with:
  ```ts
  import {
    useLazyGetStockAdjustmentQuery,
    useCreateStockAdjustmentMutation,
    useUpdateStockAdjustmentMutation,
  } from '@/store/api/inventoryApi'
  ```

- [ ] **Step 2: Replace manual `loading` state and add mutation hooks**

  In `CreateStockAdjustmentPage` (around line 72), find:
  ```ts
  const [loading, setLoading] = useState(false)
  ```

  Replace with:
  ```ts
  const [createStockAdjustment, { isLoading: isCreating }] = useCreateStockAdjustmentMutation()
  const [updateStockAdjustment, { isLoading: isUpdating }] = useUpdateStockAdjustmentMutation()
  const [triggerGetStockAdjustment] = useLazyGetStockAdjustmentQuery()
  const loading = isCreating || isUpdating
  ```

- [ ] **Step 3: Run TypeScript check to verify no import errors**

  ```bash
  cd frontend && npm run type-check 2>&1 | head -40
  ```

  Expected: errors only about unused `setLoading` calls (not yet removed) — no import resolution errors.

---

### Task 2: Migrate edit-mode GET to lazy query

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx:111-133`

- [ ] **Step 1: Replace `ApiService.get` with `triggerGetStockAdjustment` in `loadStockAdjustment`**

  Find the `loadStockAdjustment` function (lines 111–133):
  ```ts
  const loadStockAdjustment = async (adjustmentId: string) => {
    setLoadingAdjustment(true)
    try {
      const response = await ApiService.get(`/inventory/stock-adjustments/${adjustmentId}`)
      const adjustment = (response as any).data || response
  ```

  Replace those two inner lines with:
  ```ts
  const loadStockAdjustment = async (adjustmentId: string) => {
    setLoadingAdjustment(true)
    try {
      const adjustment = await triggerGetStockAdjustment(adjustmentId).unwrap()
  ```

  Also remove the now-unused `const adjustment = (response as any).data || response` line — with `.unwrap()` the result is already the normalized `StockAdjustment` object directly.

  The rest of the function body (seedProducts, setAdjustmentToLoad, catch block) stays unchanged. Update the catch block error path:

  Find:
  ```ts
  showError(err?.response?.data?.message || 'Failed to load stock adjustment')
  setError('Failed to load stock adjustment')
  ```

  Replace with:
  ```ts
  showError(err?.data?.message || err?.message || 'Failed to load stock adjustment')
  setError('Failed to load stock adjustment')
  ```

- [ ] **Step 2: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | head -40
  ```

  Expected: errors only about unused `setLoading` — no new errors.

---

### Task 3: Migrate create/update mutations in `onSubmit`

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx:184-249`

- [ ] **Step 1: Remove the `console.log` debug statement**

  Find line 210:
  ```ts
  console.log(isEditMode ? 'Updating stock adjustment:' : 'Creating stock adjustment:', adjustmentData)
  ```

  Delete that line entirely.

- [ ] **Step 2: Migrate the update branch**

  Find (in `onSubmit`, inside `if (isEditMode && id)`):
  ```ts
  const updateResponse = await ApiService.put(`/inventory/stock-adjustments/${id}`, adjustmentData)
  const updatedAdjustment = updateResponse as any
  const saNumber = updatedAdjustment?.adjustmentNumber || 'N/A'
  ```

  Replace with:
  ```ts
  const updatedAdjustment = await updateStockAdjustment({ id, data: adjustmentData }).unwrap()
  const saNumber = updatedAdjustment?.adjustmentNumber || 'N/A'
  ```

- [ ] **Step 3: Migrate the create branch**

  Find (in `onSubmit`, inside the `else` block):
  ```ts
  const createResponse = await ApiService.post('/inventory/stock-adjustments', adjustmentData)

  const adjustment = createResponse as any

  if (!adjustment || !adjustment.id) {
    throw new Error('Invalid response from server: missing adjustment ID')
  }
  ```

  Replace with:
  ```ts
  const adjustment = await createStockAdjustment(adjustmentData).unwrap()
  ```

  (RTK Query `.unwrap()` throws on server errors — the manual guard is no longer needed.)

- [ ] **Step 4: Update the catch block error path**

  Find (in `onSubmit` catch):
  ```ts
  setError(err.response?.data?.message || err.message || 'Failed to record stock adjustments')
  showError(err.response?.data?.message || err.message || 'Failed to record stock adjustments')
  ```

  Replace with:
  ```ts
  setError(err.data?.message || err.message || 'Failed to record stock adjustments')
  showError(err.data?.message || err.message || 'Failed to record stock adjustments')
  ```

- [ ] **Step 5: Remove all `setLoading` calls**

  There are three `setLoading` calls to remove — all three must be deleted:
  1. `setLoading(true)` at the top of `onSubmit` (line 185 in the original)
  2. `setLoading(false)` inside the early-return no-items guard (line 195 in the original, inside `if (itemsWithDifference.length === 0)`)
  3. `setLoading(false)` inside the `finally` block (line 247 in the original)

  Also remove the old `const [loading, setLoading] = useState(false)` line if it wasn't replaced in Task 1 Step 2.

  Also remove the `console.error` debug blocks (lines 239–243 in the original):
  ```ts
  console.error('Error creating stock adjustments:', err)
  console.error('Error details:', {
    message: err.message,
    response: err.response?.data,
    status: err.response?.status
  })
  ```

- [ ] **Step 6: Run TypeScript check — expect clean**

  ```bash
  cd frontend && npm run type-check 2>&1 | head -40
  ```

  Expected: no errors.

- [ ] **Step 7: Run existing tests — expect all pass**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
  ```

  Expected: all 4 existing tests pass. The edit-mode tests will still pass because `ApiService.get` is still mocked for `/inventory/stock-adjustments/:id` — that mock will now be unused for the adjustment fetch but harmless.

  > Note: The edit-mode loading test (`shows a loading indicator while edit-mode adjustment is being fetched`) will need updating in Task 4 since the mock pattern changes. If it fails here, that is expected — proceed to Task 4.

- [ ] **Step 8: Commit**

  Run from repo root (`/home/blur/erp2`):
  ```bash
  git add frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx
  git commit -m "feat(inventory): migrate CreateStockAdjustmentPage to RTK Query mutations

  Replaces ApiService.post/put/get with RTK Query hooks so StockAdjustment
  tag invalidation fires on create/update, fixing stale list after navigation.
  Fixes #90."
  ```

---

### Task 4: Update tests — edit-mode GET mock

**Files:**
- Modify: `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`

The edit-mode adjustment fetch now uses `useLazyGetStockAdjustmentQuery` instead of `ApiService.get`. The test file needs a mock for that hook, and the `mockGet` for `/inventory/stock-adjustments/:id` can be removed from those tests.

- [ ] **Step 1: Add hoisted mock functions for the new hooks**

  Find the `vi.hoisted` block at the top of the test file:
  ```ts
  const { mockGet, mockParams } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockParams: vi.fn(() => ({})),
  }))
  ```

  Replace with:
  ```ts
  const { mockGet, mockParams, mockFetchAdjustment, mockCreateAdjustment, mockUpdateAdjustment } = vi.hoisted(() => ({
    mockGet: vi.fn(),
    mockParams: vi.fn(() => ({})),
    mockFetchAdjustment: vi.fn(),
    mockCreateAdjustment: vi.fn(),
    mockUpdateAdjustment: vi.fn(),
  }))
  ```

- [ ] **Step 2: Add the `inventoryApi` mock**

  After the existing `vi.mock('@/services/api', ...)` block, add:
  ```ts
  vi.mock('@/store/api/inventoryApi', () => ({
    useLazyGetStockAdjustmentQuery: () => [mockFetchAdjustment],
    useCreateStockAdjustmentMutation: () => [mockCreateAdjustment, { isLoading: false }],
    useUpdateStockAdjustmentMutation: () => [mockUpdateAdjustment, { isLoading: false }],
  }))
  ```

- [ ] **Step 3: Remove `mockGet` for the adjustment fetch in edit-mode tests**

  The test `shows a loading indicator while edit-mode adjustment is being fetched` currently resolves via `mockGet`. Update it to use `mockFetchAdjustment` instead.

  Find the test:
  ```ts
  it('shows a loading indicator while edit-mode adjustment is being fetched', async () => {
    let resolveAdjustment!: (v: any) => void
    const adjustmentPromise = new Promise((res) => { resolveAdjustment = res })

    mockParams.mockReturnValue({ id: 'adj-1' })

    mockGet.mockImplementation(async (url: string) => {
      if (url === '/inventory/stock-adjustments/adj-1') {
        return adjustmentPromise
      }
      return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
    })
  ```

  Replace the `mockGet.mockImplementation` portion with:
  ```ts
  it('shows a loading indicator while edit-mode adjustment is being fetched', async () => {
    let resolveAdjustment!: (v: any) => void
    const adjustmentPromise = new Promise((res) => { resolveAdjustment = res })

    mockParams.mockReturnValue({ id: 'adj-1' })

    // Mock lazy trigger to return a pending promise (simulates in-flight request)
    mockFetchAdjustment.mockReturnValue({ unwrap: () => adjustmentPromise })

    mockGet.mockImplementation(async () => {
      return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
    })
  ```

  Also update the `resolveAdjustment(...)` call — the lazy query `.unwrap()` resolves with the normalized object directly (no `{ data: { ... } }` wrapper):
  ```ts
  resolveAdjustment({
    id: 'adj-1',
    adjustmentDate: '2026-03-01T00:00:00.000Z',
    reason: 'Recount',
    items: [],
  })
  ```

- [ ] **Step 4: Update the `keeps hydrated edit-mode product visible` test**

  Find the test `keeps hydrated edit-mode product visible after search replaces options`. Its `mockGet` currently handles both the adjustment fetch (`/inventory/stock-adjustments/adj-1`) and product-related calls.

  Replace the adjustment fetch branch with a `mockFetchAdjustment` mock. Add before `mockGet.mockImplementation`:
  ```ts
  mockFetchAdjustment.mockReturnValue({
    unwrap: async () => ({
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
    }),
  })
  ```

  Then update `mockGet.mockImplementation` to remove the `if (url === '/inventory/stock-adjustments/adj-1')` branch — it will no longer be called for the adjustment fetch.

- [ ] **Step 5: Run existing tests — expect all pass**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
  ```

  Expected: all 4 tests pass.

---

### Task 5: Add tests for create and update submit paths

**Files:**
- Modify: `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`

There are currently no tests for the `onSubmit` flow. Add them now.

- [ ] **Step 1: Write a failing test for the create path**

  Add a new `describe` block after the existing one:

  ```ts
  describe('CreateStockAdjustmentPage submit', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockParams.mockReturnValue({})

      mockGet.mockResolvedValue({ data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] })

      // Mock product detail fetch (handleProductSelect)
      mockGet.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
        if (url.includes('/inventory/products/')) {
          return { data: { id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 } }
        }
        return { data: [{ id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 }] }
      })

      mockCreateAdjustment.mockReturnValue({
        unwrap: async () => ({
          id: 'adj-new',
          adjustmentNumber: 'SA-001',
          itemCount: 1,
          status: 'draft',
        }),
      })
    })

    it('calls createStockAdjustment mutation on submit in create mode', async () => {
      const user = userEvent.setup()

      render(
        <BrowserRouter>
          <CreateStockAdjustmentPage />
        </BrowserRouter>
      )

      // Select a product
      const productInput = screen.getByPlaceholderText('Search by name or barcode...')
      await user.click(productInput)
      const listbox = await screen.findByRole('listbox')
      await user.click(within(listbox).getByText('Alpha Widget'))

      // Wait for product to be selected and oldQuantity populated
      await waitFor(() => {
        expect(productInput).toHaveValue('Alpha Widget')
      })

      // Change new quantity to differ from old (to create a non-zero difference)
      const newQtyInput = screen.getAllByRole('textbox').find(
        (el) => el !== productInput
      )!
      await user.tripleClick(newQtyInput)
      await user.type(newQtyInput, '15')

      // Submit the form
      await user.click(screen.getByRole('button', { name: /create adjustment/i }))

      await waitFor(() => {
        expect(mockCreateAdjustment).toHaveBeenCalledWith(
          expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ productId: 'product-1' }),
            ]),
          })
        )
      })
    })
  })
  ```

- [ ] **Step 2: Write the update path test**

  Add inside the `describe('CreateStockAdjustmentPage submit', ...)` block:

  ```ts
  it('calls updateStockAdjustment mutation on submit in edit mode', async () => {
    const user = userEvent.setup()
    mockParams.mockReturnValue({ id: 'adj-1' })

    mockFetchAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
        adjustmentDate: '2026-03-01T00:00:00.000Z',
        items: [
          {
            productId: 'product-1',
            oldQuantity: 10,
            newQuantity: 10,
            difference: 0,
            product: { id: 'product-1', name: 'Alpha Widget', stockQuantity: 10 },
          },
        ],
      }),
    })

    mockUpdateAdjustment.mockReturnValue({
      unwrap: async () => ({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
      }),
    })

    render(
      <BrowserRouter>
        <CreateStockAdjustmentPage />
      </BrowserRouter>
    )

    // Wait for edit form to load
    await waitFor(() => {
      expect(screen.queryByText('Loading stock adjustment...')).not.toBeInTheDocument()
    })

    // Change new quantity so difference != 0
    const newQtyInputs = screen.getAllByRole('textbox')
    const newQtyInput = newQtyInputs.find((el) => (el as HTMLInputElement).value === '10')!
    await user.tripleClick(newQtyInput)
    await user.type(newQtyInput, '20')

    await user.click(screen.getByRole('button', { name: /update adjustment/i }))

    await waitFor(() => {
      expect(mockUpdateAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'adj-1',
          data: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({ productId: 'product-1' }),
            ]),
          }),
        })
      )
    })
  })
  ```

- [ ] **Step 4: Run all tests — expect all pass**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
  ```

  Expected: all 6 tests pass.

- [ ] **Step 5: Run full frontend test suite — expect no regressions**

  ```bash
  cd frontend && npm run test 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
  git commit -m "test(inventory): update and add tests for RTK Query migration in CreateStockAdjustmentPage"
  ```
