import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProviderSettlementFormPage from '../ProviderSettlementFormPage'

const mockEligible = vi.fn()
const mockClaimed = vi.fn()
const mockRefreshClaimed = vi.fn()
const mockRefreshEligible = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockPost = vi.fn()
const mockGetOne = vi.fn()

// Every hook the component calls must be mocked. A missing one is `undefined`
// at render time and throws before any assertion runs — the failure reads as a
// component bug, not a missing mock.
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

// The Settlement No. preview reads Document Number Settings (#1271 row).
vi.mock('@/store/api/settingsApi', () => ({
  useGetDocumentNumberSettingsQuery: () => ({
    data: {
      configurations: [
        { documentName: 'Provider Settlements', prefix: 'PS', nextNumber: 7, paddingDigits: 3 },
      ],
    },
    isLoading: false,
  }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetEligibleSettlementRowsQuery: (...a: unknown[]) => mockEligible(...a),
  useGetClaimedSettlementRowsQuery: (...a: unknown[]) => mockClaimed(...a),
  useLazyGetClaimedSettlementRowsQuery: () => [mockRefreshClaimed],
  useLazyGetEligibleSettlementRowsQuery: () => [mockRefreshEligible],
  useGetProviderSettlementQuery: (...a: unknown[]) => mockGetOne(...a),
  useCreateProviderSettlementMutation: () => [mockCreate, { isLoading: false }],
  useUpdateProviderSettlementMutation: () => [mockUpdate, { isLoading: false }],
  usePostProviderSettlementMutation: () => [mockPost, { isLoading: false }],
  useGetAccountsQuery: () => ({
    // Real shape is PaginatedResponse<Account> (accountingApi.ts:107) — `data`
    // is the page object, not the array.
    data: {
      data: [
        { id: 'b1', code: '1200', name: 'CIMB', isActive: true, isPostable: true, isProviderClearing: false },
        { id: 'b2', code: '1220', name: 'Shopee', isActive: true, isPostable: true, isProviderClearing: true },
      ],
      meta: { total: 2 },
    },
    isLoading: false,
  }),
}))

const DRAFT = {
  id: 'ps-1', referenceNumber: 'PS-26-001',
  bankAccountId: 'b1', settlementDate: '2026-09-20', providerReference: 'ATM-1',
  settlementAmount: '148.0000', status: 'DRAFT',
  clearingAccountId: 'c1',
  clearingAccount: { id: 'c1', code: '1240', name: 'Atome' },
}

// Grouped eligible rows: one row per Sales Order + Payment Method pair.
const ELIGIBLE = [
  { salesOrderId: 'so-8', orderNumber: 'SO-26-008', paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok', netAmount: '70.0000', payments: [] },
  { salesOrderId: 'so-2', orderNumber: 'SO-26-002', paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok', netAmount: '50.0000', payments: [] },
  { salesOrderId: 'so-5', orderNumber: 'SO-26-005', paymentMethodId: 'pm-at', paymentMethodName: 'Atome', netAmount: '20.0000', payments: [] },
]

// Minimum edit fixture: one claimed group whose current net matches the
// amount the draft was saved with, so the seeded form reads clean.
const CLAIMED_CURRENT = {
  salesOrderId: 'so-8', orderNumber: 'SO-26-008', paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok',
  savedNetAmount: '100.0000', currentNetAmount: '100.0000',
  savedPayments: [{ id: 'p1', paymentDate: '2026-09-01', amount: '100.0000', referenceNumber: null }],
  currentPayments: [{ id: 'p1', paymentDate: '2026-09-01', amount: '100.0000', referenceNumber: null }],
  state: 'current',
}
const CLAIMED_REFUNDED = {
  ...CLAIMED_CURRENT, salesOrderId: 'so-2', orderNumber: 'SO-26-002',
  currentNetAmount: '70.0000', state: 'changed',
  currentPayments: [...CLAIMED_CURRENT.currentPayments, { id: 'r1', paymentDate: '2026-09-02', amount: '-30.0000', referenceNumber: null }],
}
const CLAIMED_ZERO = { ...CLAIMED_CURRENT, salesOrderId: 'so-3', orderNumber: 'SO-26-003', currentNetAmount: '0.0000', state: 'zero' }
const CLAIMED_SWAPPED = { // same net, different membership
  ...CLAIMED_CURRENT, salesOrderId: 'so-4', orderNumber: 'SO-26-004', state: 'changed',
  currentPayments: [{ id: 'p9', paymentDate: '2026-09-01', amount: '100.0000', referenceNumber: null }],
}

/**
 * A DATA router: the unsaved-changes guard uses useBlocker, which throws under
 * a plain MemoryRouter. The list and detail routes are plain markers — their
 * presence proves navigation actually completed, and the returned router
 * exposes the history entry's state.
 */
function renderForm(route: string) {
  const router = createMemoryRouter(
    [
      { path: '/accounting/provider-settlements', element: <div>LIST PAGE</div> },
      { path: '/accounting/provider-settlements/create', element: <ProviderSettlementFormPage /> },
      { path: '/accounting/provider-settlements/:id/edit', element: <ProviderSettlementFormPage /> },
      { path: '/accounting/provider-settlements/:id/view', element: <div>DETAIL PAGE</div> },
    ],
    { initialEntries: [route] },
  )
  render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <RouterProvider router={router} />
    </LocalizationProvider>,
  )
  return router
}

const EDIT = '/accounting/provider-settlements/ps-1/edit'
const CREATE = '/accounting/provider-settlements/create'
const DIALOG_MESSAGE = /You have unsaved changes/

const createButton = () => screen.getByRole('button', { name: /^create settlement$/i })
const saveButton = () => screen.getByRole('button', { name: /^save settlement$/i })
const cancelButton = () => screen.getByRole('button', { name: /^cancel$/i })
const backButton = () => screen.getByRole('button', { name: 'Back' })

const amountField = () => screen.getByLabelText('Amount Received in Bank')
const tick = (label: RegExp) => userEvent.click(screen.getByRole('checkbox', { name: label }))

/** Opens the Bank Account combobox and leaves its portaled listbox visible. */
async function openBankAccountSelect() {
  await userEvent.click(screen.getByRole('combobox', { name: 'Bank Account' }))
  await screen.findByRole('option', { name: '1200 CIMB' })
}

/** MUI `TextField select` renders a combobox; its options live in a portaled listbox. */
async function chooseBank() {
  await openBankAccountSelect()
  await userEvent.click(screen.getByRole('option', { name: '1200 CIMB' }))
}

/** One claimed current group at RM100.00, matching the draft amount. */
function seedEdit() {
  mockClaimed.mockReturnValue({ data: { data: [CLAIMED_CURRENT] }, isLoading: false })
  mockGetOne.mockReturnValue({ data: { ...DRAFT, settlementAmount: '100.0000' }, isLoading: false })
}

async function waitForEditSeeded(count = '1') {
  await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent(count))
}

/** The action row's own buttons, in order — scoped so picker/header buttons don't count. */
const actionRowLabels = () =>
  within(cancelButton().parentElement!).getAllByRole('button').map((b) => b.textContent)

async function dismissUnsavedChangesDialog() {
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: /keep editing/i }))
  // The modal stays mounted through its exit transition with the rest of the
  // page aria-hidden; wait for the content to be gone before querying again.
  await waitFor(() => expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument())
}

