# Customer & Supplier Form UI/UX Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize `CustomerFormPage` and `SupplierFormPage` to use the workflow layout/density pattern, and extract all duplicate-check logic into a shared `useFieldDuplicateCheck` hook used by all four affected forms.

**Architecture:** Create a generic `useFieldDuplicateCheck` hook with internal debounce, refactor `useDuplicateCheck` and `useCategoryDuplicateCheck` as thin wrappers, rewrite both form pages with the 8/4 card layout, and remove the now-redundant inline debounce `useEffect` blocks from `CreateProductPage` and `CategoryDialogs`.

**Tech Stack:** React 19, TypeScript, MUI v7, React Hook Form, RTK Query, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-04-19-customer-supplier-form-modernization-design.md`

---

## File Map

| File | Action |
|---|---|
| `frontend/src/hooks/useFieldDuplicateCheck.ts` | **Create** |
| `frontend/src/hooks/__tests__/useFieldDuplicateCheck.test.ts` | **Create** |
| `frontend/src/hooks/useDuplicateCheck.ts` | **Refactor** |
| `frontend/src/hooks/useCategoryDuplicateCheck.ts` | **Refactor** |
| `frontend/src/pages/inventory/CreateProductPage.tsx` | **Edit** — remove inline debounce useEffect |
| `frontend/src/pages/inventory/components/CategoryDialogs.tsx` | **Edit** — remove inline debounce useEffect |
| `frontend/src/pages/sales/CustomerFormPage.tsx` | **Rewrite** |
| `frontend/src/pages/purchasing/SupplierFormPage.tsx` | **Rewrite** |
| `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx` | **Edit** |
| `frontend/src/pages/purchasing/__tests__/SupplierFormPage.test.tsx` | **Create** |

---

## Task 1: Create `useFieldDuplicateCheck` hook with tests

**Files:**
- Create: `frontend/src/hooks/useFieldDuplicateCheck.ts`
- Create: `frontend/src/hooks/__tests__/useFieldDuplicateCheck.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hooks/__tests__/useFieldDuplicateCheck.test.ts`:

```ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFieldDuplicateCheck } from '../useFieldDuplicateCheck'

describe('useFieldDuplicateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire checkFn before debounce delay', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    renderHook(() => useFieldDuplicateCheck('hello', checkFn))
    expect(checkFn).not.toHaveBeenCalled()
  })

  it('fires checkFn after debounce delay', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    renderHook(() => useFieldDuplicateCheck('hello', checkFn))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(checkFn).toHaveBeenCalledWith('hello', undefined)
  })

  it('does not fire when skipCheck is true', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    renderHook(() => useFieldDuplicateCheck('hello', checkFn, { skipCheck: true }))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(checkFn).not.toHaveBeenCalled()
  })

  it('does not fire when value is shorter than minLength', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    renderHook(() => useFieldDuplicateCheck('a', checkFn, { minLength: 2 }))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(checkFn).not.toHaveBeenCalled()
  })

  it('sets hasDuplicate and error when checkFn returns exists: true', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: true, message: 'Already taken' })
    const { result } = renderHook(() => useFieldDuplicateCheck('taken', checkFn))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(result.current.hasDuplicate).toBe(true)
    expect(result.current.error).toBe('Already taken')
    expect(result.current.successMessage).toBeNull()
    expect(result.current.hasChecked).toBe(true)
  })

  it('sets successMessage when checkFn returns exists: false', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    const { result } = renderHook(() => useFieldDuplicateCheck('available', checkFn))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(result.current.hasDuplicate).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.successMessage).toBe('✓ Available')
    expect(result.current.hasChecked).toBe(true)
  })

  it('cancels pending debounce when value changes before delay elapses', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    const { rerender } = renderHook(
      ({ value }: { value: string }) => useFieldDuplicateCheck(value, checkFn),
      { initialProps: { value: 'abc' } }
    )
    await act(async () => { vi.advanceTimersByTime(300) })
    rerender({ value: 'abcd' })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(checkFn).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(checkFn).toHaveBeenCalledTimes(1)
    expect(checkFn).toHaveBeenCalledWith('abcd', undefined)
  })

  it('swallows checkFn errors silently', async () => {
    const checkFn = vi.fn().mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useFieldDuplicateCheck('hello', checkFn))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(result.current.hasDuplicate).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.hasChecked).toBe(false)
  })

  it('passes excludeId to checkFn', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    renderHook(() => useFieldDuplicateCheck('hello', checkFn, { excludeId: 'id-123' }))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(checkFn).toHaveBeenCalledWith('hello', 'id-123')
  })

  it('clears state when skipCheck becomes true', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: true, message: 'Taken' })
    const { result, rerender } = renderHook(
      ({ skip }: { skip: boolean }) => useFieldDuplicateCheck('taken', checkFn, { skipCheck: skip }),
      { initialProps: { skip: false } }
    )
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(result.current.hasDuplicate).toBe(true)
    rerender({ skip: true })
    expect(result.current.hasDuplicate).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.hasChecked).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useFieldDuplicateCheck.test.ts
```

Expected: FAIL — `useFieldDuplicateCheck` not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useFieldDuplicateCheck.ts`:

