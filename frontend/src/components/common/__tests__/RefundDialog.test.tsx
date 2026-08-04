import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RefundDialog, { type RefundSource } from '../RefundDialog'

const sources: RefundSource[] = [
  { id: 'pm-1', label: 'Cash', paidAmount: '500.0000', alreadyRefunded: '0.0000' },
  { id: 'pm-2', label: 'Bank Transfer', paidAmount: '0.0000', alreadyRefunded: '0.0000' },
]

function renderDialog(props: Partial<ComponentProps<typeof RefundDialog>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    sources,
    orderNumber: 'SO-26-001',
    totalAmount: '500.0000',
  }
  return render(<RefundDialog {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RefundDialog', () => {
  it('displays Available for Refund in summary', () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: '500.0000', alreadyRefunded: '100.0000' }],
    })
    expect(screen.getByText('Available for Refund')).toBeInTheDocument()
  })

  it('Available for Refund shows net paid minus prior refunds', () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: '500.0000', alreadyRefunded: '100.0000' }],
    })
    // Available = 500 - 100 = 400
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })

  it('pre-fills first refund line with Available for Refund amount', () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('500.00')
  })

  it('defaults refund amount to the surplus on an overpaid order', () => {
    renderDialog({ totalAmount: '300.0000' })
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('200.00')
  })

  it('shows a Surplus over total row when the order is overpaid', () => {
    renderDialog({ totalAmount: '300.0000' })
    expect(screen.getByText('Surplus over total')).toBeInTheDocument()
  })

  it('hides the Surplus over total row when the order is exactly paid', () => {
    renderDialog({ totalAmount: '500.0000' })
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
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: '500.0000', alreadyRefunded: '500.0000' }],
    })
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('Refund button is disabled when total exceeds available', async () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: '300.0000', alreadyRefunded: '0.0000' }],
    })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '400')
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('shows error alert when total exceeds available', async () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: '300.0000', alreadyRefunded: '0.0000' }],
    })
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
      expect.objectContaining({ sourceId: 'pm-1', amount: '200' }),
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

  it('pre-fills multiple refund lines when multiple sources have positive net', async () => {
    renderDialog({
      sources: [
        { id: 'pm-1', label: 'Cash', paidAmount: '300.0000', alreadyRefunded: '0.0000' },
        { id: 'pm-2', label: 'Bank Transfer', paidAmount: '200.0000', alreadyRefunded: '0.0000' },
      ],
    })
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
    })
  })

  it('two-source order produces two correctly-keyed lines', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({
      sources: [
        { id: 'src-a', label: 'Cash', paidAmount: '300.0000', alreadyRefunded: '0.0000' },
        { id: 'src-b', label: 'Bank Transfer', paidAmount: '200.0000', alreadyRefunded: '0.0000' },
      ],
      onSubmit,
    })
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const lines = onSubmit.mock.calls[0][0]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveProperty('sourceId', 'src-a')
    expect(lines[1]).toHaveProperty('sourceId', 'src-b')
  })

  it('does not offer a zero-available source in the picker', async () => {
    // pm-2 has paidAmount 0 -> nothing left to refund -> must not be selectable.
    renderDialog({
      sources: [
        { id: 'pm-1', label: 'Cash', paidAmount: '500.0000', alreadyRefunded: '0.0000' },
        { id: 'pm-2', label: 'Bank Transfer', paidAmount: '0.0000', alreadyRefunded: '0.0000' },
      ],
    })
    // Open the source Select (first combobox).
    await userEvent.click(screen.getAllByRole('combobox')[0])
    const options = await screen.findAllByRole('option')
    const labels = options.map((o) => o.textContent)
    expect(labels).toContain('Cash')
    expect(labels).not.toContain('Bank Transfer')
  })

  it('rejects a line that exceeds its own source available even if total fits', async () => {
    // Two sources, 300 + 200 = 500 total available. A single 400 refund against
    // the 300 source fits the aggregate (400 <= 500) but over-refunds that source.
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({
      sources: [
        { id: 'src-a', label: 'Cash', paidAmount: '300.0000', alreadyRefunded: '0.0000' },
        { id: 'src-b', label: 'Bank Transfer', paidAmount: '200.0000', alreadyRefunded: '0.0000' },
      ],
    totalAmount: '500.0000',
      onSubmit,
    })
    // Two lines pre-fill (300 + 200). Zero out the second (src-b) so it is
    // filtered as an invalid line and the aggregate becomes just src-a's 400
    // (<= 500 total), but 400 > src-a's own 300 available.
    const amounts = screen.getAllByPlaceholderText('Amount')
    await userEvent.clear(amounts[0])
    await userEvent.type(amounts[0], '400')
    await userEvent.clear(amounts[1])
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toMatch(/exceeds its available amount/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  describe('showDateField', () => {
    it('renders date inputs when showDateField is true', () => {
      renderDialog({ showDateField: true })
      const dateInputs = document.querySelectorAll('input[type="date"]')
      expect(dateInputs.length).toBeGreaterThan(0)
    })

    it('does not render date inputs when showDateField is false/undefined', () => {
      renderDialog({ showDateField: false })
      const dateInputs = document.querySelectorAll('input[type="date"]')
      expect(dateInputs.length).toBe(0)
    })

    it('defaults to no date fields when showDateField is not provided', () => {
      renderDialog()
      const dateInputs = document.querySelectorAll('input[type="date"]')
      expect(dateInputs.length).toBe(0)
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

  it('computes available for refund exactly', () => {
    // 0.3 - 0.1 drifts under Number(); must be exactly 0.2000.
    renderDialog({
      totalAmount: '0.3000',
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: '0.3000', alreadyRefunded: '0.1000' }],
    })
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

  it('blocks an aggregate refund one minor unit above the available amount', async () => {
    renderDialog()
    const input = screen.getByPlaceholderText('Amount')
    await userEvent.clear(input)
    await userEvent.type(input, '500.0001')
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  // The aggregate check can pass while one source is over-refunded, offset by
  // surplus on another. The backend rejects that, so the dialog must too.
  it('rejects a per-source over-refund even when the aggregate passes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({
      onSubmit,
      totalAmount: '100.0000',
      sources: [
        { id: 'pm-1', label: 'Cash', paidAmount: '50.0000', alreadyRefunded: '0.0000' },
        { id: 'pm-2', label: 'Bank Transfer', paidAmount: '50.0000', alreadyRefunded: '0.0000' },
      ],
    })

    // Two sources auto-seed two correctly-keyed rows (see the existing
    // 'two-source order produces two correctly-keyed lines' test).
    await waitFor(() => expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2))

    // Aggregate 100.0000 == available 100.0000, but Cash alone exceeds its 50.0000.
    const inputs = screen.getAllByPlaceholderText('Amount')
    await userEvent.clear(inputs[0])
    await userEvent.type(inputs[0], '60.0000')
    await userEvent.clear(inputs[1])
    await userEvent.type(inputs[1], '40.0000')
    await userEvent.click(screen.getByRole('button', { name: /^refund$/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/exceeds its available amount/i)).toBeInTheDocument()
  })
})
