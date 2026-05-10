# Sales Orders Period Filter — Position & Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the period filter to appear immediately after the search box on Sales Orders and default it to "no selection" (no date filtering), matching the behaviour of the Customer/Payment dropdowns.

**Architecture:** Change `PeriodValue.key` to `PeriodKey | null`, update `FilterPeriod` to render a blank placeholder when `null`, and update `OrdersPage` to reorder fields and default to `null`. The `useFilterBar` hook's internal fallback also needs updating to avoid overriding the page's `null` default.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vitest

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/types/filterBar.types.ts` | `PeriodValue.key: PeriodKey \| null` |
| `frontend/src/components/filters/FilterPeriod.tsx` | Accept `value: PeriodKey \| null`, render placeholder when null |
| `frontend/src/components/filters/FilterBar.tsx` | Pass `periodValue.key` (now `PeriodKey \| null`) — type update only |
| `frontend/src/hooks/useFilterBar.ts` | Change internal fallback default from `this_month` to `null` |
| `frontend/src/pages/sales/OrdersPage.tsx` | Move `period` first in `fields[]`, default to `{ key: null, from: null, to: null }`, update `dateRange` logic |
| `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` | Add test: no period → no date params; update existing period default test |

---

## Task 1: Update `PeriodValue` type to allow null key

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts:5-9`

- [ ] **Step 1: Update the type**

In `frontend/src/types/filterBar.types.ts`, change line 6 from:

```ts
export type PeriodValue = {
  key: PeriodKey
  from: string | null
  to: string | null
}
```

to:

```ts
export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}
```

- [ ] **Step 2: Run TypeScript check to see what breaks**

```bash
cd frontend && npm run type-check 2>&1 | head -60
```

Expected: errors in `FilterPeriod.tsx`, `FilterBar.tsx`, `useFilterBar.ts`, `OrdersPage.tsx` — these are all fixed in subsequent tasks. If errors appear elsewhere, investigate before continuing.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/types/filterBar.types.ts
git commit -m "feat: allow null key in PeriodValue type (#266)"
```

---

## Task 2: Update `FilterPeriod` to handle null key

**Files:**
- Modify: `frontend/src/components/filters/FilterPeriod.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/filters/__tests__/FilterPeriod.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { FilterPeriod } from '../FilterPeriod'

function renderPeriod(value: Parameters<typeof FilterPeriod>[0]['value'], onChange = vi.fn()) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <FilterPeriod value={value} customFrom={null} customTo={null} onChange={onChange} />
    </LocalizationProvider>,
  )
}

