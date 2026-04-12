import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import VendorPaymentsPage from '../VendorPaymentsPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const { useGetVendorPaymentsQuery } = vi.hoisted(() => ({
  useGetVendorPaymentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: null,
  })),
}))

const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetVendorPaymentsQuery,
  useLazyGetVendorPaymentQuery: vi.fn(() => [vi.fn()]),
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
        <input placeholder="Search vendor payments..." />
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

vi.mock('../components/VendorPaymentContextHeader', () => ({ default: () => <div>VendorPaymentContextHeader</div> }))
vi.mock('../components/VendorPaymentTable', () => ({ default: () => <div>VendorPaymentTable</div> }))
vi.mock('../components/VendorPaymentWorkspaceCard', () => ({ default: () => <div>VendorPaymentWorkspaceCard</div> }))
vi.mock('../components/VendorPaymentsDialogs', () => ({ default: () => <div>VendorPaymentsDialogs</div> }))
vi.mock('../hooks/useVendorPaymentsSelection', () => ({
  useVendorPaymentsSelection: () => ({
    handlePaymentSelect: vi.fn(),
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
        <VendorPaymentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('VendorPaymentsPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search vendor payments/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with VP components', () => {
    renderPage()
    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('VendorPaymentTable')).toBeInTheDocument()
    expect(screen.getByText('VendorPaymentWorkspaceCard')).toBeInTheDocument()
  })

  it('passes search and supplierId from URL params to the query', () => {
    renderPage('/?search=vp-001&supplierId=sup-1')
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'vp-001',
        supplierId: 'sup-1',
      }),
    )
  })

  it('passes status filter to the query', () => {
    renderPage('/?status=completed')
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
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

  it('sends no startDate or endDate when period is not selected (default)', () => {
    renderPage()
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: undefined,
        endDate: undefined,
      }),
    )
  })

  it('restores period=this_week from URL and resolves to startDate/endDate in the query', () => {
    renderPage('/?period=this_week')
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('sort default is paymentNumber', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      sort: { field: string }
    }
    expect(latestProps.sort.field).toBe('paymentNumber')
  })
})
