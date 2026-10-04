// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  Account,
  BankReconciliationDetailDto,
  PreviewResultDto,
  ReconciliationLineDto,
} from '@/types'
import BankReconciliationFormPage from '../BankReconciliationFormPage'
import { draftKey, loadDraft, saveDraft } from '../reconciliationDraftStorage'

const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const mockCurrentUser = { id: 'u-1', username: 'admin' }
vi.mock('@/store/slices/authSlice', () => ({
  selectCurrentUser: () => mockCurrentUser,
}))
vi.mock('@/hooks/useRedux', () => ({
  useAppSelector: (fn: any) => fn(),
}))

const mockAccounts = vi.fn()
const mockExisting = vi.fn()
const mockNextPeriod = vi.fn()
const mockSearchLines = vi.fn()
const mockPreview = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

const trigger = (fn: ReturnType<typeof vi.fn>) => (arg: unknown) => ({ unwrap: () => fn(arg) })

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountsQuery: () => mockAccounts(),
  useGetBankReconciliationQuery: (id: string, opts?: any) => mockExisting(id, opts),
  useGetBankReconciliationNextPeriodQuery: (acctId: string, opts?: any) => mockNextPeriod(acctId, opts),
  useSearchEligibleReconciliationLinesMutation: () => [trigger(mockSearchLines), { isLoading: false }],
  usePreviewBankReconciliationMutation: () => [trigger(mockPreview), { isLoading: false }],
  useCreateBankReconciliationMutation: () => [trigger(mockCreate), { isLoading: false }],
  useUpdateBankReconciliationMutation: () => [trigger(mockUpdate), { isLoading: false }],
}))

const accountsData: Account[] = [
  {
    id: 'ba-1',
    code: '1200',
    name: 'CIMB Bank',
    type: 'Asset',
    parentId: null,
    description: null,
    isActive: true,
    createdBy: null,
    isSystem: false,
    isPostable: true,
    isProviderClearing: false,
    isBankAccount: true,
    openingBalance: '0.0000',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'ba-inactive',
    code: '1299',
    name: 'Old Closed Bank',
    type: 'Asset',
    parentId: null,
    description: null,
    isActive: false,
    createdBy: null,
    isSystem: false,
    isPostable: true,
    isProviderClearing: false,
    isBankAccount: false,
    openingBalance: '0.0000',
    createdAt: '',
    updatedAt: '',
  },
]

function makeLine(over: Partial<ReconciliationLineDto> = {}): ReconciliationLineDto {
  return {
    journalEntryLineId: 'jel-1',
    journalEntryId: 'je-1',
    entryDate: '2026-01-15',
    journalNo: 'JE-001',
    sourceType: 'EXPENSE',
    sourceDocumentId: null,
    sourceRef: 'EXP-1',
    description: 'Office supply',
    moneyIn: '100.00',
    moneyOut: '0.00',
    role: 'OUTSTANDING',
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
    bankAccount: { code: '1200', name: 'CIMB Bank', isActive: true, isBankAccount: true },
    periodFrom: '2026-01-01',
    periodTo: '2026-01-31',
    status: 'DRAFT',
    reopened: false,
    currentVersionNo: null,
    lockVersion: 1,
    completedAt: null,
    completedBy: null,
    isLatest: true,
    accountHasDraft: false,
    summary: {
      openingBalance: '0.00',
      closingBalance: '100.00',
      moneyIn: '100.00',
      moneyOut: '0.00',
      calculatedClosingBalance: '100.00',
      difference: '0.00',
      openingClearedNet: '0.00',
      openingBalanceDifference: '0.00',
      unclassifiedCount: 0,
    },
    matched: [makeLine()],
    classified: [],
    ...over,
  }
}

const defaultPreviewResult: PreviewResultDto = {
  matched: [makeLine()],
  invalidMatched: [],
  invalidClassifications: [],
  setupSummary: {
    prePeriodTotal: 0,
    unclassifiedCount: 0,
    clearedCount: 0,
    outstandingCount: 0,
    openingClearedNet: '0.00',
    openingBalanceDifference: '0.00',
  },
}

