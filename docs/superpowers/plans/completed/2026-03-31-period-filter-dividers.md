# Period Filter Dividers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual `<Divider />` separators between four logical groups in the period filter dropdown.

**Architecture:** Add a `PERIOD_GROUPS` constant to `periods.ts` that defines display order and group boundaries. Update `FilterPeriod.tsx` to render from groups, inserting a `<Divider />` between each group. No other files change.

**Tech Stack:** React 19, MUI v7 (`Select`, `MenuItem`, `Divider`), TypeScript, Vitest

---

### Task 1: Add PERIOD_GROUPS to periods.ts

**Files:**
- Modify: `frontend/src/constants/periods.ts`
- Test: `frontend/src/constants/periods.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/constants/periods.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PERIOD_GROUPS, PERIOD_KEYS, type PeriodKey } from './periods'

describe('PERIOD_GROUPS', () => {
  it('contains exactly four groups', () => {
    expect(PERIOD_GROUPS).toHaveLength(4)
  })

  it('covers every key in PERIOD_KEYS exactly once', () => {
    const flat = PERIOD_GROUPS.flat()
    expect(flat.slice().sort()).toEqual([...PERIOD_KEYS].sort())
    expect(flat).toHaveLength(PERIOD_KEYS.length)
  })

  it('has the correct group order', () => {
    expect(PERIOD_GROUPS[0]).toEqual(['today', 'this_week', 'this_month', 'this_year'])
    expect(PERIOD_GROUPS[1]).toEqual(['yesterday', 'last_week', 'last_month', 'last_year'])
    expect(PERIOD_GROUPS[2]).toEqual(['last_7_days', 'last_30_days', 'last_365_days'])
    expect(PERIOD_GROUPS[3]).toEqual(['custom'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/constants/periods.test.ts
```

Expected: FAIL — `PERIOD_GROUPS` is not exported from `./periods`

- [ ] **Step 3: Add PERIOD_GROUPS to periods.ts**

In `frontend/src/constants/periods.ts`, append after the existing exports:

```ts
export const PERIOD_GROUPS: PeriodKey[][] = [
  ['today', 'this_week', 'this_month', 'this_year'],
  ['yesterday', 'last_week', 'last_month', 'last_year'],
  ['last_7_days', 'last_30_days', 'last_365_days'],
  ['custom'],
]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/constants/periods.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/constants/periods.ts frontend/src/constants/periods.test.ts
git commit -m "feat(periods): add PERIOD_GROUPS constant for grouped display order"
```

---

### Task 2: Update FilterPeriod.tsx to render with dividers

**Files:**
- Modify: `frontend/src/components/filters/FilterPeriod.tsx`
- Test: `frontend/src/components/filters/FilterPeriod.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/filters/FilterPeriod.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { FilterPeriod } from './FilterPeriod'

function renderFilterPeriod(value = 'today', onChange = vi.fn()) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <FilterPeriod value={value as any} customFrom={null} customTo={null} onChange={onChange} />
    </LocalizationProvider>,
  )
}

describe('FilterPeriod', () => {
  it('renders the period select', () => {
    renderFilterPeriod()
    expect(screen.getByLabelText('Period')).toBeInTheDocument()
  })

  it('renders dividers between groups in the dropdown', async () => {
    const user = userEvent.setup()
    renderFilterPeriod()
    await user.click(screen.getByLabelText('Period'))
    // MUI renders Divider as <hr> elements inside the listbox
    const listbox = screen.getByRole('listbox')
    const dividers = listbox.querySelectorAll('hr')
    expect(dividers).toHaveLength(3)
  })

  it('renders all period options', async () => {
    const user = userEvent.setup()
    renderFilterPeriod()
    await user.click(screen.getByLabelText('Period'))
    expect(screen.getByRole('option', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Last 7 Days' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Custom Range' })).toBeInTheDocument()
  })

  it('calls onChange when an option is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterPeriod value="today" customFrom={null} customTo={null} onChange={onChange} />
      </LocalizationProvider>,
    )
    await user.click(screen.getByLabelText('Period'))
    await user.click(screen.getByRole('option', { name: 'Yesterday' }))
    expect(onChange).toHaveBeenCalledWith('yesterday')
  })

  it('shows date pickers when custom is selected', () => {
    renderFilterPeriod('custom')
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/filters/FilterPeriod.test.tsx
```

Expected: FAIL — dividers test fails (0 `<hr>` elements found, expected 3)

- [ ] **Step 3: Update FilterPeriod.tsx**

Replace the contents of `frontend/src/components/filters/FilterPeriod.tsx`:

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { Divider, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'

import { PERIOD_GROUPS, PERIOD_LABELS, type PeriodKey } from '@/constants/periods'
import { toMuiDatePickerFormat } from '@/utils/formatters'

interface FilterPeriodProps {
  value: PeriodKey
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey, from?: string, to?: string) => void
}

export function FilterPeriod({ value, customFrom, customTo, onChange }: FilterPeriodProps) {
  const [internalFrom, setInternalFrom] = useState<string | null>(customFrom)
  const [internalTo, setInternalTo] = useState<string | null>(customTo)
  // Memoised once — dateFormat is only updated by the settings page which triggers a full re-render anyway
  const pickerFormat = useMemo(
    () => toMuiDatePickerFormat(localStorage.getItem('dateFormat') || 'DD/MM/YYYY'),
    [],
  )
  const uid = useId()
  const labelId = `${uid}-period-label`
  const selectId = `${uid}-period`

  // Sync internal date state when the parent resets or overrides custom dates externally
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
        <InputLabel id={labelId}>Period</InputLabel>
        <Select
          labelId={labelId}
          id={selectId}
          value={value}
          label="Period"
          onChange={(event) => handleKeyChange(event.target.value as PeriodKey)}
        >
          {PERIOD_GROUPS.map((group, groupIndex) => [
            ...group.map((key) => (
              <MenuItem key={key} value={key}>
                {PERIOD_LABELS[key]}
              </MenuItem>
            )),
            groupIndex < PERIOD_GROUPS.length - 1 && <Divider key={`divider-${groupIndex}`} />,
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
cd frontend && npx vitest run src/components/filters/FilterPeriod.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/FilterPeriod.tsx frontend/src/components/filters/FilterPeriod.test.tsx
git commit -m "feat(filter-period): add dividers between period groups (#230)"
```
