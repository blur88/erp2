import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FilterPeriod } from './FilterPeriod'

function renderFilterPeriod(
  value: Parameters<typeof FilterPeriod>[0]['value'] = 'today',
  customFrom: string | null = null,
  customTo: string | null = null,
  onChange = vi.fn(),
) {
  return {
    onChange,
    ...render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterPeriod
          value={value}
          customFrom={customFrom}
          customTo={customTo}
          onChange={onChange}
        />
      </LocalizationProvider>,
    ),
  }
}

describe('FilterPeriod', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the trigger button with a preset label', () => {
    renderFilterPeriod('today')
    expect(screen.getByRole('button', { name: /Period: Today/i })).toBeInTheDocument()
  })

  it('renders the trigger button with a custom date range label', () => {
    renderFilterPeriod('custom', '2024-01-15', '2024-01-31')
    expect(screen.getByRole('button', { name: /15\/01\/2024 - 31\/01\/2024/i })).toBeInTheDocument()
  })

  it('renders the trigger button with no label when value is null', () => {
    renderFilterPeriod(null)
    expect(screen.getByRole('button', { name: /Period$/i })).toBeInTheDocument()
  })

  it('opens the popover when the trigger button is clicked', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('today')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('renders all selectable period options in the popover', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('today')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('option', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Last 7 Days' })).toBeInTheDocument()
  })

  it('"Custom Range" heading is visible but not selectable', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('today')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    // Should appear as text, not as an option role
    expect(screen.getByText('Custom Range')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Custom Range' })).not.toBeInTheDocument()
  })

  it('calls onChange immediately and closes popover when a preset is clicked', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilterPeriod('today')

    await user.click(screen.getByRole('button', { name: /Period/i }))
    await user.click(screen.getByRole('option', { name: 'Yesterday' }))

    expect(onChange).toHaveBeenCalledWith('yesterday')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('always shows the From/To date pickers inside the popover', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('today')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('group', { name: 'From' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'To' })).toBeInTheDocument()
  })

  it('Apply button is disabled when only From is set', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('custom', '2024-01-15', null)

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('button', { name: /Apply/i })).toBeDisabled()
  })

  it('Apply button is disabled when only To is set', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('custom', null, '2024-01-31')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('button', { name: /Apply/i })).toBeDisabled()
  })

  it('Apply button is disabled when From > To', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('custom', '2024-02-01', '2024-01-01')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('button', { name: /Apply/i })).toBeDisabled()
  })

  it('Apply button is enabled when both dates are valid and From <= To', async () => {
    const user = userEvent.setup()
    renderFilterPeriod('custom', '2024-01-15', '2024-01-31')

    await user.click(screen.getByRole('button', { name: /Period/i }))

    expect(screen.getByRole('button', { name: /Apply/i })).toBeEnabled()
  })

  it('clicking Apply calls onChange with custom dates and closes popover', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilterPeriod('custom', '2024-01-15', '2024-01-31')

    await user.click(screen.getByRole('button', { name: /Period/i }))
    await user.click(screen.getByRole('button', { name: /Apply/i }))

    expect(onChange).toHaveBeenCalledWith('custom', '2024-01-15', '2024-01-31')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