```ts
import { useState, useEffect, useRef } from 'react'

export interface UseFieldDuplicateCheckOptions {
  excludeId?: string
  minLength?: number
  debounceMs?: number
  skipCheck?: boolean
}

export interface UseFieldDuplicateCheckReturn {
  isChecking: boolean
  hasDuplicate: boolean
  hasChecked: boolean
  error: string | null
  successMessage: string | null
}

export function useFieldDuplicateCheck(
  value: string,
  checkFn: (value: string, excludeId?: string) => Promise<{ exists: boolean; message?: string }>,
  options?: UseFieldDuplicateCheckOptions
): UseFieldDuplicateCheckReturn {
  const {
    excludeId,
    minLength = 2,
    debounceMs = 500,
    skipCheck = false,
  } = options ?? {}

  const [isChecking, setIsChecking] = useState(false)
  const [hasDuplicate, setHasDuplicate] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Keep checkFn stable across renders without requiring callers to memoize it
  const checkFnRef = useRef(checkFn)
  checkFnRef.current = checkFn

  useEffect(() => {
    if (skipCheck || value.trim().length < minLength) {
      setIsChecking(false)
      setHasDuplicate(false)
      setHasChecked(false)
      setError(null)
      setSuccessMessage(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsChecking(true)
      try {
        const result = await checkFnRef.current(value.trim(), excludeId)
        if (result.exists) {
          setHasDuplicate(true)
          setError(result.message ?? null)
          setSuccessMessage(null)
        } else {
          setHasDuplicate(false)
          setError(null)
          setSuccessMessage('✓ Available')
        }
        setHasChecked(true)
      } catch {
        setHasDuplicate(false)
        setError(null)
        setSuccessMessage(null)
      } finally {
        setIsChecking(false)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [value, excludeId, skipCheck, minLength, debounceMs])

  return { isChecking, hasDuplicate, hasChecked, error, successMessage }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/hooks/__tests__/useFieldDuplicateCheck.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/hooks/useFieldDuplicateCheck.ts src/hooks/__tests__/useFieldDuplicateCheck.test.ts
git commit -m "feat: add useFieldDuplicateCheck generic hook with debounce (issue #389)"
```

---

## Task 2: Refactor `useDuplicateCheck` to use new hook

**Files:**
- Modify: `frontend/src/hooks/useDuplicateCheck.ts`
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx` (remove inline debounce useEffect lines 290–304)

- [ ] **Step 1: Run existing CreateProductPage tests to establish baseline**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateProductPage.test.tsx
```

Expected: All tests PASS. Note the count for verification after refactor.

- [ ] **Step 2: Refactor `useDuplicateCheck.ts`**

Replace the entire contents of `frontend/src/hooks/useDuplicateCheck.ts`:

```ts
import { useCallback, useState } from 'react'
import { useLazyCheckProductDuplicateQuery } from '@/store/api/inventoryApi'
import { useFieldDuplicateCheck } from './useFieldDuplicateCheck'

interface DuplicateCheckResult {
  nameExists: boolean
  barcodeExists: boolean
  nameConflict?: { id: string; name: string; isDeleted: boolean; barcode?: string }
  barcodeConflict?: { id: string; name: string; isDeleted: boolean; barcode?: string }
}

interface UseDuplicateCheckReturn {
  checkDuplicate: (params: { name?: string; barcode?: string; excludeId?: string }) => Promise<DuplicateCheckResult | null>
  isChecking: boolean
  error: string | null
  nameError: string
  barcodeError: string
  hasNameDuplicate: boolean
  hasBarcodeDuplicate: boolean
  hasCheckedName: boolean
  hasCheckedBarcode: boolean
}

interface UseDuplicateCheckProps {
  name?: string
  barcode?: string
  excludeId?: string
}

export const useDuplicateCheck = (props?: UseDuplicateCheckProps): UseDuplicateCheckReturn => {
  const [checkDuplicateRequest] = useLazyCheckProductDuplicateQuery()

  const nameCheckFn = useCallback(async (value: string, excludeId?: string) => {
    const result = await checkDuplicateRequest({ name: value, excludeId }).unwrap()
    if (result.nameExists && result.nameConflict) {
      const c = result.nameConflict
      return {
        exists: true,
        message: c.isDeleted
          ? `Product with name '${c.name}' was previously deleted. Please choose a different name or restore the deleted product.`
          : `Product with name '${c.name}' already exists`,
      }
    }
    return { exists: false }
  }, [checkDuplicateRequest])

  const barcodeCheckFn = useCallback(async (value: string, excludeId?: string) => {
    const result = await checkDuplicateRequest({ barcode: value, excludeId }).unwrap()
    if (result.barcodeExists && result.barcodeConflict) {
      const c = result.barcodeConflict
      return {
        exists: true,
        message: c.isDeleted
          ? `Product with barcode '${c.barcode}' was previously deleted. Please choose a different barcode or restore the deleted product.`
          : `Product with barcode '${c.barcode}' already exists`,
      }
    }
    return { exists: false }
  }, [checkDuplicateRequest])

  const {
    isChecking: isCheckingName,
    hasDuplicate: hasNameDuplicate,
    hasChecked: hasCheckedName,
    error: nameErrorMsg,
  } = useFieldDuplicateCheck(props?.name ?? '', nameCheckFn, {
    excludeId: props?.excludeId,
    skipCheck: !props?.name || props.name.trim().length < 2,
  })

  const {
    isChecking: isCheckingBarcode,
    hasDuplicate: hasBarcodeDuplicate,
    hasChecked: hasCheckedBarcode,
    error: barcodeErrorMsg,
  } = useFieldDuplicateCheck(props?.barcode ?? '', barcodeCheckFn, {
    excludeId: props?.excludeId,
    minLength: 1,
    skipCheck: !props?.barcode || props.barcode.trim().length < 1,
  })

  // Imperative checkDuplicate retained for submit-gate validation in CreateProductPage
  const checkDuplicate = useCallback(async (params: {
    name?: string
    barcode?: string
    excludeId?: string
  }): Promise<DuplicateCheckResult | null> => {
    if (!params.name && !params.barcode) return null
    try {
      return await checkDuplicateRequest(params).unwrap()
    } catch {
      return null
    }
  }, [checkDuplicateRequest])

  return {
    checkDuplicate,
    isChecking: isCheckingName || isCheckingBarcode,
    error: nameErrorMsg ?? barcodeErrorMsg,
    nameError: nameErrorMsg ?? '',
    barcodeError: barcodeErrorMsg ?? '',
    hasNameDuplicate,
    hasBarcodeDuplicate,
    hasCheckedName,
    hasCheckedBarcode,
  }
}
```