beforeEach(() => {
  mockEligible.mockReset().mockReturnValue({
    data: { data: ELIGIBLE, meta: { total: ELIGIBLE.length, page: 1, limit: 25 } },
    isLoading: false,
  })
  mockClaimed.mockReset().mockReturnValue({ data: { data: [] }, isLoading: false })
  mockRefreshClaimed.mockReset()
  mockRefreshEligible.mockReset()
  mockGetOne.mockReset().mockReturnValue({ data: DRAFT, isLoading: false })
  mockCreate.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(DRAFT) })
  mockUpdate.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(DRAFT) })
  mockPost.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(DRAFT) })
  mockShowSuccess.mockReset()
  mockShowError.mockReset()
})

describe('ProviderSettlementFormPage', () => {
  it('passes its own settlementId to the row picker when editing, so its claims stay selectable', async () => {
    // Without this an existing draft reopens with an EMPTY picker, because every
    // row it claims is a live claim.
    renderForm(EDIT)
    await waitFor(() => {
      expect(mockEligible).toHaveBeenCalledWith(
        expect.objectContaining({ settlementId: 'ps-1' }),
        expect.anything(),
      )
    })
  })

  it('shows the derived clearing account read-only when editing', async () => {
    renderForm(EDIT)
    const field = await screen.findByLabelText('Provider Clearing Account')
    expect(field).toHaveValue('1240 Atome')
    // Derived by the backend from the payments' original postings — never
    // chosen here, or it could name an account those payments never debited.
    expect(field).toHaveAttribute('readonly')
  })

  it('leaves the clearing account blank when creating', () => {
    renderForm(CREATE)
    // Unknown until a draft is saved and the backend derives it.
    expect(screen.getByLabelText('Provider Clearing Account')).toHaveValue('')
  })
})

