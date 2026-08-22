import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StockMovementType, type StockMovement } from '@/types'

const { mockNavigate, mockFetchSalesOrder, mockFetchPurchaseOrder } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockFetchSalesOrder: vi.fn(),
  mockFetchPurchaseOrder: vi.fn(),
}))

let movements: Partial<StockMovement>[] = []
let isLoading = false
let isError = false

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useGetStockMovementsQuery: () => ({
      data: isLoading || isError ? undefined : { data: movements, meta: { total: movements.length } },
      isLoading,
      isError,
      isFetching: isLoading,
    }),
  }
})

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return { ...actual, useLazyGetSalesOrderQuery: () => [mockFetchSalesOrder] }
})

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return { ...actual, useLazyGetPurchaseOrderQuery: () => [mockFetchPurchaseOrder] }
})

import StockMovementsTab from '../StockMovementsTab'

function makeMovement(overrides: Partial<StockMovement>): Partial<StockMovement> {
  return {
    id: 'm1',
    productId: 'p1',
    movementType: StockMovementType.PURCHASE_RECEIPT,
    movementDate: '2026-06-01',
    quantity: 10,
    previousBalance: 0,
    newBalance: 10,
    isInward: true,
    isOutward: false,
    description: 'Purchase',
    notes: 'first batch',
    ...overrides,
  }
}

function renderTab() {
  return render(
    <MemoryRouter>
      <StockMovementsTab productId="p1" />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
  movements = []
  isLoading = false
  isError = false
})

describe('StockMovementsTab', () => {
  it('renders a movement row with the consolidated label and notes', () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })]
    renderTab()
    expect(screen.getByText('Purchase Receipt')).toBeInTheDocument()
    expect(screen.getByText('first batch')).toBeInTheDocument()
  })

  it('navigates to the sales order detail when View is clicked', async () => {
    movements = [
      makeMovement({
        movementType: StockMovementType.SALE,
        isInward: false,
        isOutward: true,
        referenceType: 'sales_order',
        referenceId: 'so-uuid',
        notes: 'sold',
      }),
    ]
    mockFetchSalesOrder.mockReturnValue({ unwrap: () => Promise.resolve({ orderNumber: 'SO-100' }) })
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-100/view'),
    )
    expect(mockFetchSalesOrder).toHaveBeenCalledWith('so-uuid')
  })

  it('navigates to the purchase order detail when View is clicked', async () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })]
    mockFetchPurchaseOrder.mockReturnValue({ unwrap: () => Promise.resolve({ orderNumber: 'PO-7' }) })
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders/PO-7/view'),
    )
  })

  it('disables View for a non-order referenceType and fires no lookup', () => {
    movements = [
      makeMovement({
        movementType: StockMovementType.ADJUSTMENT_INCREASE,
        referenceType: 'stock_movement_reversal',
        referenceId: 'adj-uuid',
        notes: 'manual fix',
      }),
    ]
    renderTab()
    const viewBtn = screen.getByRole('button', { name: /view/i })
    expect(viewBtn).toBeDisabled()
    fireEvent.click(viewBtn)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockFetchSalesOrder).not.toHaveBeenCalled()
    expect(mockFetchPurchaseOrder).not.toHaveBeenCalled()
  })

  it('disables View when referenceId is missing even for an order referenceType', () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: undefined })]
    renderTab()
    expect(screen.getByRole('button', { name: /view/i })).toBeDisabled()
  })

  it('stays on the tab when the order lookup fails (no-op)', async () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })]
    mockFetchPurchaseOrder.mockReturnValue({ unwrap: () => Promise.reject(new Error('not found')) })
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() => expect(mockFetchPurchaseOrder).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows the reference document number when present, in bold', () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid', referenceNumber: 'PO-7' })]
    renderTab()
    expect(screen.getByText('PO-7')).toBeInTheDocument()
  })

  it('falls back to the reference type label when no referenceNumber', () => {
    movements = [makeMovement({ referenceType: 'sales_order', referenceId: 'so-uuid', referenceNumber: undefined })]
    renderTab()
    expect(screen.getByText('Sales Order')).toBeInTheDocument()
  })

  it('renders the loading state while the query is in flight', () => {
    isLoading = true
    renderTab()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(
      screen.queryByText('No stock movements recorded for this product'),
    ).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no movements', () => {
    movements = []
    renderTab()
    expect(
      screen.getByText('No stock movements recorded for this product'),
    ).toBeInTheDocument()
  })

  it('renders the error state when the query fails', () => {
    isError = true
    renderTab()
    expect(screen.getByText('Failed to load stock movements.')).toBeInTheDocument()
    expect(
      screen.queryByText('No stock movements recorded for this product'),
    ).not.toBeInTheDocument()
  })
})
