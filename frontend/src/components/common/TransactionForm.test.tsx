import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TransactionForm from './TransactionForm'

const baseProps = {
  entityLabel: 'Customer' as const,
  entityOptions: [
    { id: 'c1', name: 'Customer A' },
    { id: 'c2', name: 'Customer B' },
  ],
  lineItemColumns: [
    { key: 'product', label: 'Product' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unitPrice', label: 'Unit Price' },
  ],
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
  isSubmitting: false,
}

describe('TransactionForm', () => {
  beforeEach(() => {
    baseProps.onSubmit.mockClear()
    baseProps.onCancel.mockClear()
  })

  it('renders entity selector with entityLabel', () => {
    render(<TransactionForm {...baseProps} />)

    expect(screen.getByLabelText('Customer')).toBeInTheDocument()
  })

  it('does not render entity selector when entityLabel is undefined', () => {
    render(<TransactionForm {...baseProps} entityLabel={undefined} />)

    expect(screen.queryByLabelText('Customer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Supplier')).not.toBeInTheDocument()
  })

  it('renders Add Line Item button', () => {
    render(<TransactionForm {...baseProps} />)

    expect(screen.getByText('Add Line Item')).toBeInTheDocument()
  })

  it('adds a line item row when Add Line Item is clicked', () => {
    render(<TransactionForm {...baseProps} />)

    fireEvent.click(screen.getByText('Add Line Item'))

    expect(screen.getAllByLabelText('Qty')).toHaveLength(1)
  })

  it('removes a line item row when remove is clicked', () => {
    render(<TransactionForm {...baseProps} />)

    fireEvent.click(screen.getByText('Add Line Item'))
    fireEvent.click(screen.getByLabelText('Remove line item'))

    expect(screen.queryAllByLabelText('Qty')).toHaveLength(0)
  })

  it('calls onCancel when Cancel is clicked', () => {
    render(<TransactionForm {...baseProps} />)

    fireEvent.click(screen.getByText('Cancel'))

    expect(baseProps.onCancel).toHaveBeenCalled()
  })

  it('calls onSubmit with form data when submitted', async () => {
    render(<TransactionForm {...baseProps} />)

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(baseProps.onSubmit).toHaveBeenCalled())
  })

  it('disables Save button when isSubmitting is true', () => {
    render(<TransactionForm {...baseProps} isSubmitting />)

    expect(screen.getByText('Save')).toBeDisabled()
  })
})
