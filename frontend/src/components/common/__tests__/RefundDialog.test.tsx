import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RefundDialog, { type RefundMethodOption, type RefundSeed } from '../RefundDialog'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'

const methods: RefundMethodOption[] = [
  { id: 'pm-1', label: 'Cash' },
  { id: 'pm-2', label: 'Bank Transfer' },
  { id: 'pm-3', label: 'Card' },
]

// Wrap every render — the line date field is a MUI X DatePicker, which throws
// without a localization context.
function renderDialog(props: Partial<ComponentProps<typeof RefundDialog>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    methods,
    seedAllocations: [{ methodId: 'pm-1', amount: '500.0000' }] as RefundSeed[],
    availableForRefund: '500.0000',
    seedTarget: '500.0000',
    orderNumber: 'SO-26-001',
  }
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <RefundDialog {...defaults} {...props} />
    </LocalizationProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RefundDialog', () => {
  it('displays Available for Refund in summary', () => {
    renderDialog()
    expect(screen.getByText('Available for Refund')).toBeInTheDocument()
  })

  it('Available for Refund shows the aggregate passed by the caller', () => {
    renderDialog({ availableForRefund: '400.0000', seedTarget: '400.0000' })
    // Available = 400, passed straight through (no per-method netting).
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })

  it('pre-fills first refund line with Available for Refund amount', () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('500.00')
  })

  it('defaults refund amount to the surplus on an overpaid order', () => {
    renderDialog({ availableForRefund: '500.0000', seedTarget: '200.0000' })
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('200.00')
  })

  it('shows a Surplus over total row when the order is overpaid', () => {
    renderDialog({ availableForRefund: '500.0000', seedTarget: '200.0000' })
    expect(screen.getByText('Surplus over total')).toBeInTheDocument()
  })

  it('hides the Surplus over total row when the order is exactly paid', () => {
    renderDialog()
    expect(screen.queryByText('Surplus over total')).not.toBeInTheDocument()
  })

  it('adds a refund row when Add Refund Row is clicked', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /add refund row/i }))
    expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
  })

  it('remove button is disabled when only one row remains', () => {
    renderDialog()
    const removeButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('svg[data-testid="DeleteIcon"]'),
    )
    expect(removeButtons[0]).toBeDisabled()
  })

  it('Refund button is disabled when total entered is 0', () => {
    renderDialog({ availableForRefund: '0.0000', seedTarget: '0.0000' })
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('Refund button is disabled when total exceeds available', async () => {
    renderDialog({ availableForRefund: '300.0000', seedTarget: '300.0000' })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '400')
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('shows error alert when total exceeds available', async () => {
    renderDialog({ availableForRefund: '300.0000', seedTarget: '300.0000' })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '400')
    expect(screen.getAllByText(/exceeds available/i).length).toBeGreaterThan(0)
  })

  it('Cancel with no edits closes immediately without confirmation', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Discard this refund?')).not.toBeInTheDocument()
  })

  it('Cancel after editing shows discard confirmation', async () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('Discard this refund?')).toBeInTheDocument()
  })

  it('submit success calls onSubmit with correct lines and closes dialog', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onClose, onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '200')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith([
      expect.objectContaining({ paymentMethodId: 'pm-1', amount: '200' }),
    ])
  })

  it('submit error shows error alert and does not close dialog', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue({ message: 'Server error' })
    renderDialog({ onClose, onSubmit })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('pre-fills multiple refund lines when multiple methods have positive gross', async () => {
    renderDialog({
      seedAllocations: [
        { methodId: 'pm-1', amount: '300.0000' },
        { methodId: 'pm-2', amount: '200.0000' },
      ],
      availableForRefund: '500.0000',
      seedTarget: '500.0000',
    })
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
    })
  })

  it('two-method order produces two correctly-keyed lines', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({
      seedAllocations: [
        { methodId: 'pm-1', amount: '300.0000' },
        { methodId: 'pm-2', amount: '200.0000' },
      ],
      availableForRefund: '500.0000',
      seedTarget: '500.0000',
      onSubmit,
    })
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const lines = onSubmit.mock.calls[0][0]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveProperty('paymentMethodId', 'pm-1')
    expect(lines[1]).toHaveProperty('paymentMethodId', 'pm-2')
  })

  it('allows refunding more through one method than that method paid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    // Paid 100 Cash + 900 Bank. Refund 200 entirely through Cash.
    renderDialog({
      onSubmit,
      methods,
      seedAllocations: [
        { methodId: 'pm-1', amount: '100.0000' },
        { methodId: 'pm-2', amount: '900.0000' },
      ],
      availableForRefund: '1000.0000',
      seedTarget: '1000.0000',
    })

    const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
    await userEvent.clear(amounts[0])
    await userEvent.type(amounts[0], '200')
    await userEvent.clear(amounts[1])

    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      { paymentMethodId: 'pm-1', amount: '200', reference: undefined },
    ]))
  })

  it('offers every active method, including ones absent from the seed', async () => {
    // MUI renders Select options only once the popover is open, so click first.
    // (Popover hit-testing is unreliable in jsdom; the browser pass in Task 11
    //  re-checks the picker for real.)
    renderDialog({ seedAllocations: [{ methodId: 'pm-1', amount: '500.0000' }] })
    await userEvent.click(screen.getByLabelText('Refund method, line 1'))
    expect(await screen.findByRole('option', { name: 'Card' })).toBeInTheDocument()
  })

  describe('showDateField', () => {
    it('renders a date picker when showDateField is true', () => {
      renderDialog({ showDateField: true })
      expect(screen.getByRole('group', { name: 'Refund date, line 1' })).toBeInTheDocument()
    })

    it('does not render a date picker when showDateField is false/undefined', () => {
      renderDialog({ showDateField: false })
      expect(
        screen.queryByRole('group', { name: 'Refund date, line 1' }),
      ).not.toBeInTheDocument()
    })

    it('defaults to no date fields when showDateField is not provided', () => {
      renderDialog()
      expect(
        screen.queryByRole('group', { name: 'Refund date, line 1' }),
      ).not.toBeInTheDocument()
    })

    it('submits date value when showDateField is true', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      renderDialog({ showDateField: true, onSubmit })
      const amountInput = screen.getByPlaceholderText('Amount')
      await userEvent.clear(amountInput)
      await userEvent.type(amountInput, '100')
      await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalled())
      const submittedLines = onSubmit.mock.calls[0][0]
      expect(submittedLines[0]).toHaveProperty('date')
      expect(typeof submittedLines[0].date).toBe('string')
    })
  })

  describe('date field (#1008)', () => {
    // jsdom has no layout engine: this asserts the shared CSS configuration is
    // in use, NOT that the value renders unclipped. Browser-verified separately.
    it('renders the date through the shared MUI X picker field', () => {
      renderDialog({ showDateField: true })
      const field = screen.getByRole('group', { name: 'Refund date, line 1' })
      expect(field).toHaveStyle({ minWidth: '150px' })
      expect(field.closest('.MuiFormControl-root')).toHaveStyle({ flexShrink: '0' })
    })
  })
})

