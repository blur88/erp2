import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProductOrderHistoryItem } from '@/store/api/inventoryApi'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

let queryState: {
  data?: { data: Partial<ProductOrderHistoryItem>[]; meta: { total: number } }
  isLoading: boolean
  isError: boolean
} = { data: { data: [], meta: { total: 0 } }, isLoading: false, isError: false }

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return { ...actual, useGetProductOrderHistoryQuery: () => queryState }
})

import OrderHistoryTab from '../OrderHistoryTab'

function makeOrder(overrides: Partial<ProductOrderHistoryItem>): Partial<ProductOrderHistoryItem> {
  return {
    id: 'h1',
    type: 'sales_order',
    orderNumber: 'SO-5',
    customerOrVendor: 'Acme',
    date: '2026-01-01',
    paymentStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    quantity: 3,
    subTotal: 300,
    ...overrides,
  }
}

function setRows(rows: Partial<ProductOrderHistoryItem>[]) {
  queryState = { data: { data: rows, meta: { total: rows.length } }, isLoading: false, isError: false }
}

function renderTab() {
  return render(
    <MemoryRouter>
      <OrderHistoryTab productId="p1" />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
  queryState = { data: { data: [], meta: { total: 0 } }, isLoading: false, isError: false }
})

describe('OrderHistoryTab', () => {
  it('navigates to the sales order when View is clicked', async () => {
    setRows([makeOrder({})])
    renderTab()
    expect(screen.getByText('SO-5')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-5/view')
  })

  it('renders payment + fulfillment chips for a sales order row', () => {
    setRows([makeOrder({ id: 'h2', orderNumber: 'SO-6', fulfillmentStatus: 'unfulfilled' })])
    renderTab()
    expect(screen.getByText('SO-6')).toBeInTheDocument()
    expect(screen.getByText(/Paid/i)).toBeInTheDocument()
    expect(screen.getByText(/Unfulfilled/i)).toBeInTheDocument()
  })

  it('navigates to the purchase order when View is clicked', async () => {
    setRows([
      makeOrder({
        id: 'h3',
        type: 'purchase_order',
        orderNumber: 'PO-8',
        customerOrVendor: 'Vendor Co',
        paymentStatus: 'unpaid',
        fulfillmentStatus: undefined,
        receivedStatus: 'not_received',
      }),
    ])
    renderTab()
    expect(screen.getByText('PO-8')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders/PO-8/view')
  })

  it('renders payment + received chips for a purchase order row', () => {
    setRows([
      makeOrder({
        id: 'h4',
        type: 'purchase_order',
        orderNumber: 'PO-9',
        customerOrVendor: 'Vendor Co',
        paymentStatus: 'unpaid',
        fulfillmentStatus: undefined,
        receivedStatus: 'not_received',
      }),
    ])
    renderTab()
    expect(screen.getByText('PO-9')).toBeInTheDocument()
    expect(screen.getByText(/Unpaid/i)).toBeInTheDocument()
    expect(screen.getByText(/Not Received/i)).toBeInTheDocument()
  })

  it('renders the loading state while the query is in flight', () => {
    queryState = { data: undefined, isLoading: true, isError: false }
    renderTab()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('No order history found for this product')).not.toBeInTheDocument()
  })

  it('renders the empty state when there is no order history', () => {
    setRows([])
    renderTab()
    expect(screen.getByText('No order history found for this product')).toBeInTheDocument()
  })

  it('renders the error state when the query fails', () => {
    queryState = { data: undefined, isLoading: false, isError: true }
    renderTab()
    expect(screen.getByText('Failed to load order history.')).toBeInTheDocument()
    expect(screen.queryByText('No order history found for this product')).not.toBeInTheDocument()
  })
})
