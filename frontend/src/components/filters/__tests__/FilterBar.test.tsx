import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilterBar } from '../FilterBar'
import type { FilterBarConfig, FilterBarHandlers } from '../filterBar.types'

interface Filters {
  search: string
  status: string | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  quick: [
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

  it('shows reset only with active filters', () => {
    const { rerender } = render(<FilterBar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    rerender(<FilterBar {...baseProps} hasActiveFilters={true} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(handlers.onClearAll).toHaveBeenCalled()
  })
})
