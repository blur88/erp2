import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentDialog from '../PaymentDialog'

const methods = [
  { id: 'pm-cash', code: 'CASH', name: 'Cash' },
  { id: 'pm-bank', code: 'BANK', name: 'Bank Transfer' },
]

function renderDialog(props: Partial<ComponentProps<typeof PaymentDialog>> = {}) {
  const defaults: ComponentProps<typeof PaymentDialog> = {
    open: true,
    documentNumber: 'EXP-001',
    totalAmount: '500.0000',
    paidAmount: '200.0000',
    paymentMethods: methods,
    loading: false,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
  }
  return { ...render(<PaymentDialog {...defaults} {...props} />), props: { ...defaults, ...props } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PaymentDialog summary', () => {
  it('shows Total, Previously Paid and Outstanding Balance', () => {
    renderDialog()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('Previously Paid')).toBeInTheDocument()
    expect(screen.getByText('Outstanding Balance')).toBeInTheDocument()
    expect(screen.getAllByText(/RM 500\.00/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/RM 200\.00/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/RM 300\.00/).length).toBeGreaterThanOrEqual(1)
  })

  it('clamps outstanding at zero when paid exceeds total', () => {
    renderDialog({ totalAmount: '100.0000', paidAmount: '150.0000' })
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })
})

describe('PaymentDialog line seeding', () => {
  it('prefills the first line with the full outstanding balance', () => {
    renderDialog()
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    expect(Number(amount.value)).toBe(300)
  })

  it('does not seed a line while loading', () => {
    renderDialog({ loading: true })
    expect(screen.queryByPlaceholderText('Amount')).not.toBeInTheDocument()
  })

  it('seeds once loading flips to false', async () => {
    const { rerender } = renderDialog({ loading: true })
    expect(screen.queryByPlaceholderText('Amount')).not.toBeInTheDocument()
    // React 19: pass fresh JSX, never a captured element reference.
    rerender(
      <PaymentDialog
        open
        documentNumber="EXP-001"
        totalAmount="500.0000"
        paidAmount="200.0000"
        paymentMethods={methods}
        loading={false}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    await waitFor(() => expect(screen.getByPlaceholderText('Amount')).toBeInTheDocument())
  })

  it('prefills an added line with the remaining amount', async () => {
    renderDialog()
    const first = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(first)
    await userEvent.type(first, '100')
    await userEvent.click(screen.getByRole('button', { name: /add payment line/i }))
    const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
    expect(Number(amounts[1].value)).toBe(200)
  })

  it('prefills an added line as empty when nothing remains', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /add payment line/i }))
    const amounts = screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
    expect(amounts[1].value).toBe('')
  })
})

describe('PaymentDialog no payment methods', () => {
  it('errors, seeds nothing and disables Add and Submit', () => {
    renderDialog({ paymentMethods: [] })
    expect(screen.getByText('No active payment methods are available.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Amount')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add payment line/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDisabled()
  })
})

describe('PaymentDialog overpayment', () => {
  it('warns but keeps submit enabled', async () => {
    renderDialog()
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(amount)
    await userEvent.type(amount, '500')
    await waitFor(() => {
      expect(screen.getByText(/exceeds outstanding balance by/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /record payment/i })).toBeEnabled()
  })

  it('labels the remaining figure as an overpayment', async () => {
    renderDialog()
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(amount)
    await userEvent.type(amount, '450')
    await waitFor(() => expect(screen.getByText(/\(overpayment\)/)).toBeInTheDocument())
  })
})

describe('PaymentDialog reference field (issue #999)', () => {
  it('renders the dialog at maxWidth md', () => {
    const { container } = renderDialog()
    expect(container.ownerDocument.querySelector('.MuiDialog-paperWidthMd')).toBeTruthy()
  })

  it('retains a full reference value', async () => {
    renderDialog()
    const ref = screen.getByPlaceholderText('Reference') as HTMLInputElement
    await userEvent.type(ref, 'QA942-CANCEL')
    expect(ref.value).toBe('QA942-CANCEL')
  })

  it('submits the full reference in the payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })
    await userEvent.type(screen.getByPlaceholderText('Reference'), 'QA942-CANCEL')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ reference: 'QA942-CANCEL', amount: '300.00' }),
      ])
    })
  })

  it('keeps every control usable on a second payment line', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /add payment line/i }))
    expect(screen.getAllByPlaceholderText('Amount')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('Reference')).toHaveLength(2)
    const second = screen.getAllByPlaceholderText('Reference')[1] as HTMLInputElement
    await userEvent.type(second, 'QA942-CANCEL')
    expect(second.value).toBe('QA942-CANCEL')
  })
})

describe('PaymentDialog submission', () => {
  it('sends exact scale-4 strings and the line date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderDialog({ onSubmit })
    const amount = screen.getByPlaceholderText('Amount') as HTMLInputElement
    await userEvent.clear(amount)
    await userEvent.type(amount, '123.4567')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ amount: '123.4567', paymentMethodId: 'pm-cash' }),
      ])
      expect(onSubmit.mock.calls[0][0][0].paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('shows the error message when onSubmit rejects and stays open', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue({ data: { message: 'Server said no' } })
    renderDialog({ onSubmit, onClose })
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(screen.getByText('Server said no')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on success', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

describe('PaymentDialog discard confirmation', () => {
  it('asks before discarding edited data', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.type(screen.getByPlaceholderText('Reference'), 'X')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('Discard this payment?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without asking when untouched', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when the user confirms the discard', async () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    await userEvent.type(screen.getByPlaceholderText('Reference'), 'X')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await userEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('PaymentDialog delete action', () => {
  it('disables delete on a lone line and enables it with two', async () => {
    const { container } = renderDialog()
    const deleteButtons = () => within(container.ownerDocument.body).getAllByTestId('DeleteIcon')
    expect(deleteButtons()[0].closest('button')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /add payment line/i }))
    expect(deleteButtons()[0].closest('button')).toBeEnabled()
  })
})

describe('PaymentDialog accessible names (#1006)', () => {
  it('names every control on the sole line with index 1', () => {
    renderDialog()
    expect(screen.getByLabelText('Payment method, line 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount, line 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Payment date, line 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference, line 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeInTheDocument()
  })

  it('gives a second line distinct indexed names', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /Add Payment Line/i }))
    expect(screen.getByLabelText('Amount, line 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference, line 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove line 2' })).toBeInTheDocument()
    // Distinct from line 1, which is the point of indexing.
    expect(screen.getByLabelText('Amount, line 1')).not.toBe(
      screen.getByLabelText('Amount, line 2'),
    )
  })

  it('keeps the placeholders that 43 existing assertions rely on', () => {
    renderDialog()
    expect(screen.getByPlaceholderText('Amount')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Reference')).toBeInTheDocument()
  })
})
