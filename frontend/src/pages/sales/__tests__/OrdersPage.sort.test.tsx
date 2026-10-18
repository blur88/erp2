import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import salesReducer from '@/store/slices/salesSlice'
import { useGetSalesOrdersQuery } from '@/store/api/salesApi'

import OrdersPage from '../OrdersPage'

const simpleListPageSpy = vi.fn()

vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery: vi.fn(() => ({ data: { data: [], meta: { total: 0 } }, isFetching: false, error: undefined })),
  useGetCustomersQuery: vi.fn(() => ({ data: undefined, isFetching: false })),
  useFulfillSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useUnfulfillSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useCancelSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderPaymentsMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderRefundsMutation: vi.fn(() => [vi.fn()]),
  useUncancelSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useDuplicateSalesOrderMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/components/common/SimpleListPage', () => ({
  default: (props: { sort?: { field?: string } }) => {
    simpleListPageSpy(props)
    return null
  },
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('../components/SalesOrdersDialogs', () => ({
  default: () => null,
}))

function renderPage() {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <OrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrdersPage default sort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // useListUrlState hydrates from the live window.location, which jsdom
    // persists across tests in this file.
    window.history.replaceState(null, '', '/')
  })

  it('requests orders sorted by orderNumber DESC by default', () => {
    renderPage()

    const firstCallArg = vi.mocked(useGetSalesOrdersQuery).mock.calls[0][0]
    expect(firstCallArg).toMatchObject({ sortBy: 'orderNumber', sortOrder: 'DESC' })
  })

  it('hydrates page, limit and sort order from the URL', async () => {
    // useListUrlState hydrates from window.location.search, which MemoryRouter
    // never populates — set the real URL before rendering.
    window.history.replaceState(null, '', '/sales/orders?page=2&limit=50&sortOrder=asc')
    renderPage()

    await waitFor(() => {
      expect(vi.mocked(useGetSalesOrdersQuery)).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 50, sortOrder: 'ASC' }),
      )
    })
  })

  it('passes sort.field=orderNumber to the list page so the column highlights', () => {
    renderPage()

    const listProps = simpleListPageSpy.mock.calls.at(-1)?.[0] as { sort?: { field?: string } }
    expect(listProps.sort?.field).toBe('orderNumber')
  })
})
