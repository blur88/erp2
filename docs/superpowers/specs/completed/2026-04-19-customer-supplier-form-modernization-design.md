# Design: Customer & Supplier Form UI/UX Modernization

**Issue:** #389  
**Date:** 2026-04-19  
**Scope:** `CustomerFormPage`, `SupplierFormPage`, shared duplicate-check hook, existing hook refactors

---

## Overview

Modernize the Customer and Supplier form pages to match the layout, density, and interaction patterns established by `CreateProductPage` and `CreateSalesOrderPage`. Simultaneously extract all inline duplicate-check logic into a new generic `useFieldDuplicateCheck` hook and refactor existing hooks to use it.

---

## Section 1: New Generic Hook — `useFieldDuplicateCheck`

**File:** `frontend/src/hooks/useFieldDuplicateCheck.ts`

### Interface

```ts
interface UseFieldDuplicateCheckOptions {
  excludeId?: string
  minLength?: number    // default: 2
  debounceMs?: number   // default: 500
  skipCheck?: boolean   // when true, clears state and does not fire checkFn
}

interface UseFieldDuplicateCheckReturn {
  isChecking: boolean
  hasDuplicate: boolean
  hasChecked: boolean
  error: string | null
  successMessage: string | null  // "✓ Available" when hasChecked && !hasDuplicate
}

function useFieldDuplicateCheck(
  value: string,
  checkFn: (value: string, excludeId?: string) => Promise<{ exists: boolean; message?: string }>,
  options?: UseFieldDuplicateCheckOptions
): UseFieldDuplicateCheckReturn
```

### Behavior

- Single `useEffect` watches `value`, `excludeId`, `skipCheck`.
- If `skipCheck` is true or `value.trim().length < minLength`: clears all state, returns early.
- Otherwise: sets `isChecking = true`, waits `debounceMs`, calls `checkFn(value.trim(), excludeId)`.
- On result: sets `hasDuplicate`, `error` (from `message`), `hasChecked = true`.
- On clean result: sets `successMessage = "✓ Available"`.
- Cleanup cancels the pending debounce timer on re-render.
- `checkFn` errors are silently swallowed (sets `hasDuplicate = false`, clears error) — consistent with existing behavior across all current implementations.

### Why debounce lives inside the hook

Debounce logic is currently duplicated in every caller (6 instances across 4 files). Centralizing it means one place to change timing, one place to add future features (e.g., AbortController for in-flight cancellation), and zero boilerplate for new forms.

---

## Section 2: Refactor Existing Hooks

### `useDuplicateCheck.ts` (products)

Refactored to call `useFieldDuplicateCheck` twice — once for `name`, once for `barcode`.

**Public API unchanged:**
```ts
{
  checkDuplicate,       // kept as imperative trigger for submit-time validation
  isChecking,
  nameError,
  barcodeError,
  hasNameDuplicate,
  hasBarcodeDuplicate,
  hasCheckedName,
  hasCheckedBarcode,
}
```

The two `useFieldDuplicateCheck` instances handle real-time feedback. The existing `checkDuplicate` callback is retained for the submit-gate check in `CreateProductPage`.

**`CreateProductPage.tsx` change:** Remove the inline debounce `useEffect` (lines 290–304) — the hook now handles it.

### `useCategoryDuplicateCheck.ts` (categories)

Refactored to call `useFieldDuplicateCheck` once for `name`.

**Public API unchanged:**
```ts
{
  checkDuplicate,
  isChecking,
  nameError,
  hasNameDuplicate,
  hasCheckedName,
}
```

**`CategoryDialogs.tsx` change:** Remove the inline debounce `useEffect` (lines 106–118) — the hook now handles it.

---

## Section 3: Layout & Styling — Both Forms

### PageHeader

`variant='standard'` → `variant='workflow'`

Add `backAction` callback:
- Customer: `() => navigate('/sales/customers')`
- Supplier: `() => navigate('/purchasing/suppliers')`

### Grid Layout

Replace single `<Paper sx={{ p: 3, maxWidth: 800 }}>` with a full-width two-column `<Grid container spacing={3}>`:

```
┌─────────────────────────────┬──────────────────┐
│  Main Card (8/12)           │  Side Card (4/12) │
│  Basic Information          │  [Customer only]  │
│  ─ Type (select)            │  Price List       │
│  ─ Name / Company Name      │  ───────────────  │
│  ─ Phone                    │  Notes            │
│  ─ [Supplier only]          │  (multiline)      │
│    Contact Person           │                   │
│                             │  Cancel           │
│  Address Section            │  Create / Update  │
│  (AddressSection component) │                   │
└─────────────────────────────┴──────────────────┘
```

### Density

All fields receive `size='small'` and the following `sx` override:
```ts
sx={{
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}}
```

