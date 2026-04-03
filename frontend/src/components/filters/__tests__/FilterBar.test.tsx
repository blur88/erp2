import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FilterBarConfig, FilterBarHandlers, PeriodValue } from '@/types/filterBar.types'
import { FilterBar } from '../FilterBar'

interface Filters {
  search: string
  status: string | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  defaults: { search: '', status: null },
}

const handlers: FilterBarHandlers<Filters> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

const baseProps = {
  config,
  draftFilters: { search: '', status: null },
  handlers,
  hasActiveFilters: false,
}

describe('FilterBar', () => {
  it('renders search and quick filters', () => {
    render(<FilterBar {...baseProps} />)
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument()
  })

  it('renders the optional sort button and calls onSort', () => {
    const onSort = vi.fn()

    render(
      <FilterBar
        {...baseProps}
        sort={{
          field: 'orderNumber',
          sortBy: 'orderNumber',
          sortOrder: 'desc',
          onSort,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /sort/i }))
    expect(onSort).toHaveBeenCalledWith('orderNumber')
  })

  it('renders sort button in inactive state when sortBy differs from field', () => {
    render(
      <FilterBar
        {...baseProps}
        sort={{
          field: 'orderNumber',
          sortBy: 'orderDate',
          sortOrder: 'asc',
          onSort: vi.fn(),
        }}
      />,
    )

    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn).toBeInTheDocument()
    // inactive: MUI outlined variant has no contained class
    expect(btn.className).not.toMatch(/MuiButton-contained/)
  })

  it('shows reset only with active filters', () => {
    const { rerender } = render(<FilterBar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    rerender(<FilterBar {...baseProps} hasActiveFilters={true} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(handlers.onClearAll).toHaveBeenCalled()
  })
})

describe('FilterBar — period field', () => {
  it('renders FilterPeriod when type is period', () => {
    interface PeriodFilters {
      period: PeriodValue
    }

    const periodConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
    }

    const periodHandlers: FilterBarHandlers<PeriodFilters> = {
      onSearchChange: vi.fn(),
      onSearchCommit: vi.fn(),
      onQuickFilterChange: vi.fn(),
      onClearField: vi.fn(),
      onClearAll: vi.fn(),
    }

    render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterBar
          config={periodConfig}
          draftFilters={{ period: { key: 'this_month', from: null, to: null } }}
          handlers={periodHandlers}
          hasActiveFilters={false}
        />
      </LocalizationProvider>,
    )

    expect(screen.getByLabelText(/period/i)).toBeInTheDocument()
  })
})
