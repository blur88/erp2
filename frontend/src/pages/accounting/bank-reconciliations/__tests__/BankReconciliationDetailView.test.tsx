// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankReconciliationDetailDto, ReconciliationLineDto } from '@/types'
import { draftKey, loadDraft, saveDraft } from '../reconciliationDraftStorage'
import BankReconciliationDetailView from '../BankReconciliationDetailView'

const mockNavigate = vi.fn()
const mockComplete = vi.fn()
const mockReopen = vi.fn()
const mockCancelReopen = vi.fn()
const mockDiscard = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
const mockLinesQuery = vi.fn()
const mockRefetch = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

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
  useCompleteBankReconciliationMutation: () => [trigger(mockComplete), { isLoading: false }],
  useReopenBankReconciliationMutation: () => [trigger(mockReopen), { isLoading: false }],
  useCancelReopenBankReconciliationMutation: () => [trigger(mockCancelReopen), { isLoading: false }],
  useDiscardBankReconciliationMutation: () => [trigger(mockDiscard), { isLoading: false }],
  useGetBankReconciliationLinesQuery: (args: any) => mockLinesQuery(args),
}))

function makeLine(over: Partial<ReconciliationLineDto> = {}): ReconciliationLineDto {
  return {
    journalEntryLineId: 'jel-1',
    journalEntryId: 'je-1',
    entryDate: '2026-01-15',
    journalNo: 'JE-001',
    sourceType: 'EXPENSE',
    sourceDocumentId: 'exp-1',
    sourceRef: 'EXP-001',
    description: 'Office Supplies',
    moneyIn: '100.00',
    moneyOut: '0.00',
    role: 'MATCHED',
    prePeriod: false,
    classification: null,
    ...over,
  }
}

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
    setupSummary: {
      prePeriodTotal: 1,
      unclassifiedCount: 0,
      clearedCount: 1,
      outstandingCount: 0,
      openingClearedNet: '100.00',
      openingBalanceDifference: '0.00',
    },
    matched: [makeLine()],
    classified: [],
    ...over,
  }
}

function renderView(detail: BankReconciliationDetailDto = makeDetail(), initialSearch = '') {
  return render(
    <MemoryRouter initialEntries={[`/accounting/bank-reconciliations/${detail.id}/view${initialSearch}`]}>
      <BankReconciliationDetailView reconciliation={detail} onRefetch={mockRefetch} />
    </MemoryRouter>,
  )
}