### Actions

`CustomerFormActions` and `SupplierFormActions` sub-components are removed. Cancel and Submit buttons move into the side card, `fullWidth`, stacked vertically (Cancel above Submit), matching `ProductAdditionalInformationCard`.

---

## Section 4: Duplicate Check Integration

### CustomerFormPage — phone field

**Before:** inline `checkPhoneDuplicate` callback + `useMemo` debounce + `isCheckingPhone` / `phoneError` state.

**After:**
```ts
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

const { isChecking: isCheckingPhone, hasDuplicate: hasPhoneDuplicate, hasChecked: hasCheckedPhone, error: phoneError, successMessage: phoneSuccess } =
  useFieldDuplicateCheck(watchedPhone ?? '', phoneCheckFn, {
    excludeId: customer?.id,
    skipCheck: !watchedPhone,
  })
```

The rewrite must add `const watchedPhone = watch('phone')` to feed the hook's `value` argument.

Phone field shows `successMessage` when available (matching Product name pattern).

### SupplierFormPage — company name field

**Before:** inline `useEffect` + `useLazyCheckDuplicateCompanyNameQuery`.

**After:**
```ts
const [checkDuplicateCompanyName] = useLazyCheckDuplicateCompanyNameQuery()

const companyNameCheckFn = async (name: string, excludeId?: string) => {
  const result = await checkDuplicateCompanyName({ companyName: name, excludeId }).unwrap()
  return { exists: result?.exists ?? false, message: result?.message }
}

const { isChecking: isCheckingDuplicate, hasDuplicate: hasCompanyNameDuplicate, hasChecked: hasCheckedCompanyName, error: companyNameError, successMessage: companyNameSuccess } =
  useFieldDuplicateCheck(watchedCompanyName ?? '', companyNameCheckFn, {
    excludeId: supplier?.id,
    skipCheck: supplier ? watchedCompanyName === supplier.companyName : false,
  })
```

Company name field shows `successMessage` when available.

---

## Section 5: Testing

### New: `hooks/__tests__/useFieldDuplicateCheck.test.ts`

- Fires `checkFn` after debounce delay (use `vi.useFakeTimers`)
- Does not fire when `skipCheck = true`
- Does not fire when `value.length < minLength`
- Sets `hasDuplicate = true` and `error` when `checkFn` returns `exists: true`
- Sets `successMessage` when `checkFn` returns `exists: false`
- Cancels pending debounce on value change before delay elapses
- Swallows `checkFn` errors silently

### Edit: `pages/sales/__tests__/CustomerFormPage.test.tsx`

Add to existing test suite:
- Phone duplicate error shown when `mockApiGet` returns a matching customer
- `✓ Available` shown when `mockApiGet` returns no match and field has sufficient length

### New: `pages/purchasing/__tests__/SupplierFormPage.test.tsx`

Mirror structure of `CustomerFormPage.test.tsx`:
- Create mode: renders form, validation error on empty submit, success path calls `createSupplier` and navigates
- Edit mode: pre-populates fields from API, success path calls `updateSupplier` and navigates
- Company name duplicate: error shown, submit blocked
- Company name available: `✓ Available` shown

---

## Section 6: Files Changed

| File | Action |
|---|---|
| `frontend/src/hooks/useFieldDuplicateCheck.ts` | **Create** |
| `frontend/src/hooks/__tests__/useFieldDuplicateCheck.test.ts` | **Create** |
| `frontend/src/hooks/useDuplicateCheck.ts` | **Refactor** — thin wrapper over `useFieldDuplicateCheck` |
| `frontend/src/hooks/useCategoryDuplicateCheck.ts` | **Refactor** — thin wrapper over `useFieldDuplicateCheck` |
| `frontend/src/pages/inventory/CreateProductPage.tsx` | **Edit** — remove inline debounce `useEffect` |
| `frontend/src/pages/inventory/components/CategoryDialogs.tsx` | **Edit** — remove inline debounce `useEffect` |
| `frontend/src/pages/sales/CustomerFormPage.tsx` | **Rewrite** — new layout + `useFieldDuplicateCheck` |
| `frontend/src/pages/purchasing/SupplierFormPage.tsx` | **Rewrite** — new layout + `useFieldDuplicateCheck` |
| `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx` | **Edit** — add duplicate check tests |
| `frontend/src/pages/purchasing/__tests__/SupplierFormPage.test.tsx` | **Create** |

---

## Out of Scope

- No backend changes
- No changes to `AddressSection`, `PriceListSelector`, or other shared components
- No changes to `useDuplicateCheck` or `useCategoryDuplicateCheck` public APIs
- `CreateProductPage` and `CategoryDialogs` layout/styling not changed — only debounce useEffect removed