- [ ] **Step 3: Update `CreateProductPage.tsx` — pass watched values to hook and remove inline debounce useEffect**

In `frontend/src/pages/inventory/CreateProductPage.tsx`:

**3a.** Change the `useDuplicateCheck` call (currently around line 254) to pass the watched values:

```tsx
// Before:
const {
  checkDuplicate,
  nameError,
  barcodeError,
  hasNameDuplicate,
  hasBarcodeDuplicate,
  hasCheckedName,
  hasCheckedBarcode
} = useDuplicateCheck()

// After:
const {
  checkDuplicate,
  nameError,
  barcodeError,
  hasNameDuplicate,
  hasBarcodeDuplicate,
  hasCheckedName,
  hasCheckedBarcode
} = useDuplicateCheck({
  name: watchedName,
  barcode: watchedBarcode,
  excludeId: isEditMode ? id : undefined,
})
```

**3b.** Remove the entire inline debounce useEffect block (currently lines 290–304):

```tsx
// DELETE this entire block:
useEffect(() => {
  const timeoutId = setTimeout(async () => {
    if ((watchedName && watchedName.trim().length >= 2) ||
        (watchedBarcode && watchedBarcode.trim().length >= 1)) {

      await checkDuplicate({
        name: watchedName && watchedName.trim().length >= 2 ? watchedName.trim() : undefined,
        barcode: watchedBarcode && watchedBarcode.trim().length >= 1 ? watchedBarcode.trim() : undefined,
        excludeId: isEditMode ? id : undefined,
      })
    }
  }, 500) // Debounce API calls

  return () => clearTimeout(timeoutId)
}, [watchedName, watchedBarcode, checkDuplicate, isEditMode, id])
```

- [ ] **Step 4: Run CreateProductPage tests to verify no regressions**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateProductPage.test.tsx
```

Expected: Same count as Step 1, all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useDuplicateCheck.ts frontend/src/pages/inventory/CreateProductPage.tsx
git commit -m "refactor: useDuplicateCheck delegates to useFieldDuplicateCheck (issue #389)"
```

---

## Task 3: Refactor `useCategoryDuplicateCheck` to use new hook

**Files:**
- Modify: `frontend/src/hooks/useCategoryDuplicateCheck.ts`
- Modify: `frontend/src/pages/inventory/components/CategoryDialogs.tsx` (remove inline debounce useEffect lines 106–118)

- [ ] **Step 1: Run CategoryDialogs-related tests to establish baseline**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/
```

Expected: All tests PASS. Note the count.

- [ ] **Step 2: Refactor `useCategoryDuplicateCheck.ts`**

Replace the entire contents of `frontend/src/hooks/useCategoryDuplicateCheck.ts`:

```ts
import { useCallback } from 'react'
import { useLazyCheckCategoryDuplicateQuery } from '@/store/api/inventoryApi'
import { useFieldDuplicateCheck } from './useFieldDuplicateCheck'

interface UseCategoryDuplicateCheckReturn {
  checkDuplicate: (params: { name?: string; parentId?: string; excludeId?: string }) => Promise<{ nameExists: boolean; nameConflict?: { id: string; name: string; isDeleted: boolean; parentId?: string } } | null>
  isChecking: boolean
  error: string | null
  nameError: string
  hasNameDuplicate: boolean
  hasCheckedName: boolean
}

interface UseCategoryDuplicateCheckProps {
  name?: string
  parentId?: string
  excludeId?: string
}

