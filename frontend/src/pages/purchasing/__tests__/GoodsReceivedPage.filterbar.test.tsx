import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GoodsReceivedPage } from '../GoodsReceivedPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const { useGetGoodsReceivedNotesQuery } = vi.hoisted(() => ({
  useGetGoodsReceivedNotesQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: null,
  })),
}))

const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetGoodsReceivedNotesQuery,
  useLazyGetGoodsReceivedNoteQuery: vi.fn(() => [vi.fn()]),
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [{ id: 'sup-1', companyName: 'Anaheim Electronics' }] },
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/components/filters', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return (
      <div>
        <input placeholder="Search goods received notes..." />
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

vi.mock('../components/GRNContextHeader', () => ({ default: () => <div>GRNContextHeader</div> }))
vi.mock('../components/GRNTable', () => ({ default: () => <div>GRNTable</div> }))
vi.mock('../components/GRNWorkspaceCard', () => ({ default: () => <div>GRNWorkspaceCard</div> }))
vi.mock('../components/GRNDialogs', () => ({ default: () => <div>GRNDialogs</div> }))
vi.mock('../hooks/useGRNSelection', () => ({
  useGRNSelection: () => ({
    handleGRNSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    focusSearchInput: vi.fn(),
  }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: { purchasing: purchasingReducer },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <GoodsReceivedPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('GoodsReceivedPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search goods received notes/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with GRN components', () => {
    renderPage()
    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('GRNTable')).toBeInTheDocument()
    expect(screen.getByText('GRNWorkspaceCard')).toBeInTheDocument()
  })

  it('passes search and supplierId from URL params to the query', () => {
    renderPage('/?search=grn-001&supplierId=sup-1')
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'grn-001',
        supplierId: 'sup-1',
      }),
    )
  })

  it('passes status filter to the query', () => {
    renderPage('/?status=received')
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'received',
      }),
    )
  })

  it('configures the supplier filter with the supplier type', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: { fields: Array<{ field: string; type: string }> }
    }
    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'supplierId', type: 'supplier' }),
      ]),
    )
  })

  it('configures the status filter with purchasing-status type', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: { fields: Array<{ field: string; type: string }> }
    }
    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'status', type: 'purchasing-status' }),
      ]),
    )
  })

  it('sends no receivedDateFrom or receivedDateTo when period is not selected (default)', () => {
    renderPage()
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        receivedDateFrom: undefined,
        receivedDateTo: undefined,
      }),
    )
  })

  it('restores period=this_week from URL and resolves to receivedDateFrom/receivedDateTo in the query', () => {
    renderPage('/?period=this_week')
    expect(useGetGoodsReceivedNotesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        receivedDateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        receivedDateTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })
})
