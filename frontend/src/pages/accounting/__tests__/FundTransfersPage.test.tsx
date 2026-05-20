import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'

import FundTransfersPage from '../FundTransfersPage'
import accountingReducer, { selectSelectedFundTransfer } from '@/store/slices/accountingSlice'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: () => ({ role: 'admin' }),
}))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}`, getCurrentDate: () => '2026-03-12' }
})
vi.mock('@/hooks/useJournalEntryRef', () => ({
  useJournalEntryRef: () => ({ journalEntryRef: null, journalEntryRefLoading: false, navigateToJournalEntry: vi.fn() }),
}))

const mockedApi = vi.hoisted(() => ({
  useGetFundTransfersQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateFundTransferMutation: vi.fn(),
  useUpdateFundTransferMutation: vi.fn(),
  useLazyGetFundTransferQuery: vi.fn(),
  usePostFundTransferMutation: vi.fn(),
  useDeleteFundTransferMutation: vi.fn(),
  useUnpostFundTransferMutation: vi.fn(),
  useRestoreFundTransferMutation: vi.fn(),
  useGetDeletedFundTransfersQuery: vi.fn(),
  usePermanentDeleteFundTransferMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

const mockTransfer = {
  id: 'trf-1',
  referenceNumber: 'TRF-26-001',
  transferDate: '2026-03-12',
  amount: 1000,
  description: 'Test transfer',
  status: 'draft',
  fiscalPeriodId: 'fp-1',
  journalEntryId: 'je-1',
  sourceAccount: { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET' },
  destinationAccount: { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET' },
  journalEntry: { id: 'je-1', referenceNumber: 'JE-26-001', status: 'posted', lines: [] },
  createdAt: '2026-03-12',
  updatedAt: '2026-03-12',
}

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage(initialUrl = '/accounting/fund-transfers') {
  const store = makeStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <FundTransfersPage />
      </MemoryRouter>
    </Provider>,
  )
  return { ...view, store }
}

describe('FundTransfersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetFundTransfersQuery.mockReturnValue({
      data: { data: [mockTransfer], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [
        { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET', isActive: true, isCashEquivalent: true },
        { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET', isActive: true, isCashEquivalent: true },
      ]},
      isLoading: false,
    })
    mockedApi.useCreateFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useUpdateFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useLazyGetFundTransferQuery.mockReturnValue([vi.fn().mockResolvedValue({})])
    mockedApi.usePostFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useDeleteFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useUnpostFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useRestoreFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useGetDeletedFundTransfersQuery.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn() })
    mockedApi.usePermanentDeleteFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
  })

  it('renders page title', () => {
    renderPage()
    expect(screen.getByText('Fund Transfers')).toBeInTheDocument()
  })

  it('renders transfer reference number in the narrow list', () => {
    const { container } = renderPage()
    const listRow = container.querySelector('[data-index="0"]')
    expect(listRow).not.toBeNull()
    expect(within(listRow as HTMLElement).getByText('TRF-26-001')).toBeInTheDocument()
  })

  it('does not render date, from/to account, or amount columns in the list', () => {
    renderPage()
    // The narrow EntityTable list should NOT show these fields as column headers
    expect(screen.queryByRole('columnheader', { name: /date/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /from/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /amount/i })).not.toBeInTheDocument()
  })

  it('renders New Transfer button for admin', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
  })


  it('auto-selects the transfer matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/fund-transfers?highlight=trf-1')

    await waitFor(() => {
      expect(selectSelectedFundTransfer(store.getState())?.id).toBe('trf-1')
    })
  })

  it('renders Source Account filter dropdown', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /source account/i })).toBeInTheDocument()
  })

  it('renders Destination Account filter dropdown', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /destination account/i })).toBeInTheDocument()
  })
})