export const useCategoryDuplicateCheck = (props?: UseCategoryDuplicateCheckProps): UseCategoryDuplicateCheckReturn => {
  const [checkDuplicateRequest] = useLazyCheckCategoryDuplicateQuery()

  const nameCheckFn = useCallback(async (value: string, excludeId?: string) => {
    const result = await checkDuplicateRequest({
      name: value,
      parentId: props?.parentId,
      excludeId,
    }).unwrap()
    if (result.nameExists && result.nameConflict) {
      const c = result.nameConflict
      return {
        exists: true,
        message: c.isDeleted
          ? `Category with name '${c.name}' was previously deleted. Please choose a different name or restore the deleted category.`
          : `Category with name '${c.name}' already exists at this level`,
      }
    }
    return { exists: false }
  }, [checkDuplicateRequest, props?.parentId])

  const {
    isChecking,
    hasDuplicate: hasNameDuplicate,
    hasChecked: hasCheckedName,
    error: nameErrorMsg,
  } = useFieldDuplicateCheck(props?.name ?? '', nameCheckFn, {
    excludeId: props?.excludeId,
    skipCheck: !props?.name || props.name.trim().length < 2,
  })

  // Imperative checkDuplicate retained for backward compatibility with CategoryDialogs
  const checkDuplicate = useCallback(async (params: {
    name?: string
    parentId?: string
    excludeId?: string
  }) => {
    if (!params.name) return null
    try {
      return await checkDuplicateRequest(params).unwrap()
    } catch {
      return null
    }
  }, [checkDuplicateRequest])

  return {
    checkDuplicate,
    isChecking,
    error: nameErrorMsg,
    nameError: nameErrorMsg ?? '',
    hasNameDuplicate,
    hasCheckedName,
  }
}
```

- [ ] **Step 3: Update `CategoryDialogs.tsx` — pass watched values to hook and remove inline debounce useEffect**

In `frontend/src/pages/inventory/components/CategoryDialogs.tsx`:

**3a.** Change the `useCategoryDuplicateCheck` call (around line 89) to pass the watched values:

```tsx
// Before:
const {
  checkDuplicate,
  nameError: duplicateNameError,
  hasNameDuplicate: isDuplicateName,
} = useCategoryDuplicateCheck()

// After:
const {
  checkDuplicate,
  nameError: duplicateNameError,
  hasNameDuplicate: isDuplicateName,
} = useCategoryDuplicateCheck({
  name: watchedName,
  parentId: watchedParentId ?? undefined,
  excludeId: editMode && selectedCategory ? selectedCategory.id : undefined,
})
```

**3b.** Remove the entire inline debounce useEffect block (lines 106–118):

```tsx
// DELETE this entire block:
useEffect(() => {
  const timeoutId = setTimeout(async () => {
    if (watchedName && watchedName.trim().length >= 2) {
      await checkDuplicate({
        name: watchedName.trim(),
        parentId: watchedParentId || undefined,
        excludeId: editMode && selectedCategory ? selectedCategory.id : undefined,
      })
    }
  }, 500)

  return () => clearTimeout(timeoutId)
}, [watchedName, watchedParentId, editMode, selectedCategory, checkDuplicate])
```

- [ ] **Step 4: Run inventory tests to verify no regressions**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/
```

Expected: Same count as Step 1, all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCategoryDuplicateCheck.ts frontend/src/pages/inventory/components/CategoryDialogs.tsx
git commit -m "refactor: useCategoryDuplicateCheck delegates to useFieldDuplicateCheck (issue #389)"
```

---

## Task 4: Rewrite `CustomerFormPage`

**Files:**
- Rewrite: `frontend/src/pages/sales/CustomerFormPage.tsx`
- Edit: `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx`

- [ ] **Step 1: Run existing CustomerFormPage tests to establish baseline**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerFormPage.test.tsx
```

Expected: All tests PASS. Note the count.

- [ ] **Step 2: Add duplicate-check tests to `CustomerFormPage.test.tsx`**

Add these two new `describe` blocks to the bottom of `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx`, before the closing of the file:

```tsx
describe('CustomerFormPage - phone duplicate check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }),
    })
  })

  it('shows phone duplicate error when a matching customer exists', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/customers') {
        return Promise.resolve({
          data: { data: [{ id: 'other-cust', name: 'Existing Corp', phone: '555-9999' }] },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    })

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.useFakeTimers()
    renderCreatePage()

    await user.type(screen.getByLabelText(/phone/i), '555-9999')
    await act(async () => { vi.advanceTimersByTime(500) })

    await waitFor(() => {
      expect(screen.getByText(/phone already exists for customer: existing corp/i)).toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('shows available message when phone has no match', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.useFakeTimers()
    renderCreatePage()

    await user.type(screen.getByLabelText(/phone/i), '555-1234')
    await act(async () => { vi.advanceTimersByTime(500) })

    await waitFor(() => {
      expect(screen.getByText('✓ Available')).toBeInTheDocument()
    })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 3: Run tests to verify new tests fail (phone tests rely on new implementation)**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerFormPage.test.tsx
```

