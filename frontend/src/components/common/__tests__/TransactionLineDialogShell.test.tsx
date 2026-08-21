import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TransactionLineDialogShell, {
  DialogLineRow,
  TransactionDateField,
} from '../TransactionLineDialogShell'

function renderShell(props: Partial<ComponentProps<typeof TransactionLineDialogShell>> = {}) {
  const defaults = {
    open: true,
    title: 'Record Payment — SO-26-001',
    onRequestClose: vi.fn(),
    summary: <div>SUMMARY_SLOT</div>,
    children: <div>LINES_SLOT</div>,
    totals: <div>TOTALS_SLOT</div>,
    alerts: <div>ALERTS_SLOT</div>,
    actions: <button type="button">Cancel</button>,
    discardOpen: false,
    discardTitle: 'Discard this payment?',
    onKeepEditing: vi.fn(),
    onDiscard: vi.fn(),
  }
  return render(<TransactionLineDialogShell {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransactionLineDialogShell structure', () => {
  it('renders at maxWidth md and fullWidth', () => {
    const { container } = renderShell()
    expect(container.ownerDocument.querySelector('.MuiDialog-paperWidthMd')).toBeTruthy()
    expect(container.ownerDocument.querySelector('.MuiDialog-paperFullWidth')).toBeTruthy()
  })

  it('labels the dialog by its rendered title element', () => {
    renderShell()
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const titleEl = dialog.ownerDocument.getElementById(labelledBy as string)
    expect(titleEl).toHaveTextContent('Record Payment — SO-26-001')
  })

  it('renders every content slot when not loading', () => {
    renderShell()
    expect(screen.getByText('SUMMARY_SLOT')).toBeInTheDocument()
    expect(screen.getByText('LINES_SLOT')).toBeInTheDocument()
    expect(screen.getByText('TOTALS_SLOT')).toBeInTheDocument()
    expect(screen.getByText('ALERTS_SLOT')).toBeInTheDocument()
  })
})

describe('TransactionLineDialogShell loading', () => {
  it('replaces the entire content region with a spinner', () => {
    renderShell({ loading: true })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('SUMMARY_SLOT')).not.toBeInTheDocument()
    expect(screen.queryByText('LINES_SLOT')).not.toBeInTheDocument()
    expect(screen.queryByText('TOTALS_SLOT')).not.toBeInTheDocument()
    expect(screen.queryByText('ALERTS_SLOT')).not.toBeInTheDocument()
  })

  it('still renders actions while loading so Cancel stays reachable', () => {
    renderShell({ loading: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})

describe('TransactionLineDialogShell discard confirmation', () => {
  it('shows the discard title when discardOpen is true', () => {
    renderShell({ discardOpen: true })
    expect(screen.getByText('Discard this payment?')).toBeInTheDocument()
  })

  it('fires onKeepEditing from Keep Editing', async () => {
    const onKeepEditing = vi.fn()
    const onDiscard = vi.fn()
    renderShell({ discardOpen: true, onKeepEditing, onDiscard })
    await userEvent.click(screen.getByRole('button', { name: 'Keep Editing' }))
    expect(onKeepEditing).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('fires onDiscard from Discard', async () => {
    const onKeepEditing = vi.fn()
    const onDiscard = vi.fn()
    renderShell({ discardOpen: true, onKeepEditing, onDiscard })
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onKeepEditing).not.toHaveBeenCalled()
  })
})

describe('DialogLineRow', () => {
  // jsdom has no layout engine: these assert the CSS configuration that produces
  // wrapping, NOT that wrapping actually happens. Real layout is browser-verified.
  it('sets flexWrap wrap on the row', () => {
    const { container } = render(
      <DialogLineRow trailing={<span>TRAILING</span>}>
        <span>FIELD</span>
      </DialogLineRow>,
    )
    const row = container.firstElementChild as HTMLElement
    expect(row).toHaveStyle({ display: 'flex', flexWrap: 'wrap' })
  })

  it('groups trailing content into a single flex child with a 248px minimum', () => {
    const { container } = render(
      <DialogLineRow trailing={<span>TRAILING</span>}>
        <span>FIELD</span>
      </DialogLineRow>,
    )
    const row = container.firstElementChild as HTMLElement
    const trailingGroup = row.lastElementChild as HTMLElement
    expect(trailingGroup).toHaveTextContent('TRAILING')
    expect(trailingGroup).toHaveStyle({ minWidth: '248px' })
  })
})

describe('TransactionDateField', () => {
  function renderField(props: Partial<ComponentProps<typeof TransactionDateField>> = {}) {
    const defaults = {
      value: '2026-07-01',
      onChange: vi.fn(),
      label: 'Payment date, line 1',
    }
    return render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <TransactionDateField {...defaults} {...props} />
      </LocalizationProvider>,
    )
  }

  it('renders a picker carrying the supplied accessible name and value', () => {
    renderField()
    expect(screen.getByRole('group', { name: 'Payment date, line 1' })).toHaveTextContent(
      '01/07/2026',
    )
  })

  it('emits a raw YYYY-MM-DD string, never a Date or an ISO instant', async () => {
    const onChange = vi.fn()
    renderField({ value: '', onChange })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('15082026')
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('2026-08-15')
    })
    // The payload must never carry a time component — that is the timezone bug.
    onChange.mock.calls.forEach(([v]) => expect(v).toMatch(/^(\d{4}-\d{2}-\d{2})?$/))
  })

  it('does not emit a value while the date is only partly typed', async () => {
    const onChange = vi.fn()
    renderField({ value: '', onChange })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('15')
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/^\d{4}/))
  })

  it('never emits an implausible intermediate year while the year is typed', async () => {
    const onChange = vi.fn()
    renderField({ value: '', onChange })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('15082026')
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('2026-08-15')
    })
    // Typing the year commits 0002-08-15, then 0020-, then 0202- before
    // landing on 2026. PaymentDialog only checks the date is non-empty, so a
    // leaked intermediate would be submittable.
    onChange.mock.calls.forEach(([v]) => {
      if (v) expect(Number(v.slice(0, 4))).toBeGreaterThan(1000)
    })
  })

  it('keeps the committed value when an existing date is overwritten mid-entry', async () => {
    const onChange = vi.fn()
    renderField({ value: '2026-07-01', onChange })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('15')
    // Mid-overwrite the picker may report Invalid Date; that must never be
    // forwarded as a clear.
    expect(onChange).not.toHaveBeenCalledWith('')
  })

  it('marks a date past max as out of range', async () => {
    const onChange = vi.fn()
    renderField({ value: '', onChange, max: '2030-01-01' })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('01012031')
    // MUI X does NOT suppress onChange past maxDate — it reports the value and
    // flags the field invalid, leaving submit-time validation to the caller.
    // Verified against MUI X v9; asserting suppression here would be wrong.
    await waitFor(() => {
      expect(field).toHaveAttribute('aria-invalid', 'true')
    })
  })

  it('accepts a date within max', async () => {
    const onChange = vi.fn()
    renderField({ value: '', onChange, max: '2030-01-01' })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('15082029')
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('2029-08-15')
    })
  })

  it('is clearable and reports the empty string when cleared', async () => {
    const onChange = vi.fn()
    renderField({ onChange })
    const field = screen.getByRole('group', { name: 'Payment date, line 1' })
    await userEvent.click(within(field).getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
