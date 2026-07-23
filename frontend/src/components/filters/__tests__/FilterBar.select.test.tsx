import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { FilterBar } from '@/components/filters/FilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface TestFilters { status: string | null }

const config: FilterBarConfig<TestFilters> = {
  fields: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ],
  defaults: { status: null },
}

function renderBar(onQuickFilterChange = vi.fn()) {
  render(
    <MemoryRouter>
      <FilterBar
        config={config}
        draftFilters={{ status: null }}
        handlers={{
          onSearchChange: vi.fn(),
          onSearchCommit: vi.fn(),
          onQuickFilterChange,
          onClearField: vi.fn(),
          onClearAll: vi.fn(),
        }}
        hasActiveFilters={false}
      />
    </MemoryRouter>,
  )
  return onQuickFilterChange
}

describe('FilterBar select field', () => {
  it('renders the configured options', async () => {
    renderBar()
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Inactive' })).toBeInTheDocument()
  })

  it('reports the selected value', async () => {
    const onQuickFilterChange = renderBar()
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Active' }))
    expect(onQuickFilterChange).toHaveBeenCalledWith('status', 'active')
  })
})
