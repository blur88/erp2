import { configureStore } from '@reduxjs/toolkit'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('requests orders sorted by orderNumber DESC by default', () => {
    renderPage()

    const firstCallArg = vi.mocked(useGetSalesOrdersQuery).mock.calls[0][0]
    expect(firstCallArg).toMatchObject({ sortBy: 'orderNumber', sortOrder: 'DESC' })
  })

  it('passes sort.field=orderNumber to the list page so the column highlights', () => {
    renderPage()

    const listProps = simpleListPageSpy.mock.calls.at(-1)?.[0] as { sort?: { field?: string } }
    expect(listProps.sort?.field).toBe('orderNumber')
  })
})
