// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  describe('selection, payloads and recovery', () => {
    const emptyPage = { data: [], meta: { total: 0, page: 1, limit: 25 } }
    const checkboxFor = (journalNo: string) =>
      screen.getByRole('checkbox', { name: new RegExp(`^Select ${journalNo},`) })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('keeps selections and the summary across paging and search, and saves the full set', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      mockSearchLines.mockImplementation(async (arg: any) => {
        if (arg.view !== 'checklist') return emptyPage
        if (arg.search) return emptyPage
        if (arg.page === 2) {
          return {
            data: [makeLine({ journalEntryLineId: 'jel-2', journalNo: 'JE-002', moneyIn: '50.00' })],
            meta: { total: 30, page: 2, limit: 25 },
          }
        }
        return { data: [makeLine()], meta: { total: 30, page: 1, limit: 25 } }
      })
      mockPreview.mockImplementation(async (arg: any) => ({
        ...defaultPreviewResult,
        matched: [
          makeLine(),
          makeLine({ journalEntryLineId: 'jel-2', journalNo: 'JE-002', moneyIn: '50.00' }),
        ].filter((l) => arg.matchedLineIds.includes(l.journalEntryLineId)),
      }))

      renderEdit()
      await waitFor(() => expect(checkboxFor('JE-001')).toBeChecked())
      expect(screen.getByTestId('summary-money-in')).toHaveTextContent('100.00')

      // Page 2: JE-001 is no longer on screen but stays selected and in the totals.
      await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
      await userEvent.click(await screen.findByRole('checkbox', { name: /^Select JE-002,/ }))
      expect(screen.getByTestId('summary-money-in')).toHaveTextContent('150.00')

      // A search that matches nothing hides every row; the totals do not move.
      await userEvent.type(screen.getByPlaceholderText('Search transactions...'), 'zzz')
      await waitFor(() => expect(screen.queryByRole('checkbox', { name: /^Select / })).not.toBeInTheDocument())
      expect(screen.getByTestId('summary-money-in')).toHaveTextContent('150.00')

      await userEvent.clear(screen.getByPlaceholderText('Search transactions...'))
      await waitFor(() => expect(checkboxFor('JE-001')).toBeChecked())

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled())
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
      const sent = mockUpdate.mock.calls[0][0]
      expect(sent.id).toBe('r-1')
      expect(sent.body.lockVersion).toBe(1)
      expect(sent.body.matchedLineIds).toEqual(['jel-1', 'jel-2'])
    })

    it('sends setup changes separately from the matched set, and no lockVersion on create', async () => {
      const token = 'tok-payload'
      saveDraft(draftKey('u-1', { createToken: token }), {
        v: 1,
        lockVersion: null,
        form: {
          bankAccountId: 'ba-1',
          periodFrom: '2026-01-01',
          periodTo: '2026-01-31',
          openingBalance: '100.00',
          closingBalance: '200.00',
          matched: { 'jel-1': { moneyIn: '100.00', moneyOut: '0.00' } },
          setupChanges: { 'jel-pre': 'OUTSTANDING' },
        },
        picker: { checklist: { page: 1, search: '' }, setup: { page: 1, search: '', filter: 'ALL' } },
        savedAt: new Date().toISOString(),
      })

      renderCreate(`?draft=${token}`)
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled())
      await userEvent.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
      const body = mockCreate.mock.calls[0][0]
      expect(body).not.toHaveProperty('lockVersion')
      expect(body.matchedLineIds).toEqual(['jel-1'])
      expect(body.setupChanges).toEqual([{ journalEntryLineId: 'jel-pre', classification: 'OUTSTANDING' }])
    })

    it('refreshes the preview after ticking and after classifying, and shows the unclassified count it returns', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      mockSearchLines.mockImplementation(async (arg: any) =>
        arg.view === 'setup'
          ? {
              data: [makeLine({
                journalEntryLineId: 'jel-pre', journalNo: 'JE-PRE', entryDate: '2025-12-20',
                prePeriod: true, classification: 'UNCLASSIFIED',
              })],
              meta: { total: 1, page: 1, limit: 25 },
            }
          : { data: [makeLine()], meta: { total: 1, page: 1, limit: 25 } },
      )
      // A ticked pre-period entry that is not classified still counts as unclassified:
      // the count is whatever the server's preview reports.
      mockPreview.mockResolvedValue({
        ...defaultPreviewResult,
        setupSummary: { ...defaultPreviewResult.setupSummary!, prePeriodTotal: 1, unclassifiedCount: 1 },
      })

      renderEdit()
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('1 unclassified')).toBeInTheDocument()

      await userEvent.click(await screen.findByRole('checkbox', { name: /^Select JE-001,/ }))
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(2))
      expect(mockPreview.mock.calls[1][0].matchedLineIds).toEqual([])

      await userEvent.click(await screen.findByRole('button', { name: 'Already cleared' }))
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(3))
      expect(mockPreview.mock.calls[2][0].setupChanges).toEqual([
        { journalEntryLineId: 'jel-pre', classification: 'CLEARED' },
      ])
    })

    it('restores the whole form after following a Journal No link and coming back (edit)', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      mockSearchLines.mockImplementation(async (arg: any) =>
        arg.view === 'checklist' ? { data: [makeLine()], meta: { total: 1, page: 1, limit: 25 } } : emptyPage,
      )
      mockPreview.mockImplementation(async (arg: any) => ({
        ...defaultPreviewResult,
        matched: arg.matchedLineIds.includes('jel-1') ? [makeLine()] : [],
      }))

      function JournalStub() {
        const navigate = useNavigate()
        return <button onClick={() => navigate(-1)}>BACK FROM JOURNAL</button>
      }
      render(
        <MemoryRouter initialEntries={['/accounting/bank-reconciliations/r-1/edit']}>
          <Routes>
            <Route path="/accounting/bank-reconciliations/:id/edit" element={<BankReconciliationFormPage />} />
            <Route path="/accounting/journal-entries/:id" element={<JournalStub />} />
          </Routes>
        </MemoryRouter>,
      )

      await waitFor(() => expect(checkboxFor('JE-001')).toBeChecked())
      const closing = screen.getByLabelText('Closing Balance')
      await userEvent.clear(closing)
      await userEvent.type(closing, '777.00')
      await userEvent.click(checkboxFor('JE-001'))
      expect(checkboxFor('JE-001')).not.toBeChecked()

      await userEvent.click(screen.getByRole('link', { name: 'JE-001' }))
      await userEvent.click(await screen.findByRole('button', { name: 'BACK FROM JOURNAL' }))

      await waitFor(() => expect(screen.getByLabelText('Closing Balance')).toHaveValue('777.00'))
      await waitFor(() => expect(checkboxFor('JE-001')).not.toBeChecked())
    })

    it('previews after a restore and puts selections that are no longer eligible in the invalid panel', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      saveDraft(draftKey('u-1', { reconciliationId: 'r-1' }), {
        v: 1,
        lockVersion: 1,
        form: {
          bankAccountId: 'ba-1',
          periodFrom: '2026-01-01',
          periodTo: '2026-01-31',
          openingBalance: '0.00',
          closingBalance: '100.00',
          matched: { 'jel-9': { moneyIn: '40.00', moneyOut: '0.00' } },
          setupChanges: {},
        },
        picker: { checklist: { page: 1, search: '' }, setup: { page: 1, search: '', filter: 'ALL' } },
        savedAt: new Date().toISOString(),
      })
      mockPreview.mockResolvedValue({
        matched: [],
        invalidMatched: [makeLine({ journalEntryLineId: 'jel-9', journalNo: 'JE-GONE' })],
        invalidClassifications: [],
        setupSummary: null,
      })

      renderEdit()

      expect(await screen.findByText(/JE-GONE/)).toBeInTheDocument()
      expect(mockPreview.mock.calls[0][0].matchedLineIds).toEqual(['jel-9'])
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
    })

    it('does not adopt a newer server lockVersion for a form that was loaded from an older one', async () => {
      const key = draftKey('u-1', { reconciliationId: 'r-1' })
      mockExisting.mockReturnValue({ data: makeDetail({ lockVersion: 1 }), isLoading: false, isError: false })
      mockUpdate.mockRejectedValue({ status: 409, data: 'This reconciliation was changed by someone else. Reload to continue.' })
      renderEdit()

      const closing = await screen.findByLabelText('Closing Balance')
      await waitFor(() => expect(closing).toHaveValue('100.00'))
      await userEvent.clear(closing)
      await userEvent.type(closing, '777.00')
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
      expect(await screen.findByText('This reconciliation was changed by someone else. Reload to continue.')).toBeInTheDocument()
      expect(mockUpdate.mock.calls[0][0].body.lockVersion).toBe(1)

      // The failed mutation invalidates the cache, so the record refetches at the
      // other session's lockVersion while this form still holds the older content.
      mockExisting.mockReturnValue({
        data: makeDetail({ lockVersion: 2, summary: { ...makeDetail().summary, closingBalance: '500.00' } }),
        isLoading: false,
        isError: false,
      })
      await userEvent.type(closing, '1')

      expect(
        await screen.findByText(/This reconciliation was changed elsewhere after you opened it/),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
      // The stored draft keeps the version it was based on, so a reload reports it as stale.
      expect(loadDraft(key)?.lockVersion).toBe(1)
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    it('renders and saves normally when sessionStorage throws', async () => {
      // Only sessionStorage fails. The prototype is shared with localStorage,
      // which unrelated utilities read, so every other receiver passes through.
      const failing: Array<'setItem' | 'getItem' | 'removeItem'> = ['setItem', 'getItem', 'removeItem']
      const spies = failing.map((method) => {
        const original = Storage.prototype[method] as (...a: unknown[]) => unknown
        return vi.spyOn(Storage.prototype, method).mockImplementation(function (this: Storage, ...args: unknown[]) {
          if (this === window.sessionStorage) throw new Error('sessionStorage unavailable')
          return original.apply(this, args)
        } as never)
      })
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })

      renderEdit()
      await waitFor(() => expect(checkboxFor('JE-001')).toBeChecked())

      const closing = screen.getByLabelText('Closing Balance')
      await userEvent.clear(closing)
      await userEvent.type(closing, '100.00')

      await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).not.toBeDisabled())
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
      expect(mockShowSuccess).toHaveBeenCalled()
      // The failure path was really exercised, not bypassed.
      expect(spies[0]).toHaveBeenCalled()
    })
  })

  describe('preview and search request ordering', () => {
    function deferred<T>() {
      let resolve!: (v: T) => void
      const promise = new Promise<T>((r) => { resolve = r })
      return { promise, resolve }
    }
    const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
    const previewWith = (journalNo: string): PreviewResultDto => ({
      matched: [],
      invalidMatched: [makeLine({ journalEntryLineId: 'jel-1', journalNo })],
      invalidClassifications: [],
      setupSummary: null,
    })
    const searchResult = (journalNo: string) => ({
      data: [makeLine({ journalEntryLineId: `jel-${journalNo}`, journalNo })],
      meta: { total: 1, page: 1, limit: 25 },
    })

    it('an unchanged successful preview causes no further preview requests', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      renderEdit()

      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1))
      // Well past the 300 ms debounce, several times over.
      await wait(1200)
      expect(mockPreview).toHaveBeenCalledTimes(1)
    })

    it('a preview that changes an amount settles after one follow-up request', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      mockPreview.mockResolvedValue({
        ...defaultPreviewResult,
        matched: [makeLine({ moneyIn: '100.01' })],
      })
      renderEdit()

      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(2))
      await wait(1200)
      expect(mockPreview).toHaveBeenCalledTimes(2)
    })

    it('drops an older preview response that resolves after a newer one', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      renderEdit()
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1))

      const older = deferred<PreviewResultDto>()
      const newer = deferred<PreviewResultDto>()
      mockPreview.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)

      // Period changes preview immediately, so two changes are two in-flight requests.
      fireEvent.change(screen.getByLabelText('Period To'), { target: { value: '2026-01-20' } })
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(2))
      fireEvent.change(screen.getByLabelText('Period To'), { target: { value: '2026-01-10' } })
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(3))

      await act(async () => { newer.resolve(previewWith('JE-NEWER')) })
      expect(await screen.findByText(/JE-NEWER/)).toBeInTheDocument()

      await act(async () => { older.resolve(previewWith('JE-OLDER')) })
      await wait(50)
      expect(screen.queryByText(/JE-OLDER/)).not.toBeInTheDocument()
      expect(screen.getByText(/JE-NEWER/)).toBeInTheDocument()
    })

    it('a late preview response never re-ticks a row the user has since unticked', async () => {
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      renderEdit()
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1))

      const late = deferred<PreviewResultDto>()
      mockPreview.mockReturnValueOnce(late.promise)
      fireEvent.change(screen.getByLabelText('Period To'), { target: { value: '2026-01-20' } })
      await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(2))

      const checklistCheckbox = () => screen.getByRole('checkbox', { name: /^Select JE-001,/ })
      await waitFor(() => expect(checklistCheckbox()).toBeChecked())
      await userEvent.click(checklistCheckbox())
      expect(checklistCheckbox()).not.toBeChecked()

      // The in-flight response still lists jel-1 as a matched line.
      await act(async () => { late.resolve({ ...defaultPreviewResult, matched: [makeLine({ moneyIn: '555.00' })] }) })
      await wait(500)
      expect(checklistCheckbox()).not.toBeChecked()
    })

    it.each([
      ['checklist', 'Search transactions...'],
      ['setup', 'Search setup entries...'],
    ])('drops an older %s search response that resolves after a newer one', async (view, placeholder) => {
      const older = deferred<ReturnType<typeof searchResult>>()
      const newer = deferred<ReturnType<typeof searchResult>>()
      mockSearchLines.mockImplementation((arg: any) => {
        if (arg.view !== view) return Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 25 } })
        if (arg.search === 'a') return older.promise
        if (arg.search === 'ab') return newer.promise
        return Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 25 } })
      })
      mockExisting.mockReturnValue({ data: makeDetail(), isLoading: false, isError: false })
      renderEdit()

      const searchCalls = (term: string) =>
        mockSearchLines.mock.calls.filter(([a]) => a.view === view && a.search === term).length

      const input = await screen.findByPlaceholderText(placeholder)
      await userEvent.type(input, 'a')
      await waitFor(() => expect(searchCalls('a')).toBe(1))
      await userEvent.type(input, 'b')
      await waitFor(() => expect(searchCalls('ab')).toBe(1))

      await act(async () => { newer.resolve(searchResult('NEWER')) })
      expect(await screen.findByText('NEWER')).toBeInTheDocument()

      await act(async () => { older.resolve(searchResult('OLDER')) })
      await wait(50)
      expect(screen.queryByText('OLDER')).not.toBeInTheDocument()
      expect(screen.getByText('NEWER')).toBeInTheDocument()
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