Expected: New phone tests FAIL (current page doesn't show `✓ Available`).

- [ ] **Step 4: Rewrite `CustomerFormPage.tsx`**

Replace the entire contents of `frontend/src/pages/sales/CustomerFormPage.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import api from '@/services/api'
import PriceListSelector from '@/components/price-lists/PriceListSelector'
import AddressSection from '@/components/common/AddressSection'
import PageHeader from '@/components/common/PageHeader'
import { useFieldDuplicateCheck } from '@/hooks/useFieldDuplicateCheck'

const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  priceListId: yup.string().optional().nullable(),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface CustomerFormData {
  name: string
  type: CustomerType
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  priceListId?: string | null
  notes?: string | null
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const CustomerFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      priceListId: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    },
  })

  const watchedPhone = watch('phone')

  useEffect(() => {
    if (!id) return
    setLoadingCustomer(true)
    api.get(`/customers/${id}`)
      .then((res) => {
        const c: Customer = res.data?.data ?? res.data
        setCustomer(c)
        reset({
          name: c.name,
          type: c.type,
          priceListId: c.priceListId || null,
          phone: c.phone || null,
          streetAddress: c.streetAddress || null,
          city: c.city || null,
          state: c.state || null,
          postalCode: c.postalCode || null,
          country: c.country || null,
          notes: c.notes || null,
        })
      })
      .catch(() => setLoadError('Customer not found.'))
      .finally(() => setLoadingCustomer(false))
  }, [id, reset])

  const phoneCheckFn = async (phone: string, excludeId?: string) => {
    const normalized = phone.replace(/[\s\-\(\)\+]/g, '')
    const [activeRes, deletedRes] = await Promise.all([
      api.get('/customers', { params: { search: phone } }),
      api.get('/customers/deleted', { params: { search: phone } }),
    ])
    const all = [...(activeRes.data?.data || []), ...(deletedRes.data?.data || [])]
    const duplicate = all.find((c: Customer) => {
      if (!c.phone) return false
      return c.phone.replace(/[\s\-\(\)\+]/g, '') === normalized && c.id !== excludeId
    })
    return {
      exists: !!duplicate,
      message: duplicate ? `Phone already exists for customer: ${duplicate.name}` : undefined,
    }
  }

  const {
    isChecking: isCheckingPhone,
    hasDuplicate: hasPhoneDuplicate,
    hasChecked: hasCheckedPhone,
    error: phoneError,
    successMessage: phoneSuccess,
  } = useFieldDuplicateCheck(watchedPhone ?? '', phoneCheckFn, {
    excludeId: customer?.id,
    skipCheck: !watchedPhone,
  })

  const handleFormSubmit = async (data: CustomerFormData) => {
    const cleanedData = {
      ...data,
      phone: data.phone?.trim() || null,
      streetAddress: data.streetAddress?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || null,
      notes: data.notes?.trim() || null,
    }
    try {
      if (isEdit && id) {
        await updateCustomer({ id, data: cleanedData }).unwrap()
        showSuccess('Customer updated successfully')
      } else {
        await createCustomer(cleanedData).unwrap()
        showSuccess('Customer created successfully')
      }
      navigate('/sales/customers')
    } catch (error) {
      showError(`Failed to ${isEdit ? 'update' : 'create'} customer: ${error}`)
    }
  }

  if (loadingCustomer) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError) {
    return <Alert severity="error">{loadError}</Alert>
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Customer' : 'New Customer'}
        subtitle={isEdit ? `Editing ${customer?.name ?? ''}` : 'Add a new customer to your account'}
        variant="workflow"
        backAction={() => navigate('/sales/customers')}
      />
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <Grid container spacing={3}>
          {/* Main Card */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <FormControl fullWidth size="small" error={!!errors.type} sx={fieldSx}>
                          <InputLabel>Customer Type</InputLabel>
                          <Select {...field} label="Customer Type">
                            <MenuItem value={CustomerType.INDIVIDUAL}>Individual</MenuItem>
                            <MenuItem value={CustomerType.BUSINESS}>Business</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  </Grid>

                  <Grid size={12}>
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          size="small"
                          label="Customer Name"
                          error={!!errors.name}
                          helperText={errors.name?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="phone"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value || ''}
                          fullWidth
                          size="small"
                          label="Phone"
                          error={!!errors.phone || hasPhoneDuplicate}
                          helperText={
                            errors.phone?.message || phoneError ||
                            (hasCheckedPhone && !hasPhoneDuplicate ? phoneSuccess : '')
                          }
                          slotProps={{
                            input: {
                              endAdornment: isCheckingPhone ? (
                                <InputAdornment position="end">
                                  <CircularProgress size={16} />
                                </InputAdornment>
                              ) : undefined,
                            },
                          }}
                          sx={{
                            ...fieldSx,
                            '& .MuiFormHelperText-root': {
                              color: hasPhoneDuplicate ? 'error.main' :
                                (hasCheckedPhone && !hasPhoneDuplicate ? 'success.main' : undefined),
                            },
                          }}
                        />
                      )}
                    />
                  </Grid>

                  <AddressSection control={control} errors={errors} />
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Side Card */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Controller
                  name="priceListId"
                  control={control}
                  render={({ field }) => (
                    <PriceListSelector
                      value={field.value}
                      onChange={(value) => field.onChange(value)}
                      error={errors.priceListId?.message}
                      label="Price List"
                    />
                  )}
                />

                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      multiline
                      rows={6}
                      size="small"
                      label="Notes"
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                      sx={{ mt: 2, mb: 2, ...fieldSx }}
                    />
                  )}
                />

                <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button variant="outlined" fullWidth onClick={() => navigate('/sales/customers')} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={isSaving || hasPhoneDuplicate || isCheckingPhone}
                  >
                    {isSaving
                      ? (isEdit ? 'Updating...' : 'Creating...')
                      : (isEdit ? 'Update Customer' : 'Create Customer')
                    }
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </form>
    </>
  )
}

export default CustomerFormPage
```

- [ ] **Step 5: Run all CustomerFormPage tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerFormPage.test.tsx
```

Expected: All tests PASS including the two new phone duplicate tests.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "CustomerFormPage|useFieldDuplicateCheck" | head -20
```

Expected: No errors for these files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/CustomerFormPage.tsx frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx
git commit -m "feat: modernize CustomerFormPage layout and use useFieldDuplicateCheck (issue #389)"
```

---

## Task 5: Rewrite `SupplierFormPage` with tests

**Files:**
- Rewrite: `frontend/src/pages/purchasing/SupplierFormPage.tsx`
- Create: `frontend/src/pages/purchasing/__tests__/SupplierFormPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/pages/purchasing/__tests__/SupplierFormPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi, act } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import SupplierFormPage from '../SupplierFormPage'

