import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StockAdjustmentsPage from '../StockAdjustmentsPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetStockAdjustmentsQuery } = vi.hoisted(() => ({
  useGetStockAdjustmentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetStockAdjustmentsQuery,
  useLazyGetStockAdjustmentQuery: vi.fn(() => [vi.fn(), { data: undefined }]),
  useCompleteStockAdjustmentMutation: vi.fn(() => [vi.fn(), {}]),
  useDeleteStockAdjustmentMutation: vi.fn(() => [vi.fn(), {}]),
  useUncompleteStockAdjustmentMutation: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/inventory/DeletedStockAdjustmentsDialog', () => ({
  default: () => <div>DeletedStockAdjustmentsDialog</div>,
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { inventory: inventoryReducer } })
  const url = new URL(initialUrl, 'http://localhost')

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search }]}>
        <StockAdjustmentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('StockAdjustmentsPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by adjustment number or notes/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes to query', () => {
    renderPage('/?status=draft')
    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft' }),
    )
  })

  it('passes no status when unset', () => {
    renderPage('/')
    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    )
  })

  it('renders the stock adjustments content region as a shrinkable flex container', () => {
    renderPage()

    const contentRegion = screen.getByTestId('stock-adjustments-content-region')

    expect(window.getComputedStyle(contentRegion).flexGrow).toBe('1')
    expect(window.getComputedStyle(contentRegion).minHeight).toBe('0px')
  })

  it('does not add extra page-root bottom padding beyond MainLayout', () => {
    renderPage()

    const pageRoot = screen.getByTestId('stock-adjustments-page-root')

    expect(window.getComputedStyle(pageRoot).paddingBottom).toBe('0px')
  })
})
