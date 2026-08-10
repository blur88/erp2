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

function renderBarWith(
  fieldOverrides: Partial<{
    options: { value: string; label: string }[]
    optionsReady: boolean
    optionsLoading: boolean
  }>,
  draftValue: string | null,
) {
  const asyncConfig: FilterBarConfig<TestFilters> = {
    fields: [
      {
        field: 'status',
        label: 'Status',
        type: 'select',
        options: [],
        ...fieldOverrides,
      },
    ],
    defaults: { status: null },
  }

  render(
    <MemoryRouter>
      <FilterBar
        config={asyncConfig}
        draftFilters={{ status: draftValue }}
        handlers={{
          onSearchChange: vi.fn(),
          onSearchCommit: vi.fn(),
          onQuickFilterChange: vi.fn(),
          onClearField: vi.fn(),
          onClearAll: vi.fn(),
        }}
        hasActiveFilters={false}
      />
    </MemoryRouter>,
  )
}

describe('FilterBar select with async options', () => {
  it('disables the control while options are loading', () => {
    renderBarWith({ optionsReady: false, optionsLoading: true }, null)
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('shows a loading placeholder for an unmatched value while loading', () => {
    renderBarWith({ optionsReady: false, optionsLoading: true }, 'acct-1')
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveTextContent('Loading…')
  })

  it('keeps the empty label when loading with no value', () => {
    renderBarWith({ optionsReady: false, optionsLoading: true }, null)
    // Assert the empty label positively, not merely the absence of "Loading…".
    const combobox = screen.getByRole('combobox', { name: /status/i })
    expect(combobox).toHaveTextContent('All')
    expect(combobox).not.toHaveTextContent('Loading…')
  })

  it('stays enabled and shows the raw id when the options query errored', () => {
    renderBarWith({ optionsReady: false, optionsLoading: false }, 'acct-1')
    const combobox = screen.getByRole('combobox', { name: /status/i })
    expect(combobox).not.toHaveAttribute('aria-disabled', 'true')
    expect(combobox).toHaveTextContent('acct-1')
  })

  it('renders no stand-in item when the errored state has no value', async () => {
    // The errored control stays ENABLED, so the listbox opens and MUI actually
    // mounts its items — unlike the loading case, where a disabled control never
    // mounts any. That makes this the one state where the `value !== null` guard
    // on hasUnresolvedValue is observable: without it, a synthetic item renders
    // alongside the empty item and this count goes to 2.
    renderBarWith({ optionsReady: false, optionsLoading: false }, null)
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('All')
  })

  it('renders normally once options are ready', async () => {
    renderBarWith(
      { options: [{ value: 'active', label: 'Active' }], optionsReady: true },
      'active',
    )
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveTextContent('Active')
  })
})