describe('money formatting and precision', () => {
  afterEach(() => {
    localStorage.removeItem('defaultCurrency')
  })

  it('seeds the available amount at the two-decimal floor', () => {
    renderDialog()
    // type="number" inputs: toHaveValue normalizes to Number; assert the raw
    // DOM value to check the two-decimal lexical normalization.
    const input = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(input.value).toBe('500.00')
  })

  it('passes the available amount through exactly', () => {
    // 0.3 - 0.1 drifts under Number(); the caller computes it with bigints and
    // the dialog must not re-derive it.
    renderDialog({ availableForRefund: '0.2000', seedTarget: '0.2000' })
    const input = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(input.value).toBe('0.20')
  })

  it('formats summaries with the configured currency, not a hard-coded MYR', () => {
    localStorage.setItem('defaultCurrency', 'USD')
    renderDialog()
    expect(screen.queryByText(/RM|MYR/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/USD/).length).toBeGreaterThan(0)
  })

  it('submits the exact decimal string, not a coerced number', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })

    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '499.0001')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ amount: '499.0001' }),
      ]),
    )
  })

  it('preserves four decimals above the floor on a small value', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })

    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '0.0101')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ amount: '0.0101' }),
      ]),
    )
  })

  it('disables submit for a malformed amount instead of counting it as zero', async () => {
    renderDialog()
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '1.00001')
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('still blocks an aggregate refund above available', async () => {
    renderDialog({ availableForRefund: '500.0000', seedTarget: '500.0000' })
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(amount)
    await userEvent.type(amount, '500.01')
    expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled()
  })

  // Half-up per line seeded 16.6667 x3 = 50.0001 against a 50.0000 surplus, so a
  // user clicking straight through pre-filled an over-refund by one minor unit.
  it('seeds an indivisible surplus so the lines sum to exactly the surplus', async () => {
    renderDialog({
      seedAllocations: [
        { methodId: 'pm-1', amount: '100.0000' },
        { methodId: 'pm-2', amount: '100.0000' },
        { methodId: 'pm-3', amount: '100.0000' },
      ],
      availableForRefund: '300.0000',
      seedTarget: '50.0000',
    })

    await waitFor(() => expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(3))
    const values = (screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]).map(
      (i) => i.value,
    )

    // Significant scale-4 digits stay visible rather than being rounded to cents.
    expect(values).toEqual(['16.6667', '16.6667', '16.6666'])

    const totalMinor = values.reduce((sum, v) => sum + (toScaledAmount(v) ?? 0n), 0n)
    expect(fromScaledAmount(totalMinor)).toBe('50.0000')
  })

  it('seeds gross weights scaled to seedTarget, ignoring prior refunds by method', () => {
    // Gross 100 Cash + 200 Bank; 150 already refunded by Card => available 150.
    renderDialog({
      seedAllocations: [
        { methodId: 'pm-1', amount: '100.0000' },
        { methodId: 'pm-2', amount: '200.0000' },
      ],
      availableForRefund: '150.0000',
      seedTarget: '150.0000',
    })
    const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
    expect(amounts[0].value).toBe('50.00')
    expect(amounts[1].value).toBe('100.00')
  })

  it('displays the surplus amount, not its complement (#1097 review)', () => {
    // Document totalling 300 paid 400: surplus is 100. Deriving the display as
    // (available - seedTarget) showed 300 — the complement — while the seed was
    // correct, so a row-presence-only assertion could not catch it.
    renderDialog({
      seedAllocations: [{ methodId: 'pm-1', amount: '400.0000' }],
      availableForRefund: '400.0000',
      seedTarget: '100.0000',
    })
    const surplusRow = screen.getByText('Surplus over total').closest('div')!
    expect(within(surplusRow).getByText(/100/)).toBeInTheDocument()
    expect(within(surplusRow).queryByText(/300/)).not.toBeInTheDocument()
  })

  it('does not seed a blank line when methods arrive before payments (#1097 review)', async () => {
    // Methods are cached across rows and resolve first; payments refetch per
    // document. Seeding is one-shot, so seeding during that window locked in a
    // blank line permanently.
    const { rerender } = render(
      <RefundDialog
        open
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        methods={methods}
        seedAllocations={[]}
        availableForRefund="0.0000"
        seedTarget="0.0000"
        orderNumber="SO-26-001"
        loading
      />,
    )

    // Payments land: fresh JSX, not a reused element ref (React 19 no-ops on the same ref).
    rerender(
      <RefundDialog
        open
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        methods={methods}
        seedAllocations={[{ methodId: 'pm-1', amount: '500.0000' }]}
        availableForRefund="500.0000"
        seedTarget="500.0000"
        orderNumber="SO-26-001"
        loading={false}
      />,
    )

    const amount = (await screen.findByPlaceholderText('Amount')) as HTMLInputElement
    expect(amount.value).toBe('500.00')
  })

  it('folds a retired historical method onto an active one (#1097 review)', async () => {
    // pm-retired paid historically but is no longer active, so it is absent from
    // the picker. Seeding its id would preselect an out-of-range value and submit
    // an id the backend rejects as inactive.
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({
      onSubmit,
      methods: [{ id: 'pm-1', label: 'Cash' }],
      seedAllocations: [
        { methodId: 'pm-retired', amount: '100.0000' },
        { methodId: 'pm-1', amount: '100.0000' },
      ],
      availableForRefund: '200.0000',
      seedTarget: '200.0000',
    })

    // Both weights land on the sole active method as one merged line.
    const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
    expect(amounts).toHaveLength(1)
    expect(amounts[0].value).toBe('200.00')

    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        { paymentMethodId: 'pm-1', amount: '200.00', reference: undefined },
      ]),
    )
  })

  it('seeds only the surplus on an overpaid document', () => {
    // Total 300, gross paid 100 Cash + 300 Bank => available 400, surplus 100.
    renderDialog({
      seedAllocations: [
        { methodId: 'pm-1', amount: '100.0000' },
        { methodId: 'pm-2', amount: '300.0000' },
      ],
      availableForRefund: '400.0000',
      seedTarget: '100.0000',
    })
    const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
    expect(amounts[0].value).toBe('25.00')
    expect(amounts[1].value).toBe('75.00')
  })

  it('clamps a seedTarget above availableForRefund', () => {
    renderDialog({
      seedAllocations: [{ methodId: 'pm-1', amount: '500.0000' }],
      availableForRefund: '200.0000',
      seedTarget: '900.0000',
    })
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amount.value).toBe('200.00')
  })

  it('still allows editing up to the full available on an overpaid document', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({
      onSubmit,
      seedAllocations: [{ methodId: 'pm-1', amount: '400.0000' }],
      availableForRefund: '400.0000',
      seedTarget: '100.0000',
    })
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(amount)
    await userEvent.type(amount, '400')
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  })
})

