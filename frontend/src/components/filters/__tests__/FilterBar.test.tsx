import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilterBar } from '../FilterBar'
import type { ActiveChip, FilterBarConfig, FilterBarHandlers } from '../filterBar.types'

interface Filters {
  search: string
  status: string | null
  tags: string[]
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }] },
  ],
  defaults: { search: '', status: null, tags: [] },
}

const handlers: FilterBarHandlers<Filters> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onAdvancedDraftChange: vi.fn(),
  onAdvancedApply: vi.fn(),
  onAdvancedCancel: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

const baseProps = {
  config,
  draftFilters: { search: '', status: null, tags: [] },
  handlers,
  activeChips: [] as ActiveChip<keyof Filters>[],
  hasActiveFilters: false,
  hasUnappliedChanges: false,
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
    const resetButton = screen.getByRole('button', { name: /reset/i })
    expect(resetButton).toHaveClass('MuiButton-outlined')
    expect(resetButton).toHaveClass('MuiButton-colorInherit')
    fireEvent.click(resetButton)
    expect(handlers.onClearAll).toHaveBeenCalled()
  })

  it('renders chips and allows removal', () => {
    const { container } = render(<FilterBar {...baseProps} activeChips={[{ field: 'status', label: 'Status: Active' }]} hasActiveFilters={true} />)
    expect(screen.getByText('Status: Active')).toBeInTheDocument()
    const deleteIcon = container.querySelector('svg[data-testid="CancelIcon"]')
    expect(deleteIcon).not.toBeNull()
    fireEvent.click(deleteIcon as Element)
    expect(handlers.onClearField).toHaveBeenCalledWith('status')
  })

  it('opens advanced drawer and forwards actions', () => {
    render(<FilterBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(screen.getAllByText('Tags').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeDisabled()
  })
})
