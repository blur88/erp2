import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StockAdjustmentsPage from '../StockAdjustmentsPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetStockAdjustmentsQuery, mockFetchStockAdjustment } = vi.hoisted(() => ({
  useGetStockAdjustmentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
  mockFetchStockAdjustment: vi.fn(),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetStockAdjustmentsQuery,
  useLazyGetStockAdjustmentQuery: vi.fn(() => [mockFetchStockAdjustment, { data: undefined }]),
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
    mockFetchStockAdjustment.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({
        id: 'adj-1',
        adjustmentNumber: 'SA-001',
        adjustmentDate: '2026-03-01T00:00:00.000Z',
        itemCount: 1,
        status: 'draft',
        items: [],
      }),
    })
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

  it('selects the adjustment referenced by the highlight search param', async () => {
    useGetStockAdjustmentsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'adj-1',
            adjustmentNumber: 'SA-001',
            adjustmentDate: '2026-03-01T00:00:00.000Z',
            itemCount: 1,
            status: 'draft',
            items: [],
          },
          {
            id: 'adj-2',
            adjustmentNumber: 'SA-002',
            adjustmentDate: '2026-03-02T00:00:00.000Z',
            itemCount: 1,
            status: 'draft',
            items: [],
          },
        ],
        meta: { total: 2 },
      },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    })

    renderPage('/?highlight=adj-2')

    await waitFor(() => {
      expect(screen.getByText('SA-002')).toBeInTheDocument()
    })
  })

  it('sends no fromDate or toDate when period is not selected (default)', () => {
    renderPage()

    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: undefined,
        toDate: undefined,
      }),
    )
  })

  it('restores period=this_week from URL and resolves to fromDate/toDate in the query', () => {
    renderPage('/?period=this_week')

    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('sends no fromDate or toDate when period is reset to null', () => {
    renderPage('/?period=this_week')

    renderPage('/')

    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: undefined,
        toDate: undefined,
      }),
    )
  })
})