describe('RefundDialog server errors (#1006)', () => {
  it('surfaces an RTK Query error message instead of the generic fallback', async () => {
    // RTK Query rejects with { status, data: { message } } — NOT the Axios
    // { response: { data: { message } } } shape the dialog used to read.
    const onSubmit = vi.fn().mockRejectedValue({
      status: 400,
      data: { message: 'Refund exceeds the refundable amount for this payment.' },
    })
    renderDialog({ onSubmit })
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
    expect(
      await screen.findByText('Refund exceeds the refundable amount for this payment.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Failed to record refund.')).not.toBeInTheDocument()
  })
})

describe('RefundDialog shared shell (#1006)', () => {
  it('renders at maxWidth md, matching PaymentDialog', () => {
    const { container } = renderDialog()
    expect(container.ownerDocument.querySelector('.MuiDialog-paperWidthMd')).toBeTruthy()
  })

  it('labels the dialog by its rendered title', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    const titleEl = dialog.ownerDocument.getElementById(labelledBy as string)
    expect(titleEl).toHaveTextContent('Refund — SO-26-001')
  })

  it('names every control on the sole line with index 1', () => {
    renderDialog({ showDateField: true })
    expect(screen.getByLabelText('Refund method, line 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount, line 1')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Refund date, line 1' })).toBeInTheDocument()
    expect(screen.getByLabelText('Reference, line 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeInTheDocument()
  })

  it('gives a second line distinct indexed names', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /Add Refund Row/i }))
    expect(screen.getByLabelText('Amount, line 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove line 2' })).toBeInTheDocument()
  })

  it('keeps the placeholders existing assertions rely on', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('Amount')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Reference')).toBeInTheDocument()
  })

  it('keeps the destructive error styling on the submit button', () => {
    renderDialog()
    // MUI v9 emits MuiButton-colorError (the v5-style containedError class was
    // removed in v6); color="error" is what asserts the destructive styling.
    expect(screen.getByRole('button', { name: 'Refund' }).className).toMatch(/MuiButton-colorError/)
  })
})

describe('RefundDialog loading (#1006)', () => {
  it('shows a spinner instead of the content region', () => {
    renderDialog({ loading: true })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('Available for Refund')).not.toBeInTheDocument()
  })

  it('keeps Cancel reachable but disables submit while loading', () => {
    renderDialog({ loading: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled()
  })
})