import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OrdersPage } from '../OrdersPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetSalesOrdersQuery } = vi.hoisted(() => ({
  useGetSalesOrdersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Amuro Ray' }] },
  })),
  useLazyGetSalesOrderQuery: vi.fn(() => [vi.fn()]),
  useDeleteSalesOrderMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/components/common/MasterDetailWorkspace', () => ({
  default: ({ listSlot, headerSlot, workspaceSlot }: any) => (
    <div>
      <div>MasterDetailWorkspace</div>
      <div>{listSlot}</div>
      <div>{headerSlot}</div>
      <div>{workspaceSlot}</div>
    </div>
  ),
}))
vi.mock('../components/OrdersTable', () => ({ default: () => <div>OrdersTable</div> }))
vi.mock('../components/OrderContextHeader', () => ({ default: () => <div>OrderContextHeader</div> }))
vi.mock('../components/OrderWorkspaceCard', () => ({ default: () => <div>OrderWorkspaceCard</div> }))
vi.mock('../components/OrdersDialogs', () => ({ default: () => <div>OrdersDialogs</div> }))
vi.mock('../hooks/useOrdersActions', () => ({
  useOrdersActions: () => ({
    handleEditOrder: vi.fn(),
    handleOrderAction: vi.fn(),
    handleRefundOrder: vi.fn(),
    handleUnpayOrder: vi.fn(),
    openPaymentDialog: vi.fn(),
    handleFulfillOrder: vi.fn(),
    handleUnfulfillOrder: vi.fn(),
    handleUnfulfillAndEdit: vi.fn(),
    handleUnfulfillOnly: vi.fn(),
    handleUnpayAndEdit: vi.fn(),
    handleUnfulfillAndDelete: vi.fn(),
    handleUnpayAndDelete: vi.fn(),
    handleConfirmDelete: vi.fn(),
  }),
}))
vi.mock('../hooks/useOrdersSelection', () => ({
  useOrdersSelection: () => ({
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleEnterAction: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handleEscapeAction: vi.fn(),
    handleOrderSelect: vi.fn(),
    handleNavigateToInvoice: vi.fn(),
    handleNavigateToPayment: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: {
      sales: salesReducer,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <OrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrdersPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search orders/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with split sales detail cards', () => {
    renderPage()

    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('OrdersTable')).toBeInTheDocument()
    expect(screen.getByText('OrderContextHeader')).toBeInTheDocument()
    expect(screen.getByText('OrderWorkspaceCard')).toBeInTheDocument()
  })

  it('restores filters from URL into the sales orders query', () => {
    renderPage('/?search=gundam&customerId=cust-1&paymentStatus=paid')
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'gundam',
        customerId: 'cust-1',
        paymentStatus: 'paid',
      }),
    )
  })
})