describe('FilterPeriod', () => {
  it('shows placeholder label when value is null (no selection)', () => {
    renderPeriod(null)
    // MUI Select with displayEmpty shows the InputLabel text when value is empty
    expect(screen.getByRole('combobox')).toHaveTextContent('')
    // The label "Period" is still present
    expect(screen.getByText('Period')).toBeInTheDocument()
  })

  it('shows selected label when a period key is provided', () => {
    renderPeriod('this_month')
    expect(screen.getByRole('combobox')).toHaveTextContent('This Month')
  })

  it('does not show date pickers when value is null', () => {
    renderPeriod(null)
    expect(screen.queryByLabelText(/from/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/to/i)).not.toBeInTheDocument()
  })

  it('shows date pickers when value is custom', () => {
    renderPeriod('custom')
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/to/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPeriod.test.tsx
```

Expected: FAIL — `value` prop type mismatch / component doesn't handle null yet.

- [ ] **Step 3: Update `FilterPeriod` to handle null key**

Replace the full contents of `frontend/src/components/filters/FilterPeriod.tsx`:

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { Divider, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'

import { PERIOD_GROUPS, PERIOD_LABELS, type PeriodKey } from '@/constants/periods'
import { toMuiDatePickerFormat } from '@/utils/formatters'

interface FilterPeriodProps {
  value: PeriodKey | null
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey, from?: string, to?: string) => void
}

export function FilterPeriod({ value, customFrom, customTo, onChange }: FilterPeriodProps) {
  const [internalFrom, setInternalFrom] = useState<string | null>(customFrom)
  const [internalTo, setInternalTo] = useState<string | null>(customTo)
  const pickerFormat = useMemo(
    () => toMuiDatePickerFormat(localStorage.getItem('dateFormat') || 'DD/MM/YYYY'),
    [],
  )
  const uid = useId()
  const labelId = `${uid}-period-label`
  const selectId = `${uid}-period`

  useEffect(() => {
    setInternalFrom(customFrom)
    setInternalTo(customTo)
  }, [customFrom, customTo])

  const handleKeyChange = (key: PeriodKey) => {
    if (key !== 'custom') {
      setInternalFrom(null)
      setInternalTo(null)
      onChange(key)
      return
    }

    onChange('custom')
  }

  const handleFromChange = (newFrom: string | null) => {
    setInternalFrom(newFrom)

    if (newFrom && internalTo && newFrom <= internalTo) {
      onChange('custom', newFrom, internalTo)
    }
  }

  const handleToChange = (newTo: string | null) => {
    setInternalTo(newTo)

    if (internalFrom && newTo && internalFrom <= newTo) {
      onChange('custom', internalFrom, newTo)
    }
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id={labelId} shrink={value !== null}>Period</InputLabel>
        <Select
          labelId={labelId}
          id={selectId}
          value={value ?? ''}
          label="Period"
          displayEmpty
          onChange={(event) => handleKeyChange(event.target.value as PeriodKey)}
        >
          {PERIOD_GROUPS.map((group, groupIndex) => [
            ...group.map((key) => (
              <MenuItem key={key} value={key}>
                {PERIOD_LABELS[key]}
              </MenuItem>
            )),
            groupIndex < PERIOD_GROUPS.length - 1 ? (
              <Divider key={`divider-${groupIndex}`} />
            ) : null,
          ])}
        </Select>
      </FormControl>

      {value === 'custom' && (
        <>
          <DatePicker
            label="From"
            value={internalFrom ? parseISO(internalFrom) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleFromChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="To"
            value={internalTo ? parseISO(internalTo) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleToChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        </>
      )}
    </Stack>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPeriod.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/filters/__tests__/FilterPeriod.test.tsx src/components/filters/FilterPeriod.tsx
git commit -m "feat: FilterPeriod handles null key as unselected placeholder (#266)"
```

---

## Task 3: Update `FilterBar` type reference

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx:50-58`

`FilterBar` passes `periodValue.key` to `FilterPeriod`. Since `PeriodValue.key` is now `PeriodKey | null`, the `satisfies PeriodValue` constraint on line 58 already covers the new type — but we need to verify the `onChange` callback still type-checks correctly.

- [ ] **Step 1: Run TypeScript check on FilterBar**

```bash
cd frontend && npm run type-check 2>&1 | grep FilterBar
```

Expected: no errors for FilterBar. The `periodValue.key` is passed directly and `FilterPeriod` now accepts `PeriodKey | null`, so it should type-check cleanly.

If there are errors, read them and fix the cast on line 54:
```ts
const periodValue = value as PeriodValue
```
This remains unchanged — `PeriodValue` already includes `key: PeriodKey | null` after Task 1.

- [ ] **Step 2: Commit (only if a change was needed)**

If no code change was required, skip this commit. If a fix was needed:

```bash
cd frontend && git add src/components/filters/FilterBar.tsx
git commit -m "fix: update FilterBar cast for nullable PeriodValue key (#266)"
```

---

## Task 4: Update `useFilterBar` internal period fallback

**Files:**
- Modify: `frontend/src/hooks/useFilterBar.ts:24-26`

The `getDefaults` function has a hardcoded fallback of `this_month` for period fields (line 25). This is only reached when the page does not provide a `defaults` entry for the period field. Since `OrdersPage` will provide its own default (`null`), this fallback won't be hit for Sales Orders — but it should be updated to `null` for correctness and to avoid surprising future pages.

- [ ] **Step 1: Write a failing test**

Open `frontend/src/hooks/useFilterBar.test.tsx` and add a test in the existing describe block:

```tsx
it('defaults period key to null when no default is configured', () => {
  const config: FilterBarConfig<{ period: PeriodValue }> = {
    fields: [{ field: 'period', label: 'Period', type: 'period' }],
  }

  const { result } = renderHook(() => useFilterBar(config), { wrapper: Wrapper })
  expect(result.current.appliedFilters.period.key).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx
```

Expected: FAIL — `period.key` is `'this_month'`, not `null`.

- [ ] **Step 3: Update the fallback in `useFilterBar.ts`**

In `frontend/src/hooks/useFilterBar.ts`, change line 25 from:

```ts
    else if (field.type === 'period') {
      defaults[key] = { key: 'this_month', from: null, to: null } satisfies PeriodValue
    }
```

to:

```ts
    else if (field.type === 'period') {
      defaults[key] = { key: null, from: null, to: null } satisfies PeriodValue
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx
```

Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/hooks/useFilterBar.ts src/hooks/useFilterBar.test.tsx
git commit -m "feat: default period filter key to null in useFilterBar (#266)"
```

---

## Task 5: Update `OrdersPage` — reorder fields, set null default, fix dateRange logic

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx:65-119`
- Modify: `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Write failing tests**

Add the following tests to `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`:

```tsx
it('sends no fromDate or toDate when period is not selected (default)', () => {
  renderPage()
  expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
    expect.objectContaining({
      fromDate: undefined,
      toDate: undefined,
    }),
  )
})

it('period filter appears before customer filter in the DOM', () => {
  renderPage()
  const periodLabel = screen.getByText('Period')
  const customerLabel = screen.getByText('Customer')
  // Period should appear before Customer in document order
  expect(
    periodLabel.compareDocumentPosition(customerLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

Expected: FAIL — currently `fromDate`/`toDate` are populated (this_month range), and period field is 3rd not 1st.

- [ ] **Step 3: Update `OrdersPage.tsx`**

Make three changes in `frontend/src/pages/sales/OrdersPage.tsx`:

**Change 1** — Move `period` to first in `fields[]` (lines 65–97). Replace the `fields` array:

```ts
fields: [
  {
    field: 'period',
    label: 'Period',
    type: 'period',
  },
  {
    field: 'customerId',
    label: 'Customer',
    type: 'select',
    options: customers.map((customer) => ({ value: customer.id, label: customer.name })),
  },
  {
    field: 'paymentStatus',
    label: 'Payment',
    type: 'select',
    options: [
      { value: 'unpaid', label: 'Unpaid' },
      { value: 'partial', label: 'Partial' },
      { value: 'paid', label: 'Paid' },
      { value: 'overpaid', label: 'Overpaid' },
    ],
  },
  {
    field: 'fulfillmentStatus',
    label: 'Fulfillment',
    type: 'select',
    options: [
      { value: 'unfulfilled', label: 'Unfulfilled' },
      { value: 'fulfilled', label: 'Fulfilled' },
    ],
  },
],
```

**Change 2** — Update defaults (line 102):

```ts
defaults: {
  search: '',
  customerId: null,
  paymentStatus: null,
  period: { key: null, from: null, to: null },
  fulfillmentStatus: null,
},
```

**Change 3** — Update `dateRange` logic (lines 111–119):

```ts
const dateRange = useMemo(() => {
  const period = appliedFilters.period
  if (!period || period.key === null) {
    return { fromDate: undefined, toDate: undefined }
  }
  if (period.key === 'custom') {
    return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
  }
  const range = getPeriodDateRange(period.key, weekStartsOn)
  return { fromDate: range.from, toDate: range.to }
}, [appliedFilters.period, weekStartsOn])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

Expected: PASS (all tests).

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/sales/OrdersPage.tsx src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
git commit -m "feat: move period filter first, default to no selection on Sales Orders (#266)"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run all filter-related tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterPeriod.test.tsx src/hooks/useFilterBar.test.tsx src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx src/utils/filterBar.url.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start the frontend dev server:
```bash
cd frontend && npm run dev
```

Navigate to Sales Orders (`/sales/orders`). Verify:
1. Period dropdown appears immediately after the search box (before Customer).
2. Period dropdown shows "Period" as a greyed-out placeholder with no value selected.
3. All orders load (no date filtering applied by default).
4. Selecting a period (e.g. "This Month") filters orders correctly.
5. Clicking "Reset" returns the period to unselected (no date filter).
6. On mobile, the filter bar wraps cleanly.
