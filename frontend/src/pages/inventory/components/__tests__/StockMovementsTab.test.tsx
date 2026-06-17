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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useGetStockMovementsQuery: () => ({
      data: { data: movements, meta: { total: movements.length } },
      isLoading: false,
      isFetching: false,
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
})

describe('StockMovementsTab', () => {
  it('renders a movement row with the consolidated label and notes', () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })]
    renderTab()
    expect(screen.getByText('Purchase Receipt')).toBeInTheDocument()
    expect(screen.getByText('first batch')).toBeInTheDocument()
  })

  it('navigates to the sales order detail on a sales_order row click', async () => {
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
    fireEvent.click(screen.getByText('sold'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-100/view'),
    )
    expect(mockFetchSalesOrder).toHaveBeenCalledWith('so-uuid')
  })

  it('navigates to the purchase order detail on a purchase_order row click', async () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })]
    mockFetchPurchaseOrder.mockReturnValue({ unwrap: () => Promise.resolve({ orderNumber: 'PO-7' }) })
    renderTab()
    fireEvent.click(screen.getByText('first batch'))
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders/PO-7/view'),
    )
  })

  it('does not navigate for a non-order referenceType', () => {
    movements = [
      makeMovement({
        movementType: StockMovementType.ADJUSTMENT_INCREASE,
        referenceType: 'stock_movement_reversal',
        referenceId: 'adj-uuid',
        notes: 'manual fix',
      }),
    ]
    renderTab()
    fireEvent.click(screen.getByText('manual fix'))
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockFetchSalesOrder).not.toHaveBeenCalled()
    expect(mockFetchPurchaseOrder).not.toHaveBeenCalled()
  })

  it('stays on the tab when the order lookup fails (no-op)', async () => {
    movements = [makeMovement({ referenceType: 'purchase_order', referenceId: 'po-uuid' })]
    mockFetchPurchaseOrder.mockReturnValue({ unwrap: () => Promise.reject(new Error('not found')) })
    renderTab()
    fireEvent.click(screen.getByText('first batch'))
    await waitFor(() => expect(mockFetchPurchaseOrder).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renders the empty state when there are no movements', () => {
    movements = []
    renderTab()
    expect(
      screen.getByText('No stock movements recorded for this product'),
    ).toBeInTheDocument()
  })
})