describe('ProviderSettlementFormPage destination bank eligibility (#1285)', () => {
  it('does not offer a provider clearing account as the destination bank', async () => {
    renderForm(CREATE)
    await openBankAccountSelect()
    expect(screen.queryByRole('option', { name: /1220/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /1200/ })).toBeInTheDocument()
  })
})

describe('ProviderSettlementFormPage layout (#1277)', () => {
  it('uses the workflow page header and sections when creating', () => {
    renderForm(CREATE)
    expect(screen.getByRole('heading', { name: 'New Provider Settlement' })).toBeInTheDocument()
    for (const section of ['Settlement Information', 'Amount & Accounting', 'Sales Order Payments']) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument()
    }
    expect(backButton()).toBeInTheDocument()
  })

  it('previews the next Settlement No. from Document Number Settings when creating', () => {
    renderForm(CREATE)
    const field = screen.getByLabelText('Settlement No.')
    expect(field).toHaveValue(`PS-${String(new Date().getFullYear() % 100).padStart(2, '0')}-007`)
    expect(field).toBeDisabled()
  })

  it('names the draft in the header and shows its saved number when editing', async () => {
    renderForm(EDIT)
    expect(await screen.findByRole('heading', { name: 'Edit Provider Settlement' })).toBeInTheDocument()
    expect(screen.getByText('Editing PS-26-001')).toBeInTheDocument()
    expect(screen.getByLabelText('Settlement No.')).toHaveValue('PS-26-001')
  })

  it('keeps every domain field available', () => {
    renderForm(CREATE)
    for (const label of [
      'Payment Method', 'Settlement Date', 'Provider Reference', 'Bank Account',
      'Provider Clearing Account', 'Amount Received in Bank',
    ]) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0)
    }
    // Each total carries a visible label, not just a bare number.
    for (const [id, label] of [
      ['selected-count', 'Selected'], ['selected-total', 'Selected Total'],
      ['entered-amount', 'Amount Received in Bank'], ['difference', 'Difference'],
    ]) {
      expect(screen.getByTestId(id).previousElementSibling).toHaveTextContent(label)
    }
  })

  it('shows only Cancel and Create Settlement when creating (#1281)', async () => {
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await userEvent.type(amountField(), '70')
    expect(actionRowLabels()).toEqual(['Cancel', 'Create Settlement'])
    expect(createButton()).toBeEnabled()
    expect(cancelButton()).toBeEnabled()
    // Posting lives in the list row menu, behind its confirmation.
    expect(screen.queryByRole('button', { name: /^post$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save draft$/i })).not.toBeInTheDocument()
  })

  it('shows only Cancel and Save Settlement when editing (#1281)', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    expect(actionRowLabels()).toEqual(['Cancel', 'Save Settlement'])
    expect(saveButton()).toBeEnabled()
    // The seeded draft's totals match, which is exactly when the old form
    // offered save-and-post. There is no post action here any more.
    expect(screen.queryByRole('button', { name: /^post$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save draft$/i })).not.toBeInTheDocument()
  })

  it('shows a load error instead of the form when the draft cannot be loaded', () => {
    mockGetOne.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderForm(EDIT)
    expect(screen.getByText(/failed to load this settlement/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save settlement$/i })).not.toBeInTheDocument()
  })

  it('shows a load error instead of the form when the claimed rows cannot be loaded', () => {
    mockClaimed.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderForm(EDIT)
    expect(screen.getByText(/failed to load this settlement/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save settlement$/i })).not.toBeInTheDocument()
  })
})

