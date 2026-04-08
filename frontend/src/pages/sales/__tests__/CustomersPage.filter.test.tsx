import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import salesReducer from '@/store/slices/salesSlice'
import { salesApiSlice } from '@/store/api/salesApi'
import CustomersPage from '../CustomersPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetCustomersQuery: vi.fn(() => ({
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
    useCreateCustomerMutation: vi.fn(() => [vi.fn()]),
    useUpdateCustomerMutation: vi.fn(() => [vi.fn()]),
    useDeleteCustomerMutation: vi.fn(() => [vi.fn()]),
  }
})

vi.mock('@/store/api/priceListApi', () => ({
  useGetPriceListsQuery: vi.fn(() => ({
    data: { data: [] },
  })),
}))

vi.mock('@/components/common/MasterDetailWorkspace', () => ({
  default: ({ listSlot, headerSlot, workspaceSlot }: any) => (
    <div>
      <div>{listSlot}</div>
      <div>{headerSlot}</div>
      <div>{workspaceSlot}</div>
    </div>
  ),
}))

vi.mock('../components/CustomerWorkspaceCard', () => ({
  default: () => <div data-testid="customer-workspace-card" />,
}))

vi.mock('../components/CustomerContextHeader', () => ({
  default: () => <div data-testid="customer-context-header" />,
}))

vi.mock('../components/CustomerList', () => ({
  default: ({ customers, onSelect, total: _total }: any) => (
    <div data-testid="customer-list">
      {customers.map((customer: any) => (
        <div key={customer.id} data-testid={`customer-item-${customer.id}`} onClick={() => onSelect(customer)}>
          {customer.name}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../hooks/useCustomersSelection', () => ({
  useCustomersSelection: () => ({
    handleCustomerSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleEnterAction: vi.fn(),
    handleEscapeAction: vi.fn(),
  }),
}))

vi.mock('../hooks/useCustomersActions', () => ({
  useCustomersActions: () => ({
    handleDelete: vi.fn(),
    handleCancelDelete: vi.fn(),
  }),
}))

vi.mock('../hooks/useCustomersPageState', () => ({
  useCustomersPageState: () => ({
    deleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    deletedCustomersDialogOpen: false,
    setDeletedCustomersDialogOpen: vi.fn(),
    focusedCustomerIndex: -1,
    setFocusedCustomerIndex: vi.fn(),
    shouldPreserveSearchFocus: false,
    setShouldPreserveSearchFocus: vi.fn(),
    customerListRef: { current: null },
    searchInputRef: { current: null },
  }),
}))

function makeStore() {
  return configureStore({
    reducer: {
      sales: salesReducer,
      [salesApiSlice.reducerPath]: salesApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(salesApiSlice.middleware),
  })
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomersPage filters', () => {
  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or phone/i)).toBeInTheDocument()
  })

  it('renders the Status filter', () => {
    renderPage()
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
  })

  it('renders the Customer Type filter', () => {
    renderPage()
    expect(screen.getAllByText('Customer Type').length).toBeGreaterThan(0)
  })

  it('renders the Price List filter', () => {
    renderPage()
    expect(screen.getAllByText('Price List').length).toBeGreaterThan(0)
  })

  it('renders the CustomerList slot', () => {
    renderPage()
    expect(screen.getByTestId('customer-list')).toBeInTheDocument()
  })
})
