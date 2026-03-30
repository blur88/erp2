import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FilterPeriod } from './FilterPeriod'

function renderFilterPeriod(value = 'today', onChange = vi.fn()) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <FilterPeriod value={value as any} customFrom={null} customTo={null} onChange={onChange} />
    </LocalizationProvider>,
  )
}

describe('FilterPeriod', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the period select', () => {
    renderFilterPeriod()

    expect(screen.getByLabelText('Period')).toBeInTheDocument()
  })

  it('renders dividers between groups in the dropdown', async () => {
    const user = userEvent.setup()
    renderFilterPeriod()

    await user.click(screen.getByLabelText('Period'))

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

    expect(screen.getAllByText('From').length).toBeGreaterThan(0)
    expect(screen.getAllByText('To').length).toBeGreaterThan(0)
  })
})
