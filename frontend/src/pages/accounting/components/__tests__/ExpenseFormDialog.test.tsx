import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpenseFormDialog } from '../ExpenseFormDialog'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/store/api/accountingApi', () => ({
  useGetPaymentMethodsQuery: () => ({
    data: { data: [{ id: 'pm-1', name: 'Cash', code: 'CASH', isActive: true }] },
  }),
  useGetChartOfAccountsQuery: () => ({
    data: { data: [{ id: 'coa-1', code: '6000', name: 'Office Supplies', type: 'EXPENSE', isActive: true }] },
  }),
  useCreateExpenseMutation: () => [mockCreate],
  useUpdateExpenseMutation: () => [mockUpdate],
}))

const baseExpense = {
  id: 'ex-1',
  referenceNumber: 'EXP-001',
  expenseDate: '2026-02-15',
  expenseAccountId: 'coa-1',
  expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
  amount: 100,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  vendor: 'ACME Corp',
  description: 'Printer paper',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const renderDialog = (editTarget = null as typeof baseExpense | null, open = true) =>
  render(
    <BrowserRouter>
      <ExpenseFormDialog open={open} editTarget={editTarget} onClose={vi.fn()} onSaved={vi.fn()} />
    </BrowserRouter>,
  )

describe('ExpenseFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "New Expense" title when no editTarget', () => {
    renderDialog()
    expect(screen.getByText('New Expense')).toBeInTheDocument()
  })

  it('shows "Edit Expense" title when editTarget provided', () => {
    renderDialog(baseExpense)
    expect(screen.getByText('Edit Expense')).toBeInTheDocument()
  })

  it('pre-fills form fields from editTarget', () => {
    renderDialog(baseExpense)
    expect(screen.getByDisplayValue('2026-02-15')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ACME Corp')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Printer paper')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderDialog(null, false)
    expect(screen.queryByText('New Expense')).not.toBeInTheDocument()
  })

  it('calls create mutation on save with valid new form data', async () => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    renderDialog()

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/Vendor/i), { target: { value: 'Test Vendor' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
  })

  it('calls update mutation on save in edit mode', async () => {
    mockUpdate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    renderDialog(baseExpense)

    fireEvent.change(screen.getByLabelText(/Vendor/i), { target: { value: 'New Vendor' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({
      id: 'ex-1',
      data: expect.objectContaining({ vendor: 'New Vendor' }),
    }))
  })

  it('does not submit when amount is missing', async () => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    renderDialog()
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mockCreate).not.toHaveBeenCalled())
  })
})
