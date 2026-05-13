import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import PurchaseOrderContextHeader from '../PurchaseOrderContextHeader'

const baseOrder = {
  id: 'po-1',
  orderNumber: 'PO-1001',
  orderDate: new Date('2026-04-10T00:00:00.000Z'),
  supplier: { id: 'sup-1', companyName: 'Acme Supplies' },
  items: [{ id: 'item-1', quantity: 1, unitPrice: 100, total: 100 }],
  totalAmount: 100,
  paidAmount: 0,
  subtotal: 100,
  shippingAmount: 0,
  goodsReceivedNotes: [],
  vendorPayments: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as any

const defaultProps = {
  selectedOrder: baseOrder,
  isLoading: false,
  journalEntryRefs: [],
  journalEntryRefLoading: false,
  onEditClick: vi.fn(),
  onDeleteClick: vi.fn(),
  onPrint: vi.fn(),
  onNavigateToGoodsReceived: vi.fn(),
  onNavigateToVendorPayment: vi.fn(),
  onNavigateToJournalEntry: vi.fn(),
  onUnpay: vi.fn(),
  onOpenPaymentDialog: vi.fn(),
  onReturn: vi.fn(),
  onReceive: vi.fn(),
  isLocked: false,
  lockTooltip: 'unlocked — editable',
}

describe('PurchaseOrderContextHeader', () => {
  it('shows empty state when no order selected', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} selectedOrder={null} /></MemoryRouter>)
    expect(screen.getByText('Select a purchase order to view details')).toBeInTheDocument()
  })

  it('renders order number in header', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText(/Purchase Order Details - PO-1001/i)).toBeInTheDocument()
  })

  it('renders header action buttons', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} /></MemoryRouter>)
    expect(screen.getByTitle('Edit Order')).toBeInTheDocument()
    expect(screen.getByTitle('Delete Order')).toBeInTheDocument()
    expect(screen.getByTitle('Print Purchase Order')).toBeInTheDocument()
  })

  it('shows Pay button when order has no payment', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText('Pay')).toBeInTheDocument()
  })

  it('shows Unpay button when order has a payment', () => {
    const orderWithPayment = {
      ...baseOrder,
      vendorPayments: [{ id: 'vp-1', paymentNumber: 'VP-001', amount: 100 }],
    }
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} selectedOrder={orderWithPayment} /></MemoryRouter>)
    expect(screen.getByText('Unpay')).toBeInTheDocument()
  })

  it('shows Receive button when order is not yet received', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} /></MemoryRouter>)
    expect(screen.getByText('Receive')).toBeInTheDocument()
  })

  it('shows Return button when order is received', () => {
    const receivedOrder = {
      ...baseOrder,
      goodsReceivedNotes: [{ id: 'grn-1', grnNumber: 'GRN-001', status: 'received' }],
    }
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} selectedOrder={receivedOrder} /></MemoryRouter>)
    expect(screen.getByText('Return')).toBeInTheDocument()
  })

  it('renders lock icon when isLocked is true', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} isLocked={true} lockTooltip="unpay before editing" /></MemoryRouter>)
    expect(screen.getByTestId('LockIcon')).toBeInTheDocument()
    expect(screen.queryByTestId('LockOpenIcon')).not.toBeInTheDocument()
  })

  it('renders unlock icon when isLocked is false', () => {
    render(<MemoryRouter><PurchaseOrderContextHeader {...defaultProps} isLocked={false} lockTooltip="unlocked — editable" /></MemoryRouter>)
    expect(screen.getByTestId('LockOpenIcon')).toBeInTheDocument()
    expect(screen.queryByTestId('LockIcon')).not.toBeInTheDocument()
  })
})