const {
  mockNavigate,
  mockCreateSupplier,
  mockUpdateSupplier,
  mockShowSuccess,
  mockShowError,
  mockApiGet,
  mockCheckDuplicate,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateSupplier: vi.fn(),
  mockUpdateSupplier: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockApiGet: vi.fn(),
  mockCheckDuplicate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return {
    ...actual,
    useCreateSupplierMutation: vi.fn(() => [mockCreateSupplier, { isLoading: false }]),
    useUpdateSupplierMutation: vi.fn(() => [mockUpdateSupplier, { isLoading: false }]),
    useLazyCheckDuplicateCompanyNameQuery: vi.fn(() => [mockCheckDuplicate]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/services/api', () => ({
  default: { get: mockApiGet },
}))

function renderCreatePage() {
  const store = configureStore({ reducer: {} as any })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/purchasing/suppliers/create']}>
        <Routes>
          <Route path="/purchasing/suppliers/create" element={<SupplierFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

function renderEditPage(supplierId = 'sup-1') {
  const store = configureStore({ reducer: {} as any })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/purchasing/suppliers/${supplierId}/edit`]}>
        <Routes>
          <Route path="/purchasing/suppliers/:id/edit" element={<SupplierFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('SupplierFormPage - Create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-sup' }) })
    mockUpdateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'sup-1' }) })
    mockCheckDuplicate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ exists: false }) })
  })

  it('renders empty form with New Supplier heading', () => {
    renderCreatePage()
    expect(screen.getByText('New Supplier')).toBeInTheDocument()
    expect(screen.getByLabelText(/company name/i)).toHaveValue('')
  })

  it('shows validation error when company name is empty on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByText('Company name is required')).toBeInTheDocument()
    })
    expect(mockCreateSupplier).not.toHaveBeenCalled()
  })

  it('calls createSupplier and navigates on successful submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/company name/i), 'Acme Supplies')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(mockCreateSupplier).toHaveBeenCalledWith(
        expect.objectContaining({ companyName: 'Acme Supplies' }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers')
  })

  it('navigates back on Cancel click', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers')
  })
})

describe('SupplierFormPage - Edit mode', () => {
  const mockSupplier = {
    id: 'sup-1',
    companyName: 'Global Parts Ltd',
    type: 'local',
    contactPerson: 'Jane Smith',
    phone: '555-1234',
    streetAddress: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    notes: null,
    isActive: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-sup' }) })
    mockUpdateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'sup-1' }) })
    mockCheckDuplicate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ exists: false }) })
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/purchasing/suppliers/sup-1') {
        return Promise.resolve({ data: { data: mockSupplier } })
      }
      return Promise.resolve({ data: { data: [] } })
    })
  })

  it('shows Edit Supplier heading and pre-populates company name', async () => {
    renderEditPage('sup-1')
    await waitFor(() => {
      expect(screen.getByText('Edit Supplier')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Global Parts Ltd')
  })

  it('calls updateSupplier and navigates on successful submit', async () => {
    const user = userEvent.setup()
    renderEditPage('sup-1')

    await waitFor(() => {
      expect(screen.getByLabelText(/company name/i)).toHaveValue('Global Parts Ltd')
    })

    await user.clear(screen.getByLabelText(/company name/i))
    await user.type(screen.getByLabelText(/company name/i), 'Global Parts Updated')
    await user.click(screen.getByRole('button', { name: /update/i }))

    await waitFor(() => {
      expect(mockUpdateSupplier).toHaveBeenCalledWith({
        id: 'sup-1',
        data: expect.objectContaining({ companyName: 'Global Parts Updated' }),
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers')
  })
})

describe('SupplierFormPage - company name duplicate check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-sup' }) })
  })

  it('shows duplicate error when company name already exists', async () => {
    mockCheckDuplicate.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ exists: true, message: 'Company name already exists' }),
    })

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.useFakeTimers()
    renderCreatePage()

    await user.type(screen.getByLabelText(/company name/i), 'Taken Corp')
    await act(async () => { vi.advanceTimersByTime(500) })

    await waitFor(() => {
      expect(screen.getByText('Company name already exists')).toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('shows available message when company name is free', async () => {
    mockCheckDuplicate.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ exists: false }),
    })

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.useFakeTimers()
    renderCreatePage()

    await user.type(screen.getByLabelText(/company name/i), 'New Corp')
    await act(async () => { vi.advanceTimersByTime(500) })

    await waitFor(() => {
      expect(screen.getByText('✓ Available')).toBeInTheDocument()
    })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SupplierFormPage.test.tsx
```

Expected: FAIL — tests can't import `SupplierFormPage` correctly or layout assertions fail.

- [ ] **Step 3: Rewrite `SupplierFormPage.tsx`**

Replace the entire contents of `frontend/src/pages/purchasing/SupplierFormPage.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import AddressSection from '@/components/common/AddressSection'
import PageHeader from '@/components/common/PageHeader'
import { useFieldDuplicateCheck } from '@/hooks/useFieldDuplicateCheck'
import { useNotification } from '@/hooks/useNotification'
import api from '@/services/api'
import {
  useCreateSupplierMutation,
  useLazyCheckDuplicateCompanyNameQuery,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'

const supplierSchema = yup.object({
  companyName: yup.string().required('Company name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['local', 'international']).required('Type is required'),
  contactPerson: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(200, 'Name must be less than 200 characters'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface SupplierFormData {
  companyName: string
  type: SupplierType
  contactPerson?: string | null
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  notes?: string | null
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const SupplierFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loadingSupplier, setLoadingSupplier] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation()
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const [checkDuplicateCompanyName] = useLazyCheckDuplicateCompanyNameQuery()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<SupplierFormData>({
    resolver: yupResolver(supplierSchema) as any,
    defaultValues: {
      companyName: '',
      type: SupplierType.LOCAL,
      contactPerson: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    },
  })

  const watchedCompanyName = watch('companyName')

  useEffect(() => {
    if (!id) return
    setLoadingSupplier(true)
    api.get(`/purchasing/suppliers/${id}`)
      .then((res) => {
        const s: Supplier = res.data?.data ?? res.data
        setSupplier(s)
        reset({
          companyName: s.companyName,
          type: s.type,
          contactPerson: s.contactPerson || null,
          phone: s.phone || null,
          streetAddress: s.streetAddress || null,
          city: s.city || null,
          state: s.state || null,
          postalCode: s.postalCode || null,
          country: s.country || null,
          notes: s.notes || null,
        })
      })
      .catch(() => setLoadError('Supplier not found.'))
      .finally(() => setLoadingSupplier(false))
  }, [id, reset])

  const companyNameCheckFn = async (name: string, excludeId?: string) => {
    const result = await checkDuplicateCompanyName({ companyName: name, excludeId }).unwrap()
    return { exists: result?.exists ?? false, message: result?.message }
  }

  const {
    isChecking: isCheckingDuplicate,
    hasDuplicate: hasCompanyNameDuplicate,
    hasChecked: hasCheckedCompanyName,
    error: companyNameError,
    successMessage: companyNameSuccess,
  } = useFieldDuplicateCheck(watchedCompanyName ?? '', companyNameCheckFn, {
    excludeId: supplier?.id,
    skipCheck: supplier ? watchedCompanyName === supplier.companyName : false,
  })

  const handleFormSubmit = async (data: SupplierFormData) => {
    if (hasCompanyNameDuplicate) {
      showError(companyNameError ?? 'Company name already exists')
      return
    }

    const cleanedData = {
      ...data,
      contactPerson: data.contactPerson?.trim() || null,
      phone: data.phone?.trim() || null,
      streetAddress: data.streetAddress?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || null,
      notes: data.notes?.trim() || null,
    }

    try {
      if (isEdit && id) {
        await updateSupplier({ id, data: cleanedData }).unwrap()
        showSuccess('Supplier updated successfully')
      } else {
        await createSupplier(cleanedData).unwrap()
        showSuccess('Supplier created successfully')
      }
      navigate('/purchasing/suppliers')
    } catch (error: any) {
      showError(`Failed to ${isEdit ? 'update' : 'create'} supplier: ${error?.message ?? error}`)
    }
  }

  if (loadingSupplier) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError) {
    return <Alert severity="error">{loadError}</Alert>
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Supplier' : 'New Supplier'}
        subtitle={isEdit ? `Editing ${supplier?.companyName ?? ''}` : 'Add a new supplier to your account'}
        variant="workflow"
        backAction={() => navigate('/purchasing/suppliers')}
      />
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <Grid container spacing={3}>
          {/* Main Card */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <FormControl fullWidth size="small" error={!!errors.type} sx={fieldSx}>
                          <InputLabel>Supplier Type</InputLabel>
                          <Select {...field} label="Supplier Type">
                            <MenuItem value={SupplierType.LOCAL}>Local</MenuItem>
                            <MenuItem value={SupplierType.INTERNATIONAL}>International</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  </Grid>

                  <Grid size={12}>
                    <Controller
                      name="companyName"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          size="small"
                          label="Company Name"
                          error={!!errors.companyName || hasCompanyNameDuplicate}
                          helperText={
                            errors.companyName?.message || companyNameError ||
                            (isCheckingDuplicate ? 'Checking availability...' : '') ||
                            (hasCheckedCompanyName && !hasCompanyNameDuplicate ? companyNameSuccess : '')
                          }
                          slotProps={{
                            input: {
                              endAdornment: isCheckingDuplicate ? <CircularProgress size={16} /> : null,
                            },
                          }}
                          sx={{
                            ...fieldSx,
                            '& .MuiFormHelperText-root': {
                              color: hasCompanyNameDuplicate ? 'error.main' :
                                (hasCheckedCompanyName && !hasCompanyNameDuplicate ? 'success.main' : undefined),
                            },
                          }}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="contactPerson"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value || ''}
                          fullWidth
                          size="small"
                          label="Contact Person"
                          error={!!errors.contactPerson}
                          helperText={errors.contactPerson?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="phone"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value || ''}
                          fullWidth
                          size="small"
                          label="Phone"
                          error={!!errors.phone}
                          helperText={errors.phone?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>

                  <AddressSection control={control} errors={errors} />
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Side Card */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      multiline
                      rows={6}
                      size="small"
                      label="Notes"
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                      sx={{ mb: 2, ...fieldSx }}
                    />
                  )}
                />

                <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Button variant="outlined" fullWidth onClick={() => navigate('/purchasing/suppliers')} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={isSaving || isCheckingDuplicate || hasCompanyNameDuplicate}
                  >
                    {isSaving
                      ? (isEdit ? 'Updating...' : 'Creating...')
                      : (isEdit ? 'Update Supplier' : 'Create Supplier')
                    }
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </form>
    </>
  )
}

export default SupplierFormPage
```

- [ ] **Step 4: Run all SupplierFormPage tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SupplierFormPage.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "SupplierFormPage|useFieldDuplicateCheck" | head -20
```

Expected: No errors for these files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/SupplierFormPage.tsx frontend/src/pages/purchasing/__tests__/SupplierFormPage.test.tsx
git commit -m "feat: modernize SupplierFormPage layout and use useFieldDuplicateCheck (issue #389)"
```

---

## Task 6: Full regression check and PR

- [ ] **Step 1: Run all affected test files**

```bash
cd frontend && npx vitest run \
  src/hooks/__tests__/useFieldDuplicateCheck.test.ts \
  src/pages/inventory/__tests__/CreateProductPage.test.tsx \
  src/pages/inventory/__tests__/ \
  src/pages/sales/__tests__/CustomerFormPage.test.tsx \
  src/pages/purchasing/__tests__/SupplierFormPage.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 2: Full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat: modernize Customer/Supplier forms and add useFieldDuplicateCheck hook (issue #389)" \
  --body "$(cat <<'EOF'
## Summary

- Adds generic `useFieldDuplicateCheck` hook with internal debounce, replacing duplicated inline debounce logic across 4 forms
- Refactors `useDuplicateCheck` and `useCategoryDuplicateCheck` as thin wrappers over the new hook
- Removes inline debounce `useEffect` from `CreateProductPage` and `CategoryDialogs`
- Rewrites `CustomerFormPage` and `SupplierFormPage` with `variant='workflow'` PageHeader, 8/4 card layout, `size='small'` density, side-card actions, and `✓ Available` success feedback on duplicate-check fields
- Adds `SupplierFormPage.test.tsx` (new) and extends `CustomerFormPage.test.tsx`

Closes #389

## Test plan

- [ ] `useFieldDuplicateCheck` unit tests pass
- [ ] `CreateProductPage` tests pass (no regressions)
- [ ] Inventory `CategoryDialogs` tests pass (no regressions)
- [ ] `CustomerFormPage` tests pass including new phone duplicate tests
- [ ] `SupplierFormPage` tests pass including new company name duplicate tests
- [ ] TypeScript check passes
- [ ] Manually verify Customer form: workflow header, card layout, phone `✓ Available` feedback
- [ ] Manually verify Supplier form: workflow header, card layout, company name `✓ Available` feedback

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for Implementer

- `AddressSection` accepts only `control` and `errors` — it does not support a `size` prop. Its fields use default sizing; this is consistent with the existing form behavior.
- `useDuplicateCheck` now accepts an optional `props` argument. `CreateProductPage` must pass `{ name: watchedName, barcode: watchedBarcode, excludeId }` — the hook no longer self-activates from an imperative call.
- The `checkFnRef` pattern in `useFieldDuplicateCheck` prevents stale closure issues when `checkFn` is defined inline in the component body without `useCallback`.