describe('BankReconciliationDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockLinesQuery.mockReturnValue({
      data: { data: [makeLine()], meta: { total: 1 } },
      isLoading: false,
      isFetching: false,
    })
    mockComplete.mockResolvedValue(makeDetail({ status: 'COMPLETED' }))
    mockReopen.mockResolvedValue(makeDetail({ status: 'DRAFT', reopened: true, currentVersionNo: 1 }))
    mockCancelReopen.mockResolvedValue(makeDetail({ status: 'COMPLETED' }))
    mockDiscard.mockResolvedValue(undefined)
  })

  it('shows Matched and Outstanding tabs, and Cleared at setup only for sequence 1', () => {
    const { unmount } = renderView(makeDetail({ sequenceNo: 1 }))
    expect(screen.getByRole('tab', { name: 'Matched' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Outstanding' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Cleared at setup' })).toBeInTheDocument()
    unmount()

    renderView(makeDetail({ sequenceNo: 2 }))
    expect(screen.getByRole('tab', { name: 'Matched' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Outstanding' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Cleared at setup' })).not.toBeInTheDocument()
  })

  it('requests lines by role and keeps tab and page in the URL', async () => {
    renderView(makeDetail({ sequenceNo: 1 }), '?tab=outstanding&page=2')
    expect(mockLinesQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'r-1',
        role: 'OUTSTANDING',
        page: 2,
      }),
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Cleared at setup' }))
    expect(mockLinesQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'r-1',
        role: 'OPENING_CLEARED',
        page: 1,
      }),
    )
  })

  it.each([
    ['clean draft (writable)', makeDetail(), ['Edit', 'Complete', 'Discard']],
    ['reopened draft (writable)', makeDetail({ reopened: true, currentVersionNo: 1 }), ['Edit', 'Complete', 'Cancel Reopen']],
    ['completed (writable, latest)', makeDetail({ status: 'COMPLETED', isLatest: true, accountHasDraft: false }), ['Reopen']],
    ['non-writable clean draft', makeDetail({ bankAccount: { ...makeDetail().bankAccount, isActive: false } }), ['Discard']],
    ['non-writable reopened draft', makeDetail({ reopened: true, currentVersionNo: 1, bankAccount: { ...makeDetail().bankAccount, isActive: false } }), ['Cancel Reopen']],
  ])('renders the buttons for %s', (_label, detail, expectedButtons) => {
    renderView(detail)
    for (const btn of ['Edit', 'Complete', 'Reopen', 'Cancel Reopen', 'Discard']) {
      const el = screen.queryByRole('button', { name: btn })
      if (expectedButtons.includes(btn)) {
        expect(el).toBeInTheDocument()
      } else {
        expect(el).not.toBeInTheDocument()
      }
    }
  })

  it('disables Complete and lists each blocker', () => {
    const detail = makeDetail({
      summary: {
        ...makeDetail().summary,
        difference: '50.00',
        openingBalanceDifference: '25.00',
        unclassifiedCount: 2,
      },
    })
    renderView(detail)

    const completeBtn = screen.getByRole('button', { name: 'Complete' })
    expect(completeBtn).toBeDisabled()

    expect(screen.getByText('Difference is 50.00')).toBeInTheDocument()
    expect(screen.getByText('Opening Balance Difference is 25.00')).toBeInTheDocument()
    expect(screen.getByText('2 entries are unclassified')).toBeInTheDocument()
  })

  it('shows lockedReason instead of Reopen on a locked completed reconciliation', () => {
    const detail = makeDetail({
      status: 'COMPLETED',
      isLatest: false,
    })
    renderView(detail)

    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
    expect(
      screen.getByText('A later reconciliation exists for this bank account, so this one is locked.'),
    ).toBeInTheDocument()
  })

  it('shows the reopened banner with the completion date', () => {
    const detail = makeDetail({
      status: 'DRAFT',
      reopened: true,
      currentVersionNo: 1,
      completedAt: '2026-02-01T10:00:00Z',
    })
    renderView(detail)

    expect(
      screen.getByText(/Reopened\. Cancel Reopen restores the version completed on/i),
    ).toBeInTheDocument()
  })

  it('on an unwritable account shows readOnlyNotice and offers only Discard (draft) or Cancel Reopen (reopened)', () => {
    const draftDetail = makeDetail({
      bankAccount: { ...makeDetail().bankAccount, isActive: false },
    })
    const { unmount } = renderView(draftDetail)

    expect(
      screen.getByText(/This bank account is no longer an active bank account/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
    unmount()

    const reopenedDetail = makeDetail({
      reopened: true,
      currentVersionNo: 1,
      bankAccount: { ...makeDetail().bankAccount, isBankAccount: false },
    })
    renderView(reopenedDetail)

    expect(screen.getByRole('button', { name: 'Cancel Reopen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
  })

  it('Discard and Cancel Reopen confirm with their exact copy and send lockVersion', async () => {
    const detail = makeDetail({ lockVersion: 3 })
    const { unmount } = renderView(detail)

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard draft?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This deletes the draft reconciliation and releases the entries it had ticked or classified. Its number will not be reused. No journal entries are changed. This cannot be undone.',
      ),
    ).toBeInTheDocument()

    const confirmDiscardBtn = screen.getByRole('button', { name: 'Discard' })
    await userEvent.click(confirmDiscardBtn)

    expect(mockDiscard).toHaveBeenCalledWith({ id: 'r-1', lockVersion: 3 })
    expect(mockShowSuccess).toHaveBeenCalledWith('Draft discarded')
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/bank-reconciliations')
    unmount()

    const reopened = makeDetail({ reopened: true, currentVersionNo: 1, lockVersion: 4 })
    renderView(reopened)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel Reopen' }))
    expect(screen.getByText('Cancel reopen?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This discards every change made since reopening and restores the reconciliation exactly as it was last completed, including its balances and matched entries. No journal entries are changed.',
      ),
    ).toBeInTheDocument()

    const confirmCancelBtn = screen.getByRole('button', { name: 'Cancel Reopen' })
    await userEvent.click(confirmCancelBtn)

    expect(mockCancelReopen).toHaveBeenCalledWith({ id: 'r-1', lockVersion: 4 })
    expect(mockShowSuccess).toHaveBeenCalledWith('Reopen cancelled')
  })

  it('clears the stored draft after a successful lifecycle action and not after a failed one', async () => {
    const key = draftKey('u-1', { reconciliationId: 'r-1' })
    saveDraft(key, {
      v: 1,
      lockVersion: 1,
      form: { ...makeDetail() } as any,
      picker: { checklist: { page: 1, search: '' }, setup: { page: 1, search: '', filter: 'ALL' } },
      savedAt: new Date().toISOString(),
    })

    mockComplete.mockRejectedValueOnce({ status: 500, data: 'Server error' })
    const { unmount } = renderView(makeDetail())

    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
    const confirmBtn = screen.getByRole('button', { name: 'Complete' })
    await userEvent.click(confirmBtn)

    expect(mockShowError).toHaveBeenCalledWith('Server error')
    expect(loadDraft(key)).not.toBeNull()
    unmount()

    // Now test successful complete clears draft
    renderView(makeDetail())
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Reconciliation completed')
      expect(loadDraft(key)).toBeNull()
    })
  })

  it('Journal No links to the journal entry page and a source without a destination is plain text', () => {
    const lineWithLink = makeLine({
      journalEntryLineId: 'l1',
      journalEntryId: 'je-target-1',
      journalNo: 'JE-101',
      sourceType: 'EXPENSE',
      sourceDocumentId: 'exp-101',
      sourceRef: 'EXP-101',
    })
    const lineWithoutDest = makeLine({
      journalEntryLineId: 'l2',
      journalEntryId: 'je-target-2',
      journalNo: 'JE-102',
      sourceType: 'OPENING_BALANCE',
      sourceDocumentId: null,
      sourceRef: 'OB-2026',
    })

    mockLinesQuery.mockReturnValue({
      data: { data: [lineWithLink, lineWithoutDest], meta: { total: 2 } },
      isLoading: false,
      isFetching: false,
    })

    renderView(makeDetail())

    const jLink = screen.getByRole('link', { name: 'JE-101' })
    expect(jLink).toHaveAttribute('href', '/accounting/journal-entries/je-target-1')

    // SourceLink for OPENING_BALANCE renders plain text span
    expect(screen.getByText('OB-2026')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'OB-2026' })).not.toBeInTheDocument()
  })
})
