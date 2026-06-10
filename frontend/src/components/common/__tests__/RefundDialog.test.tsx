import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RefundDialog, { type RefundSource } from '../RefundDialog'

const sources: RefundSource[] = [
  { id: 'pm-1', label: 'Cash', paidAmount: 500, alreadyRefunded: 0 },
  { id: 'pm-2', label: 'Bank Transfer', paidAmount: 0, alreadyRefunded: 0 },
]

function renderDialog(props: Partial<ComponentProps<typeof RefundDialog>> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    sources,
    orderNumber: 'SO-26-001',
    totalAmount: 500,
  }
  return render(<RefundDialog {...defaults} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RefundDialog', () => {
  it('displays Available for Refund in summary', () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: 500, alreadyRefunded: 100 }],
    })
    expect(screen.getByText('Available for Refund')).toBeInTheDocument()
  })

  it('Available for Refund shows net paid minus prior refunds', () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: 500, alreadyRefunded: 100 }],
    })
    // Available = 500 - 100 = 400
    expect(screen.getAllByText(/400/).length).toBeGreaterThan(0)
  })

  it('pre-fills first refund line with Available for Refund amount', () => {
    renderDialog()
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('500')
  })

  it('defaults refund amount to the surplus on an overpaid order', () => {
    renderDialog({ totalAmount: 300 })
    const amountInput = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(amountInput.value).toBe('200')
  })

  it('shows a Surplus over total row when the order is overpaid', () => {
    renderDialog({ totalAmount: 300 })
    expect(screen.getByText('Surplus over total')).toBeInTheDocument()
  })

  it('hides the Surplus over total row when the order is exactly paid', () => {
    renderDialog({ totalAmount: 500 })
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
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: 500, alreadyRefunded: 500 }],
    })
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('Refund button is disabled when total exceeds available', async () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: 300, alreadyRefunded: 0 }],
    })
    const amountInput = screen.getByPlaceholderText('Amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '400')
    expect(screen.getByRole('button', { name: /^refund$/i })).toBeDisabled()
  })

  it('shows error alert when total exceeds available', async () => {
    renderDialog({
      sources: [{ id: 'pm-1', label: 'Cash', paidAmount: 300, alreadyRefunded: 0 }],
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
      expect.objectContaining({ sourceId: 'pm-1', amount: 200 }),
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
        { id: 'pm-1', label: 'Cash', paidAmount: 300, alreadyRefunded: 0 },
        { id: 'pm-2', label: 'Bank Transfer', paidAmount: 200, alreadyRefunded: 0 },
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
        { id: 'src-a', label: 'Cash', paidAmount: 300, alreadyRefunded: 0 },
        { id: 'src-b', label: 'Bank Transfer', paidAmount: 200, alreadyRefunded: 0 },
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
})