describe('ProviderSettlementFormPage navigation (#1277)', () => {
  it('returns to the list after creating, handing back the new draft to highlight', async () => {
    const router = renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await chooseBank()
    await userEvent.type(amountField(), '70')

    await userEvent.click(createButton())
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ highlightProviderSettlementId: 'ps-1' })
    // Leaving /create is what makes a second, duplicate draft impossible.
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('stays on the create form when the create fails', async () => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { message: 'Bad' } }) })
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await userEvent.type(amountField(), '70')
    await userEvent.click(createButton())
    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument()
  })

  it('Cancel on a clean create returns to the list', async () => {
    renderForm(CREATE)
    await userEvent.click(cancelButton())
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
  })

  it('Cancel on a clean edit returns to the detail view', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
  })

  it('the header back arrow behaves like Cancel', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    await userEvent.click(backButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
  })
})

describe('ProviderSettlementFormPage unsaved changes (#1277)', () => {
  it('asks before leaving an edited draft', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')

    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()
  })

  it('counts a changed payment selection as unsaved', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    await tick(/SO-26-005 Atome/)

    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
  })

  it('compares the selection as a set, so a reordered selection is clean', async () => {
    // Two claimed current groups whose nets match the eligible rows exactly, so
    // unticking and re-ticking one re-adds the same amount.
    mockClaimed.mockReturnValue({ data: { data: [
      { ...CLAIMED_CURRENT, currentNetAmount: '70.0000', savedNetAmount: '70.0000' },
      { ...CLAIMED_CURRENT, salesOrderId: 'so-2', orderNumber: 'SO-26-002', currentNetAmount: '50.0000', savedNetAmount: '50.0000' },
    ] }, isLoading: false })
    renderForm(EDIT)
    await waitForEditSeeded('2')
    // Uncheck and re-check SO-26-008: the selection is now [SO-26-002, SO-26-008]
    // — the same rows with the same nets in a different order. A positional
    // compare would call this dirty.
    await tick(/SO-26-008 TikTok/)
    await tick(/SO-26-008 TikTok/)
    await waitForEditSeeded('2')

    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('stays dirty when the save fails', async () => {
    seedEdit()
    mockUpdate.mockReturnValue({ unwrap: () => Promise.reject({ status: 500, data: { message: 'Boom' } }) })
    renderForm(EDIT)
    await waitForEditSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')
    await userEvent.click(saveButton())
    await waitFor(() => expect(mockShowError).toHaveBeenCalled())

    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
  })

  it('is clean again after a successful edit save, and stays on the form', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')
    await userEvent.click(saveButton())
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Provider Reference')).toHaveValue('ATM-1X')

    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('saves an edited draft without posting it, even when its totals match', async () => {
    seedEdit()
    renderForm(EDIT)
    await waitForEditSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')

    await userEvent.click(saveButton())
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    expect(mockPost).not.toHaveBeenCalled()
    expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()
  })

  it('disables every action and labels the save while it is in flight', async () => {
    let resolve!: (v: unknown) => void
    seedEdit()
    mockUpdate.mockReturnValue({ unwrap: () => new Promise((r) => { resolve = r }) })
    renderForm(EDIT)
    await waitForEditSeeded()

    await userEvent.click(saveButton())
    const saving = await screen.findByRole('button', { name: 'Saving...' })
    expect(saving).toBeDisabled()
    expect(cancelButton()).toBeDisabled()
    expect(actionRowLabels()).toEqual(['Cancel', 'Saving...'])

    resolve(DRAFT)
    expect(await screen.findByRole('button', { name: /^save settlement$/i })).toBeEnabled()
  })

  it('disables every action and labels the create while it is in flight', async () => {
    let resolve!: (v: unknown) => void
    mockCreate.mockReturnValue({ unwrap: () => new Promise((r) => { resolve = r }) })
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await userEvent.type(amountField(), '70')

    await userEvent.click(createButton())
    const creating = await screen.findByRole('button', { name: 'Creating...' })
    expect(creating).toBeDisabled()
    expect(cancelButton()).toBeDisabled()
    expect(actionRowLabels()).toEqual(['Cancel', 'Creating...'])

    resolve(DRAFT)
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
  })
})

describe('ProviderSettlementFormPage create flow (#1284)', () => {
  it('create: has no Provider, Fees or From/To fields; Settlement Date is the only date', () => {
    renderForm(CREATE)
    expect(screen.queryByLabelText(/^Provider$/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/fee/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/from|to date|period/i)).not.toBeInTheDocument()
    // The DatePicker's open button carries an aria-label ("Choose date, …")
    // that also matches /date/i; only the field itself is a form input.
    const dateFields = screen.getAllByLabelText(/date/i).filter((el) => el.tagName === 'INPUT')
    expect(dateFields).toHaveLength(1)
  })

  it('create: lists rows immediately, without choosing a provider', () => {
    renderForm(CREATE)
    expect(screen.getByText('SO-26-008')).toBeInTheDocument()
  })

  it('create: shows the inferred Payment Method read-only', async () => {
    renderForm(CREATE)
    expect(screen.getByLabelText('Payment Method')).toHaveValue('—')
    await tick(/SO-26-008 TikTok/)
    expect(screen.getByLabelText('Payment Method')).toHaveValue('TikTok')
  })

  it('create: SO-26-008 creates with exactly the TikTok row at a 2-dp expected net', async () => {
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await chooseBank()
    await userEvent.type(amountField(), '70')
    await userEvent.click(createButton())
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      rows: [{ salesOrderId: 'so-8', paymentMethodId: 'pm-tt', expectedNetAmount: '70.00' }],
    }))
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('paymentIds')
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('providerPaymentMethodId')
  })

  it('create: submits "-30.0000" as "-30.00"', async () => {
    mockEligible.mockReturnValue({ data: { data: [
      { ...ELIGIBLE[0], netAmount: '100.0000' },
      { ...ELIGIBLE[1], netAmount: '-30.0000' },
      { ...ELIGIBLE[2], paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok', netAmount: '0.0050' },
    ], meta: { total: 3, page: 1, limit: 25 } } })
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await tick(/SO-26-002 TikTok/)
    await chooseBank()
    await userEvent.type(amountField(), '70')
    await userEvent.click(createButton())
    expect(mockCreate.mock.calls[0][0].rows).toContainEqual({ salesOrderId: 'so-2', paymentMethodId: 'pm-tt', expectedNetAmount: '-30.00' })
  })

  it('create: blocks a sub-cent row', async () => {
    mockEligible.mockReturnValue({ data: { data: [
      { ...ELIGIBLE[0] },
      { ...ELIGIBLE[2], paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok', netAmount: '0.0050' },
    ], meta: { total: 2, page: 1, limit: 25 } } })
    renderForm(CREATE)
    await tick(/SO-26-005 TikTok/)
    expect(screen.getByText(/Sub-cent amount — cannot be settled/)).toBeInTheDocument()
    expect(createButton()).toBeDisabled()
  })

  it.each([
    ['69.99', /Amount received must equal the selected total/],
    ['70.01', /Amount received must equal the selected total/],
  ])('create: blocks create when the amount is %s', async (typed, reason) => {
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await userEvent.type(amountField(), typed)
    expect(createButton()).toBeDisabled()
    expect(screen.getByText(reason)).toBeInTheDocument()
  })

  it('create: treats 70 and 70.00 as equal', async () => {
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await userEvent.type(amountField(), '70.00')
    expect(createButton()).toBeEnabled()
  })

  it('create: rejects a formatted amount', async () => {
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await userEvent.type(amountField(), '1,000.00')
    expect(screen.getByTestId('difference')).toHaveTextContent('—')
    expect(screen.getByText(/Enter a valid amount received/)).toBeInTheDocument()
    expect(createButton()).toBeDisabled()
  })

  it('create: blocks a total that is not positive', async () => {
    mockEligible.mockReturnValue({ data: { data: [{ ...ELIGIBLE[0], netAmount: '-30.0000' }], meta: { total: 1, page: 1, limit: 25 } } })
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    expect(screen.getByText(/greater than zero/)).toBeInTheDocument()
    expect(createButton()).toBeDisabled()
  })

  it('create: blocks mixed methods', async () => {
    renderForm(CREATE)
    await tick(/SO-26-008 TikTok/)
    await tick(/SO-26-005 Atome/)
    await userEvent.type(amountField(), '90')
    expect(createButton()).toBeDisabled()
    // The picker's own warning carries the same sentence, so target the form's
    // block reason rather than the bare text.
    expect(screen.getByTestId('save-block-reason')).toHaveTextContent(
      /separate settlement for each Payment Method/,
    )
  })
})

