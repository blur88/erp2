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
vi.mock('../hooks/usePurchaseOrdersWorkspace', () => ({
  usePurchaseOrdersWorkspace: () => ({
    sorting: { sortBy: 'orderNumber', sortOrder: 'asc' },
    handleSort: vi.fn(),
    focusedOrderIndex: -1,
    deleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    orderToDelete: null,
    setOrderToDelete: vi.fn(),
    deletedOrdersDialogOpen: false,
    setDeletedOrdersDialogOpen: vi.fn(),
    blockedDialogOpen: false,
    setBlockedDialogOpen: vi.fn(),
    printDialogOpen: false,
    setPrintDialogOpen: vi.fn(),
    blockedDialogType: 'edit',
    isLoading: false,
    paymentDialogOpen: false,
    setPaymentDialogOpen: vi.fn(),
    paymentDialogOrder: null,
    journalEntryRef: null,
    journalEntryRefLoading: false,
    orderListRef: { current: null },
    searchInputRef: { current: null },
    handleOrderSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    focusSearchInput: vi.fn(),
    handleReceive: vi.fn(),
    handleReturn: vi.fn(),
    handleEditClick: vi.fn(),
    handleReturnAndEdit: vi.fn(),
    handleReturnOnly: vi.fn(),
    handleUnpayAndEdit: vi.fn(),
    handleReturnAndDelete: vi.fn(),
    handleUnpayAndDelete: vi.fn(),
    handleUnpay: vi.fn(),
    handleOpenPaymentDialog: vi.fn(),
    handleRecordPayments: vi.fn(),
    handleDeleteClick: vi.fn(),
    handleDeleteConfirm: vi.fn(),
    navigateToGoodsReceived: vi.fn(),
    navigateToVendorPayment: vi.fn(),
    navigateToJournalEntry: vi.fn(),
  }),
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
