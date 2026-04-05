import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PurchaseOrdersPage } from '../PurchaseOrdersPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const { useGetPurchaseOrdersQuery } = vi.hoisted(() => ({
  useGetPurchaseOrdersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetPurchaseOrdersQuery,
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [{ id: 'sup-1', companyName: 'Anaheim Electronics' }] },
  })),
  useLazyGetPurchaseOrderQuery: vi.fn(() => [vi.fn()]),
  useReceiveGoodsMutation: vi.fn(() => [vi.fn()]),
  useReturnGoodsMutation: vi.fn(() => [vi.fn()]),
  useMarkPurchaseOrderAsUnpaidMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderPaymentsMutation: vi.fn(() => [vi.fn()]),
  useDeletePurchaseOrderMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/components/filters', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return (
      <div>
        <input placeholder="Search purchase orders..." />
      </div>
    )
  },
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
vi.mock('../components/PurchaseOrderContextHeader', () => ({ default: () => <div>PurchaseOrderContextHeader</div> }))
vi.mock('../components/PurchaseOrdersTable', () => ({ default: () => <div>PurchaseOrdersTable</div> }))
vi.mock('../components/PurchaseOrderWorkspaceCard', () => ({ default: () => <div>PurchaseOrderWorkspaceCard</div> }))
vi.mock('../components/PurchaseOrdersDialogs', () => ({ default: () => <div>PurchaseOrdersDialogs</div> }))
vi.mock('../hooks/usePurchaseOrdersActions', () => ({
  usePurchaseOrdersActions: () => ({
    handleEditClick: vi.fn(),
    handleDeleteClick: vi.fn(),
    handleUnpay: vi.fn(),
    handleOpenPaymentDialog: vi.fn(),
    handleReturn: vi.fn(),
    handleReceive: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    handleReturnAndEdit: vi.fn(),
    handleReturnOnly: vi.fn(),
    handleUnpayAndEdit: vi.fn(),
    handleReturnAndDelete: vi.fn(),
    handleUnpayAndDelete: vi.fn(),
    handleRecordPayments: vi.fn(),
  }),
}))
vi.mock('../hooks/usePurchaseOrdersSelection', () => ({
  usePurchaseOrdersSelection: () => ({
    handleOrderSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    focusSearchInput: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: {
      purchasing: purchasingReducer,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PurchaseOrdersPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search purchase orders/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with split purchasing detail cards', () => {
    renderPage()

    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('PurchaseOrdersTable')).toBeInTheDocument()
    expect(screen.getByText('PurchaseOrderWorkspaceCard')).toBeInTheDocument()
  })

  it('restores new URL params into the purchase orders query', () => {
    renderPage('/?search=gundam&supplierId=sup-1')
    expect(useGetPurchaseOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'gundam',
        supplierId: 'sup-1',
      }),
    )
  })

  it('configures the supplier filter with the named supplier type', () => {
    renderPage()

    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: {
        fields: Array<{ field: string; type: string }>
      }
    }

    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'supplierId',
          type: 'supplier',
        }),
      ]),
    )
  })

  it('ignores legacy date params', () => {
    renderPage('/?orderDateFrom=2024-01-01')
    expect(useGetPurchaseOrdersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        orderDateFrom: expect.anything(),
      }),
    )
  })
})
