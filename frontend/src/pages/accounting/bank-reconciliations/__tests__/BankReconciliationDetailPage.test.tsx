// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankReconciliationDetailDto } from '@/types'
import BankReconciliationDetailPage from '../BankReconciliationDetailPage'

const mockGetReconciliation = vi.fn()
const mockGetLines = vi.fn()
const mockComplete = vi.fn()
const mockSearchEligible = vi.fn()
const mockPreview = vi.fn()
const mockRefetch = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('@/hooks/useRedux', () => ({
  useAppSelector: (selector: any) => selector(),
}))

vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: () => ({ id: 'u-1', username: 'admin' }),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

const trigger = (fn: ReturnType<typeof vi.fn>) => (args: any) => ({
  unwrap: () => fn(args),
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetBankReconciliationQuery: (id: string) => mockGetReconciliation(id),
  useGetBankReconciliationLinesQuery: (args: any) => mockGetLines(args),
  useCompleteBankReconciliationMutation: () => [trigger(mockComplete), { isLoading: false }],
  useReopenBankReconciliationMutation: () => [trigger(vi.fn()), { isLoading: false }],
  useCancelReopenBankReconciliationMutation: () => [trigger(vi.fn()), { isLoading: false }],
  useDiscardBankReconciliationMutation: () => [trigger(vi.fn()), { isLoading: false }],
  useSearchEligibleReconciliationLinesMutation: () => [trigger(mockSearchEligible), { isLoading: false }],
  usePreviewBankReconciliationMutation: () => [trigger(mockPreview), { isLoading: false }],
}))

function makeDetail(over: Partial<BankReconciliationDetailDto> = {}): BankReconciliationDetailDto {
  return {
    id: 'r-1',
    reconciliationNo: 'BR-26-001',
    sequenceNo: 1,
    bankAccountId: 'ba-1',
    bankAccount: {
      id: 'ba-1',
      code: '1200',
      name: 'CIMB Bank',
      isBankAccount: true,
      isActive: true,
    },
    periodFrom: '2026-01-01',
    periodTo: '2026-01-31',
    openingBalance: '1000.00',
    closingBalance: '1100.00',
    status: 'DRAFT',
    reopened: false,
    currentVersionNo: null,
    lockVersion: 1,
    completedAt: null,
    completedBy: null,
    isLatest: true,
    accountHasDraft: false,
    summary: {
      openingBalance: '1000.00',
      closingBalance: '1100.00',
      matchedMoneyIn: '100.00',
      matchedMoneyOut: '0.00',
      calculatedClosingBalance: '1100.00',
      difference: '0.00',
      openingBalanceDifference: '0.00',
      unclassifiedCount: 0,
    },
    setupSummary: null,
    matched: [],
    classified: [],
    ...over,
  }
}

function renderPage(id = 'r-1') {
  return render(
    <MemoryRouter initialEntries={[`/accounting/bank-reconciliations/${id}/view`]}>
      <Routes>
        <Route path="/accounting/bank-reconciliations/:id/view" element={<BankReconciliationDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BankReconciliationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLines.mockReturnValue({
      data: { data: [], meta: { total: 0 } },
      isLoading: false,
      isFetching: false,
    })
  })

  it('renders loading spinner when fetching', () => {
    mockGetReconciliation.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    })

    renderPage('r-1')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders not found when query errors or data missing', () => {
    mockGetReconciliation.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    })

    renderPage('r-1')
    expect(screen.getByText(/Bank reconciliation not found/i)).toBeInTheDocument()
  })

  it('shows the server message and refetches after a rejected Complete', async () => {
    const detail = makeDetail()
    mockGetReconciliation.mockReturnValue({
      data: detail,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    })
    mockComplete.mockRejectedValue({
      status: 409,
      data: { message: 'A concurrent transaction was posted.' },
    })

    renderPage('r-1')

    const completeBtn = screen.getByRole('button', { name: 'Complete' })
    await userEvent.click(completeBtn)

    const confirmBtn = screen.getByRole('button', { name: 'Complete' })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('A concurrent transaction was posted.')
      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  it('Completed view never requests eligible-lines search or preview', () => {
    const completedDetail = makeDetail({ status: 'COMPLETED', isLatest: true })
    mockGetReconciliation.mockReturnValue({
      data: completedDetail,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    })

    renderPage('r-1')

    expect(mockSearchEligible).not.toHaveBeenCalled()
    expect(mockPreview).not.toHaveBeenCalled()
    expect(screen.getAllByText('BR-26-001')[0]).toBeInTheDocument()
  })
})
