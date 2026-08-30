import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { describe, expect, it, vi } from 'vitest'

import { FilterDate } from '../FilterDate'

function renderFilterDate(
  value: string | null = '2026-03-15',
  onChange = vi.fn(),
  clearTo: string | null = null,
) {
  return {
    onChange,
    ...render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterDate
          field="asOfDate"
          label="As of Date"
          value={value}
          clearTo={clearTo}
          onChange={onChange}
        />
      </LocalizationProvider>,
    ),
  }
}

describe('FilterDate', () => {
  it('exposes the label as the field accessible name', () => {
    renderFilterDate()
    expect(screen.getByRole('group', { name: /as of date/i })).toBeInTheDocument()
  })

  it('renders the supplied value', () => {
    renderFilterDate('2026-03-15')
    expect(screen.getByRole('group', { name: /as of date/i })).toHaveTextContent('15/03/2026')
  })

  it('renders empty for a null value', () => {
    renderFilterDate(null)
    const field = screen.getByRole('group', { name: /as of date/i })
    expect(field).not.toHaveTextContent(/\d{4}/)
  })

  it('displays clearTo when the filter value is null', () => {
    // Applied state stays null (canonical bare URL) while the control shows the
    // date actually being queried.
    renderFilterDate(null, vi.fn(), '2026-08-30')
    expect(screen.getByRole('group', { name: /as of date/i })).toHaveTextContent('30/08/2026')
  })

  it('calls onClear, not onChange, when the field is cleared', async () => {
    const onChange = vi.fn()
    const onClear = vi.fn()
    render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterDate
          field="asOfDate"
          label="As of Date"
          value="2026-03-15"
          clearTo="2026-08-30"
          onChange={onChange}
          onClear={onClear}
        />
      </LocalizationProvider>,
    )
    const field = screen.getByRole('group', { name: /as of date/i })
    // Every section must be emptied — MUI only reports null once none remain.
    for (const name of [/day/i, /month/i, /year/i]) {
      await userEvent.click(within(field).getByRole('spinbutton', { name }))
      await userEvent.keyboard('{Delete}')
    }
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    // Today must never be written into the filter state.
    expect(onChange).not.toHaveBeenCalledWith('2026-08-30')
    // ...and the control keeps displaying it rather than going blank.
    expect(screen.getByRole('group', { name: /as of date/i })).toHaveTextContent('30/08/2026')
  })

  it('emits null when cleared and no onClear is supplied', async () => {
    const { onChange } = renderFilterDate('2026-03-15')
    const field = screen.getByRole('group', { name: /as of date/i })
    for (const name of [/day/i, /month/i, /year/i]) {
      await userEvent.click(within(field).getByRole('spinbutton', { name }))
      await userEvent.keyboard('{Delete}')
    }
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
  })

  it('emits only the final plausible date while a year is typed', async () => {
    // Typing "2026" commits 0002-08-15, 0020-, 0202- on the way. isValidIsoDate
    // rejects 0002 but ACCEPTS 0202 — a real calendar date — so a plausible-year
    // guard is required on top of it (TransactionLineDialogShell.tsx:137-139).
    const { onChange } = renderFilterDate(null)
    const field = screen.getByRole('group', { name: /as of date/i })
    // MUI X editable targets are the section spinbuttons, NOT the group: focusing
    // the group and typing does nothing. Click the day section first, exactly as
    // TransactionLineDialogShell.test.tsx:148 does.
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('15082026')

    // The positive assertion — without it this test passes even if the
    // component emits nothing at all.
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2026-08-15'))
    // And nothing implausible ever escaped on the way there.
    const emitted = onChange.mock.calls.map((c) => c[0]).filter((v): v is string => v !== null)
    expect(emitted).toEqual(['2026-08-15'])
  })
})
