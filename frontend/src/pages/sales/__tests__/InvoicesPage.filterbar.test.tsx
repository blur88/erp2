import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InvoicesPage from '../InvoicesPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetInvoicesQuery } = vi.hoisted(() => ({
  useGetInvoicesQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetInvoicesQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Amuro Ray' }] },
  })),
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
vi.mock('../components/InvoiceContextHeader', () => ({ default: () => <div>InvoiceContextHeader</div> }))
vi.mock('../components/InvoiceWorkspaceCard', () => ({ default: () => <div>InvoiceWorkspaceCard</div> }))
vi.mock('../components/InvoicesTable', () => ({ default: () => <div>InvoicesTable</div> }))
vi.mock('../components/InvoicesDialogs', () => ({ default: () => <div>InvoicesDialogs</div> }))
vi.mock('../hooks/useInvoicesActions', () => ({
  useInvoicesActions: () => ({
    handleCreateInvoice: vi.fn(),
    handleEditInvoice: vi.fn(),
    handleDeleteInvoice: vi.fn(),
  }),
}))
vi.mock('../hooks/useInvoicesSelection', () => ({
  useInvoicesSelection: () => ({
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleEnterAction: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handleEscapeAction: vi.fn(),
    handleInvoiceSelect: vi.fn(),
    handleSalesOrderClick: vi.fn(),
    handleNavigateToPayment: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showError: vi.fn() }),
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
        <InvoicesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('InvoicesPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search invoices/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with split invoice detail cards', () => {
    renderPage()

    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('InvoicesTable')).toBeInTheDocument()
    expect(screen.getByText('InvoiceContextHeader')).toBeInTheDocument()
    expect(screen.getByText('InvoiceWorkspaceCard')).toBeInTheDocument()
  })

  it('restores filters from URL into the invoices query', () => {
    renderPage('/?search=gundam&customerId=cust-1')
    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'gundam',
        customerId: 'cust-1',
      }),
    )
  })

  it('sends no fromDate or toDate when period is not selected by default', () => {
    renderPage()

    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: undefined,
        toDate: undefined,
      }),
    )
  })

  it('period filter appears before customer filter in the DOM', () => {
    renderPage()

    const periodLabel = screen.getAllByText('Period')[0]
    const customerLabel = screen.getAllByText('Customer')[0]

    expect(
      periodLabel.compareDocumentPosition(customerLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('restores period=this_week from URL and resolves to fromDate/toDate in the query', () => {
    renderPage('/?period=this_week')
    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('restores paymentStatus=paid from URL and passes it to the query', () => {
    renderPage('/?paymentStatus=paid')
    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paymentStatus: 'paid',
      }),
    )
  })

  it('restores fulfillmentStatus=fulfilled from URL and passes it to the query', () => {
    renderPage('/?fulfillmentStatus=fulfilled')
    expect(useGetInvoicesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fulfillmentStatus: 'fulfilled',
      }),
    )
  })
})