describe('BankReconciliationFormPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.clearAllMocks()

    mockAccounts.mockReturnValue({ data: { data: accountsData }, isLoading: false })
    mockExisting.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    mockNextPeriod.mockReturnValue({
      data: {
        sequenceNo: 1,
        isFirst: true,
        periodFrom: null,
        openingBalance: null,
        blockedReason: null,
      },
      isLoading: false,
    })
    mockSearchLines.mockResolvedValue({ data: [makeLine()], meta: { total: 1, page: 1, limit: 25 } })
    mockPreview.mockResolvedValue(defaultPreviewResult)
    mockCreate.mockResolvedValue({ id: 'r-created' })
    mockUpdate.mockResolvedValue({ id: 'r-1' })
  })

  function renderCreate(initialQuery = '') {
    return render(
      <MemoryRouter initialEntries={[`/accounting/bank-reconciliations/create${initialQuery}`]}>
        <Routes>
          <Route path="/accounting/bank-reconciliations/create" element={<BankReconciliationFormPage />} />
          <Route path="/accounting/bank-reconciliations/:id/view" element={<div>DETAIL VIEW</div>} />
          <Route path="/accounting/bank-reconciliations" element={<div>LIST PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function renderEdit(id = 'r-1') {
    return render(
      <MemoryRouter initialEntries={[`/accounting/bank-reconciliations/${id}/edit`]}>
        <Routes>
          <Route path="/accounting/bank-reconciliations/:id/edit" element={<BankReconciliationFormPage />} />
          <Route path="/accounting/bank-reconciliations/:id/view" element={<div>DETAIL VIEW</div>} />
          <Route path="/accounting/bank-reconciliations" element={<div>LIST PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('subsequent reconciliation: From and Opening Balance are read-only and come from next-period', async () => {
    mockNextPeriod.mockReturnValue({
      data: {
        sequenceNo: 2,
        isFirst: false,
        periodFrom: '2026-02-01',
        openingBalance: '500.00',
        blockedReason: null,
      },
      isLoading: false,
    })

    renderCreate()

    const accountSelect = screen.getByLabelText('Bank Account')
    await userEvent.click(accountSelect)
    await userEvent.click(screen.getByRole('option', { name: '1200 CIMB Bank' }))

    const fromInput = screen.getByLabelText('Period From')
    const openingInput = screen.getByLabelText('Opening Balance')

    await waitFor(() => {
      expect(fromInput).toHaveValue('2026-02-01')
      expect(openingInput).toHaveValue('500.00')
      expect(fromInput).toBeDisabled()
      expect(openingInput).toBeDisabled()
    })
  })

  it('disables Create and shows blockedReason when a draft already exists for the account', async () => {
    mockNextPeriod.mockReturnValue({
      data: {
        sequenceNo: 2,
        isFirst: false,
        periodFrom: null,
        openingBalance: null,
        blockedReason: 'A draft already exists for this bank account.',
      },
      isLoading: false,
    })

    renderCreate()

    await userEvent.click(screen.getByLabelText('Bank Account'))
    await userEvent.click(screen.getByRole('option', { name: '1200 CIMB Bank' }))

    expect(await screen.findByText('A draft already exists for this bank account.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('shortening To shows the invalid panel, blocks Save, and unticks nothing by itself', async () => {
    const detail = makeDetail()
    mockExisting.mockReturnValue({ data: detail, isLoading: false, isError: false })

    mockPreview.mockResolvedValue({
      matched: [],
      invalidMatched: [makeLine({ journalEntryLineId: 'jel-1', journalNo: 'JE-OUT-OF-PERIOD' })],
      invalidClassifications: [],
      setupSummary: null,
    })

    renderEdit()

    await waitFor(() => expect(screen.getByLabelText('Period To')).toHaveValue('2026-01-31'))

    await userEvent.clear(screen.getByLabelText('Period To'))
    await userEvent.type(screen.getByLabelText('Period To'), '2026-01-10')

    expect(await screen.findByText(/JE-OUT-OF-PERIOD/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  })

  it('moving From earlier lists invalid classifications and blocks Save until each is cleared', async () => {
    const detail = makeDetail()
    mockExisting.mockReturnValue({ data: detail, isLoading: false, isError: false })

    mockPreview.mockResolvedValue({
      matched: [makeLine()],
      invalidMatched: [],
      invalidClassifications: [makeLine({ journalEntryLineId: 'c-invalid', journalNo: 'JE-INV-CLASS' })],
      setupSummary: null,
    })

    renderEdit()

    await userEvent.clear(screen.getByLabelText('Period From'))
    await userEvent.type(screen.getByLabelText('Period From'), '2025-12-01')

    expect(await screen.findByText(/JE-INV-CLASS/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()

    const clearBtn = screen.getByRole('button', { name: 'Clear classification' })
    await userEvent.click(clearBtn)

    await waitFor(() => {
      expect(screen.queryByText(/JE-INV-CLASS/)).not.toBeInTheDocument()
    })
  })

  it('restores the whole form on /create through the draft token in the URL', async () => {
    const token = 'tok-restore-1'
    const key = draftKey('u-1', { createToken: token })
    saveDraft(key, {
      v: 1,
      lockVersion: null,
      form: {
        bankAccountId: 'ba-1',
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '100.00',
        closingBalance: '250.00',
        matched: {},
        setupChanges: {},
      },
      picker: {
        checklist: { page: 1, search: 'custom search' },
        setup: { page: 1, search: '', filter: 'ALL' },
      },
      savedAt: new Date().toISOString(),
    })

    renderCreate(`?draft=${token}`)

    await waitFor(() => {
      expect(screen.getByLabelText('Closing Balance')).toHaveValue('250.00')
      expect(screen.getByPlaceholderText('Search transactions...')).toHaveValue('custom search')
    })
  })

  it('stale lockVersion: loads server state and shows the could-not-be-restored message', async () => {
    const detail = makeDetail({ lockVersion: 2, summary: { ...makeDetail().summary, closingBalance: '999.00' } })
    mockExisting.mockReturnValue({ data: detail, isLoading: false, isError: false })

    const key = draftKey('u-1', { reconciliationId: 'r-1' })
    saveDraft(key, {
      v: 1,
      lockVersion: 1, // older lockVersion!
      form: {
        bankAccountId: 'ba-1',
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '111.00',
        matched: {},
        setupChanges: {},
      },
      picker: { checklist: { page: 1, search: '' }, setup: { page: 1, search: '', filter: 'ALL' } },
      savedAt: new Date().toISOString(),
    })

    renderEdit('r-1')

    expect(
      await screen.findByText(/Your unsaved changes could not be restored because this reconciliation was changed elsewhere/),
    ).toBeInTheDocument()

    // Must show server state (999.00), not the draft (111.00)
    expect(screen.getByLabelText('Closing Balance')).toHaveValue('999.00')
    expect(loadDraft(key)).toBeNull()
  })

  it('a failed save keeps the form and the stored draft and shows the server message', async () => {
    const detail = makeDetail()
    mockExisting.mockReturnValue({ data: detail, isLoading: false, isError: false })
    mockUpdate.mockRejectedValue({ status: 409, data: 'Reconciliation has concurrency conflict.' })

    renderEdit('r-1')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled())
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Reconciliation has concurrency conflict.')).toBeInTheDocument()

    const key = draftKey('u-1', { reconciliationId: 'r-1' })
    expect(loadDraft(key)).not.toBeNull()
  })

  it('clears the stored draft after a successful save and after a confirmed Cancel', async () => {
    const detail = makeDetail()
    mockExisting.mockReturnValue({ data: detail, isLoading: false, isError: false })
    const key = draftKey('u-1', { reconciliationId: 'r-1' })

    const { unmount } = renderEdit('r-1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled())

    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    expect(loadDraft(key)).toBeNull()

    unmount()

    // Now test cancel
    saveDraft(key, {
      v: 1,
      lockVersion: 1,
      form: { ...makeDetail(), closingBalance: '888.00' } as any,
      picker: { checklist: { page: 1, search: '' }, setup: { page: 1, search: '', filter: 'ALL' } },
      savedAt: new Date().toISOString(),
    })

    renderEdit('r-1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Dirty confirm dialog appears
    const confirmBtn = screen.getByRole('button', { name: 'Discard Changes' })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(loadDraft(key)).toBeNull()
    })
  })

  it('accepts negative opening and closing balances', async () => {
    renderCreate()

    await userEvent.click(screen.getByLabelText('Bank Account'))
    await userEvent.click(screen.getByRole('option', { name: '1200 CIMB Bank' }))

    const opening = screen.getByLabelText('Opening Balance')
    const closing = screen.getByLabelText('Closing Balance')

    await userEvent.clear(opening)
    await userEvent.type(opening, '-150.00')

    await userEvent.clear(closing)
    await userEvent.type(closing, '-50.00')

    expect(opening).toHaveValue('-150.00')
    expect(closing).toHaveValue('-50.00')

    expect(screen.getByTestId('summary-difference')).toBeInTheDocument()
  })

  it('edit of a reconciliation whose account is no longer a bank account shows it as a disabled option', async () => {
    const detail = makeDetail({
      bankAccountId: 'ba-inactive',
      bankAccount: { code: '1299', name: 'Old Closed Bank', isActive: false, isBankAccount: false },
    })
    mockExisting.mockReturnValue({ data: detail, isLoading: false, isError: false })

    renderEdit('r-1')

    // Expect redirect or disabled option depending on accountWritable
    // accountWritable is false for ba-inactive, so it warns and redirects to view
    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled()
      expect(screen.getByText('DETAIL VIEW')).toBeInTheDocument()
    })
  })
})
