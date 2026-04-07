import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import CustomersPage from '../CustomersPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetCustomersQuery } = vi.hoisted(() => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetCustomersQuery,
    useCreateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
    useDeleteCustomerMutation: vi.fn(() => [vi.fn(), {}]),
    useUpdateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
  }
})

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

vi.mock('@/components/sales/DeletedCustomersDialog', () => ({
  default: () => <div>DeletedCustomersDialog</div>,
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

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <CustomersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomersPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or phone/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes them to query', () => {
    renderPage('/?search=acme&status=active')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'acme', isActive: true }),
    )
  })

  it('passes no isActive when status is unset', () => {
    renderPage('/')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })

  it('does not pass a limit override to the customers query', () => {
    renderPage('/')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ limit: expect.anything() }),
    )
  })
})