describe('edit flow (#1284)', () => {
  beforeEach(() => {
    mockClaimed.mockReset().mockReturnValue({ data: { data: [CLAIMED_CURRENT, CLAIMED_REFUNDED, CLAIMED_ZERO, CLAIMED_SWAPPED] }, isLoading: false })
    mockGetOne.mockReturnValue({ data: { ...DRAFT, settlementAmount: '100.0000' }, isLoading: false })
  })

  it('seeds current groups and lists the others under Needs attention with reasons', async () => {
    renderForm(EDIT)
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('1'))
    const block = screen.getByTestId('needs-attention')
    expect(within(block).getByText(/SO-26-002 · TikTok — saved RM\s?100\.00, now RM\s?70\.00\. Refund added/)).toBeInTheDocument()
    expect(within(block).getByText(/SO-26-003 · TikTok — now RM0\.00 — remove/)).toBeInTheDocument()
    expect(within(block).getByText(/SO-26-004 · TikTok — saved RM\s?100\.00, now RM\s?100\.00\. Payments changed/)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('offers only Remove on a zero group', () => {
    renderForm(EDIT)
    const zero = screen.getByText(/SO-26-003/).closest('[data-testid="attention-row"]')! as HTMLElement
    expect(within(zero).queryByRole('button', { name: /accept current/i })).not.toBeInTheDocument()
    expect(within(zero).getByRole('button', { name: /remove/i })).toBeInTheDocument()
  })

  it('Remove marks the form dirty; Accept moves the group into the selection at the current net', async () => {
    renderForm(EDIT)
    await userEvent.click(within(screen.getByText(/SO-26-003/).closest('[data-testid="attention-row"]') as HTMLElement).getByRole('button', { name: /remove/i }))
    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
    await dismissUnsavedChangesDialog()
    // MUI v9 leaves the app root aria-hidden after the modal exits in jsdom, so
    // role queries need `hidden: true` until the next real render.
    await userEvent.click(within(screen.getByText(/SO-26-002/, { selector: '[data-testid="attention-row"] *' }).closest('[data-testid="attention-row"]') as HTMLElement).getByRole('button', { name: /accept current/i, hidden: true }))
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
    expect(screen.getByTestId('selected-total')).toHaveTextContent('170.00')
  })

  it('saves only after every attention group is resolved, submitting the accepted net', async () => {
    renderForm(EDIT)
    for (const so of [/SO-26-003/, /SO-26-004/]) {
      await userEvent.click(within(screen.getByText(so).closest('[data-testid="attention-row"]') as HTMLElement).getByRole('button', { name: /remove/i }))
    }
    await userEvent.click(within(screen.getByText(/SO-26-002/, { selector: '[data-testid="attention-row"] *' }).closest('[data-testid="attention-row"]') as HTMLElement).getByRole('button', { name: /accept current/i }))
    await userEvent.clear(screen.getByLabelText('Amount Received in Bank'))
    await userEvent.type(screen.getByLabelText('Amount Received in Bank'), '170')
    expect(saveButton()).toBeEnabled()
    await userEvent.click(saveButton())
    expect(mockUpdate.mock.calls[0][0].body.rows).toEqual(expect.arrayContaining([
      { salesOrderId: 'so-8', paymentMethodId: 'pm-tt', expectedNetAmount: '100.00' },
      { salesOrderId: 'so-2', paymentMethodId: 'pm-tt', expectedNetAmount: '70.00' },
    ]))
  })

  it('a refetch of the claimed rows does not erase unsaved work', async () => {
    renderForm(EDIT)
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('1'))
    // Unsaved work: a form field, an unrelated selection, and a resolved attention row.
    await userEvent.type(screen.getByLabelText('Provider Reference'), '-dirty')
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-005 Atome/ }))
    await userEvent.click(within(screen.getByText(/SO-26-003/).closest('[data-testid="attention-row"]') as HTMLElement).getByRole('button', { name: /remove/i }))

    // The query now returns a NEW object (as after a lazy refetch or tag
    // invalidation), with different content; any re-render delivers it.
    mockClaimed.mockReturnValue({ data: { data: [{ ...CLAIMED_CURRENT, currentNetAmount: '1.0000', state: 'changed' }] }, isLoading: false })
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'x')

    expect(screen.getByLabelText('Provider Reference')).toHaveValue('ATM-1-dirtyx')
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
    expect(screen.queryByText(/SO-26-003/, { selector: '[data-testid="attention-row"] *' })).not.toBeInTheDocument()
    expect(screen.getByText(/SO-26-002/, { selector: '[data-testid="attention-row"] *' })).toBeInTheDocument()
  })

  describe('non-provider-clearing rows (#1285)', () => {
    const NOT_PROVIDER_CLEARING = {
      ...CLAIMED_CURRENT,
      salesOrderId: 'so-1',
      orderNumber: 'SO-1',
      paymentMethodName: 'CIMB',
      currentNetAmount: '40.0000',
      state: 'not_provider_clearing',
    }

    it('shows a not_provider_clearing group as Remove-only needs attention and blocks save until removed', async () => {
      mockClaimed.mockReturnValue({ data: { data: [NOT_PROVIDER_CLEARING] }, isLoading: false })
      renderForm(EDIT)
      const row = await screen.findByTestId('attention-row')
      expect(row).toHaveTextContent('SO-1 · CIMB — not a provider clearing payment — remove')
      expect(within(row).queryByRole('button', { name: 'Accept current' })).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
      expect(saveButton()).toBeDisabled()
      expect(screen.getByTestId('save-block-reason')).toHaveTextContent(
        /Resolve the rows that need attention/,
      )
    })

    it('shows the server provider-clearing 400 verbatim when an account is unflagged mid-edit', async () => {
      const text = 'Account 1240 Atome is not a provider clearing account. Only payments recorded to a provider clearing account can be settled.'
      mockUpdate.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { message: text } }) })
      seedEdit()
      renderForm(EDIT)
      await waitForEditSeeded()
      await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')
      await userEvent.click(saveButton())
      expect(await screen.findByText(text)).toBeInTheDocument()
    })
  })

  describe('409 staleRows refresh', () => {
    const stale = (rows: unknown[]) => ({
      unwrap: () => Promise.reject({ status: 409, data: { message: { text: 'Some rows changed since they were loaded. Review them and save again.', staleRows: rows } } }),
    })

    it('create: moves only the stale row, keeps others, refreshes via salesOrderIds, then enables Accept', async () => {
      mockCreate.mockReturnValue(stale([{ salesOrderId: 'so-8', paymentMethodId: 'pm-tt', currentNetAmount: '60.0000' }]))
      let resolveRefresh!: (v: unknown) => void
      mockRefreshEligible.mockReturnValue({ unwrap: () => new Promise((r) => { resolveRefresh = r }) })
      renderForm(CREATE)
      await tick(/SO-26-008 TikTok/)
      await tick(/SO-26-002 TikTok/)
      await chooseBank()
      await userEvent.type(amountField(), '120')
      await userEvent.click(createButton())

      expect(await screen.findByText(/Some rows changed/)).toBeInTheDocument()
      expect(screen.getByTestId('selected-count')).toHaveTextContent('1') // SO-26-002 kept
      expect(mockRefreshEligible).toHaveBeenCalledWith(expect.objectContaining({ salesOrderIds: ['so-8'], settlementDate: expect.any(String) }))
      expect(mockRefreshEligible.mock.calls[0][0]).not.toHaveProperty('settlementId')

      const row = screen.getByText(/SO-26-008/, { selector: '[data-testid="attention-row"] *' }).closest('[data-testid="attention-row"]') as HTMLElement
      expect(within(row).getByRole('button', { name: /accept current/i })).toBeDisabled()
      resolveRefresh({ data: [{ ...ELIGIBLE[0], netAmount: '60.0000' }], meta: { total: 1, page: 1, limit: 1 } })
      await waitFor(() => expect(within(row).getByRole('button', { name: /accept current/i })).toBeEnabled())
    })

    it('edit: a group selected since the last save refreshes via salesOrderIds + settlementId', async () => {
      mockClaimed.mockReturnValue({ data: { data: [CLAIMED_CURRENT] }, isLoading: false })
      mockUpdate.mockReturnValue(stale([{ salesOrderId: 'so-2', paymentMethodId: 'pm-tt', currentNetAmount: '40.0000' }]))
      mockRefreshEligible.mockReturnValue({ unwrap: () => Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 0 } }) })
      renderForm(EDIT)
      await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('1'))
      await tick(/SO-26-002 TikTok/)
      await userEvent.clear(screen.getByLabelText('Amount Received in Bank'))
      await userEvent.type(screen.getByLabelText('Amount Received in Bank'), '150')
      await userEvent.click(saveButton())
      await waitFor(() => expect(mockRefreshEligible).toHaveBeenCalled())
      expect(mockRefreshEligible.mock.calls[0][0]).toMatchObject({ salesOrderIds: ['so-2'], settlementId: 'ps-1' })
      expect(mockRefreshClaimed).not.toHaveBeenCalled()
      // absent from the refresh ⇒ Remove only
      const row = screen.getByText(/SO-26-002/, { selector: '[data-testid="attention-row"] *' }).closest('[data-testid="attention-row"]') as HTMLElement
      expect(within(row).queryByRole('button', { name: /accept current/i })).not.toBeInTheDocument()
    })

    it('edit: a draft-claimed stale group refreshes via scope=claimed', async () => {
      mockClaimed.mockReturnValue({ data: { data: [CLAIMED_CURRENT] }, isLoading: false })
      mockUpdate.mockReturnValue(stale([{ salesOrderId: 'so-8', paymentMethodId: 'pm-tt', currentNetAmount: '90.0000' }]))
      mockRefreshClaimed.mockReturnValue({ unwrap: () => Promise.resolve({ data: [{ ...CLAIMED_CURRENT, currentNetAmount: '90.0000', state: 'changed' }] }) })
      renderForm(EDIT)
      await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('1'))
      await userEvent.type(screen.getByLabelText('Provider Reference'), 'x')
      await userEvent.click(saveButton())
      await waitFor(() => expect(mockRefreshClaimed).toHaveBeenCalledWith({ settlementId: 'ps-1', settlementDate: '2026-09-20' }))
      expect(mockRefreshEligible).not.toHaveBeenCalled()
      // The refresh merged into the affected group only; unsaved work survives.
      mockClaimed.mockReturnValue({ data: { data: [{ ...CLAIMED_CURRENT, currentNetAmount: '90.0000', state: 'changed' }] }, isLoading: false })
      await userEvent.type(screen.getByLabelText('Provider Reference'), 'y')
      expect(screen.getByLabelText('Provider Reference')).toHaveValue('ATM-1xy')
    })
  })
})
