import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProviderSettlementFormPage from '../ProviderSettlementFormPage'

const mockEligible = vi.fn()
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
  useGetEligiblePaymentsQuery: (...a: unknown[]) => mockEligible(...a),
  useGetProviderSettlementQuery: (...a: unknown[]) => mockGetOne(...a),
  useCreateProviderSettlementMutation: () => [mockCreate, { isLoading: false }],
  useUpdateProviderSettlementMutation: () => [mockUpdate, { isLoading: false }],
  usePostProviderSettlementMutation: () => [mockPost, { isLoading: false }],
  useGetPaymentMethodMappingsQuery: () => ({
    data: [
      { paymentMethodId: 'pm-1', paymentMethodName: 'Atome', status: 'mapped' },
      // A SECOND mapped provider, so the provider-change test can actually
      // change it. Selecting the already-selected option is a no-op and would
      // make that test vacuous.
      { paymentMethodId: 'pm-2', paymentMethodName: 'Shopee', status: 'mapped' },
      { paymentMethodId: 'pm-9', paymentMethodName: 'Cash', status: 'unmapped' },
    ],
    isLoading: false,
  }),
  useGetAccountsQuery: () => ({
    // Real shape is PaginatedResponse<Account> (accountingApi.ts:107) — `data`
    // is the page object, not the array.
    data: {
      data: [{ id: 'b1', code: '1200', name: 'CIMB', isActive: true, isPostable: true }],
      meta: { total: 1 },
    },
    isLoading: false,
  }),
}))

// Two claimed lines, so the 409 test can prove that ONE is dropped and the
// other retained. Each line carries its amount, which is what the form seeds
// selection state from — the picker's total must be reconstructible from the
// draft alone, before any eligible-payments page has loaded.
const DRAFT = {
  id: 'ps-1', referenceNumber: 'PS-26-001', providerPaymentMethodId: 'pm-1',
  bankAccountId: 'b1', settlementDate: '2026-09-20', providerReference: 'ATM-1',
  settlementAmount: '148.0000', status: 'DRAFT',
  clearingAccountId: 'c1',
  clearingAccount: { id: 'c1', code: '1240', name: 'Atome' },
  lines: [
    { id: 'l1', salesOrderPaymentId: 'pay-1', amount: '98.0000', releasedAt: null },
    { id: 'l2', salesOrderPaymentId: 'pay-2', amount: '50.0000', releasedAt: null },
  ],
}

// The same two rows as eligible results, so reopening the draft renders them.
// The edit request passes settlementId, so the draft's OWN claims come back.
const ELIGIBLE = [
  { id: 'pay-1', salesOrderId: 'so-1', orderNumber: 'SO-26-001', paymentDate: '2026-09-01', amount: '98.0000', referenceNumber: 'A1' },
  { id: 'pay-2', salesOrderId: 'so-2', orderNumber: 'SO-26-002', paymentDate: '2026-09-02', amount: '50.0000', referenceNumber: 'A2' },
]

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

const saveButton = () => screen.getByRole('button', { name: /^save draft$/i })
const postButton = () => screen.getByRole('button', { name: /^post$/i })
const cancelButton = () => screen.getByRole('button', { name: /^cancel$/i })
const backButton = () => screen.getByRole('button', { name: 'Back' })

async function waitForDraftSeeded() {
  await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('2'))
}

beforeEach(() => {
  mockEligible.mockReset().mockReturnValue({
    data: { data: ELIGIBLE, meta: { total: ELIGIBLE.length, page: 1, limit: 25 } },
    isLoading: false,
  })
  mockGetOne.mockReset().mockReturnValue({ data: DRAFT, isLoading: false })
  mockCreate.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(DRAFT) })
  mockUpdate.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(DRAFT) })
  mockPost.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(DRAFT) })
  mockShowSuccess.mockReset()
  mockShowError.mockReset()
})

describe('ProviderSettlementFormPage', () => {
  it('passes its own settlementId when editing, so its claims stay selectable', async () => {
    // Without this an existing draft reopens with an EMPTY picker, because every
    // row it claims is a live claim.
    renderForm('/accounting/provider-settlements/ps-1/edit')
    await waitFor(() => {
      expect(mockEligible).toHaveBeenCalledWith(
        expect.objectContaining({ settlementId: 'ps-1' }),
      )
    })
  })

  it('omits settlementId when creating', async () => {
    renderForm('/accounting/provider-settlements/create')
    await userEvent.click(screen.getByLabelText('Provider'))
    await userEvent.click(screen.getByRole('option', { name: 'Atome' }))
    await waitFor(() => {
      const arg = mockEligible.mock.calls.at(-1)![0]
      expect(arg.settlementId).toBeUndefined()
    })
  })

  it('OMITS the draft id after a provider change, avoiding the eligibility deadlock', async () => {
    // The backend 400s on a settlementId whose provider differs from the query's.
    // Still sending the Atome draft id while querying Shopee would make the form
    // unusable: it cannot save the change first, because update needs a payment.
    renderForm('/accounting/provider-settlements/ps-1/edit')
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('2'))

    await userEvent.click(screen.getByLabelText('Provider'))
    await userEvent.click(screen.getByRole('option', { name: 'Shopee' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const arg = mockEligible.mock.calls.at(-1)![0]
      expect(arg.providerPaymentMethodId).toBe('pm-2')
      expect(arg.settlementId).toBeUndefined()
    })
  })

  it('shows the derived clearing account read-only when editing', async () => {
    renderForm('/accounting/provider-settlements/ps-1/edit')
    const field = await screen.findByLabelText('Provider Clearing Account')
    expect(field).toHaveValue('1240 Atome')
    // Derived by the backend from the payments' original postings — never
    // chosen here, or it could name an account those payments never debited.
    expect(field).toHaveAttribute('readonly')
  })

  it('leaves the clearing account blank when creating', async () => {
    renderForm('/accounting/provider-settlements/create')
    // Unknown until a draft is saved and the backend derives it.
    expect(screen.getByLabelText('Provider Clearing Account')).toHaveValue('')
  })

  it('offers only mapped payment methods as providers', async () => {
    renderForm('/accounting/provider-settlements/create')
    await userEvent.click(screen.getByLabelText('Provider'))
    expect(screen.getByRole('option', { name: 'Atome' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Cash' })).not.toBeInTheDocument()
  })

  it('seeds the selection total from the draft lines', async () => {
    renderForm('/accounting/provider-settlements/ps-1/edit')
    // 98.00 + 50.00 = 148.00, matching the draft's settlementAmount exactly.
    await waitFor(() => {
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
      expect(screen.getByTestId('selected-total')).toHaveTextContent('148.00')
      expect(screen.getByTestId('difference')).toHaveTextContent('0.00')
    })
  })

  it('disables Post while the difference is non-zero', async () => {
    // Lines still total 148.00, but the entered amount is 120.00 — a 28.00 gap.
    mockGetOne.mockReturnValue({
      data: { ...DRAFT, settlementAmount: '120.0000' }, isLoading: false,
    })
    renderForm('/accounting/provider-settlements/ps-1/edit')
    await waitFor(() => {
      expect(screen.getByTestId('difference')).toHaveTextContent('28.00')
      // A draft may be SAVED showing a difference; only posting is blocked.
      expect(postButton()).toBeDisabled()
      expect(saveButton()).toBeEnabled()
    })
  })

  it('clears the selection after confirmation when the provider CHANGES', async () => {
    renderForm('/accounting/provider-settlements/ps-1/edit')
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('2'))

    // Select a DIFFERENT provider. Re-selecting Atome would be a no-op and the
    // assertion below would pass without the clearing logic existing at all.
    await userEvent.click(screen.getByLabelText('Provider'))
    await userEvent.click(screen.getByRole('option', { name: 'Shopee' }))

    // Provider and settlement date both redefine eligibility, so the selection
    // cannot survive the change.
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /confirm/i }))
    await waitFor(() => {
      expect(screen.getByTestId('selected-count')).toHaveTextContent('0')
    })
  })

  it('keeps the still-eligible selection after a 409 and drops only the named row', async () => {
    // The 409 body nests the ids under `message`, because the global filter
    // copies `message` verbatim and discards sibling keys
    // (http-exception.filter.ts:85).
    mockUpdate.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: {
            statusCode: 409,
            message: {
              text: 'These payments were claimed by another settlement: pay-1.',
              unavailablePaymentIds: ['pay-1'],
            },
          },
        }),
    })
    renderForm('/accounting/provider-settlements/ps-1/edit')
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('2'))

    await userEvent.click(saveButton())

    await waitFor(() => {
      expect(screen.getByText(/claimed by another settlement/i)).toBeInTheDocument()
      // pay-1 dropped, pay-2 RETAINED — the whole point of returning the
      // actual conflicting ids rather than every submitted id.
      expect(screen.getByTestId('selected-count')).toHaveTextContent('1')
      expect(screen.getByTestId('selected-total')).toHaveTextContent('50.00')
      expect(screen.getByRole('checkbox', { name: /SO-26-001/ })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: /SO-26-002/ })).toBeChecked()
    })
  })

  it('submits the COMPLETE paymentIds array, not a delta', async () => {
    renderForm('/accounting/provider-settlements/ps-1/edit')
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('2'))

    await userEvent.click(saveButton())
    await waitFor(() => {
      expect(mockUpdate.mock.calls.at(-1)![0]).toEqual(
        expect.objectContaining({
          id: 'ps-1',
          body: expect.objectContaining({ paymentIds: ['pay-1', 'pay-2'] }),
        }),
      )
    })

    // Uncheck pay-1 and save again. PATCH is FULL REPLACEMENT: the request must
    // carry exactly the remaining row. A delta-shaped implementation would
    // resend both (or omit the removal) and leave pay-1 silently claimed.
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))
    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('1'))
    await userEvent.click(saveButton())
    await waitFor(() => {
      expect(mockUpdate.mock.calls.at(-1)![0].body.paymentIds).toEqual(['pay-2'])
    })
  })
})

describe('ProviderSettlementFormPage layout (#1277)', () => {
  it('uses the workflow page header and sections when creating', () => {
    renderForm(CREATE)
    expect(screen.getByRole('heading', { name: 'New Provider Settlement' })).toBeInTheDocument()
    for (const section of ['Settlement Information', 'Amount & Accounting', 'Eligible Payments']) {
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

  it('keeps every domain field available', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    for (const label of [
      'Provider', 'Settlement Date', 'Provider Reference', 'Bank Account',
      'Provider Clearing Account', 'Settlement Amount',
    ]) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0)
    }
    // Each total carries a visible label, not just a bare number.
    for (const [id, label] of [
      ['selected-count', 'Selected'], ['selected-total', 'Selected Total'],
      ['entered-amount', 'Settlement Amount'], ['difference', 'Difference'],
    ]) {
      expect(screen.getByTestId(id).previousElementSibling).toHaveTextContent(label)
    }
  })

  it('puts Cancel, Save Draft and Post in the action row, in that order', () => {
    renderForm(CREATE)
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => ['Cancel', 'Save Draft', 'Post'].includes(t ?? ''))
    expect(labels).toEqual(['Cancel', 'Save Draft', 'Post'])
    // Unchanged semantics: a new settlement cannot be posted from the form.
    expect(postButton()).toBeDisabled()
  })

  it('shows the placeholder instead of the picker until a provider is chosen', () => {
    // mockGetOne ignores `skip` and still returns DRAFT here — the cached-
    // settlement case. The create form must not seed itself from it.
    renderForm(CREATE)
    expect(screen.getByText(/select a provider/i)).toBeInTheDocument()
    expect(screen.queryByTestId('selected-count')).not.toBeInTheDocument()
  })

  it('shows a load error instead of the form when the draft cannot be loaded', () => {
    mockGetOne.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderForm(EDIT)
    expect(screen.getByText(/failed to load this settlement/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save draft$/i })).not.toBeInTheDocument()
  })
})

describe('ProviderSettlementFormPage navigation (#1277)', () => {
  it('returns to the list after creating, handing back the new draft to highlight', async () => {
    const router = renderForm(CREATE)
    await userEvent.click(screen.getByLabelText('Provider'))
    await userEvent.click(screen.getByRole('option', { name: 'Atome' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))

    await userEvent.click(saveButton())
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ highlightProviderSettlementId: 'ps-1' })
    // Leaving /create is what makes a second, duplicate draft impossible.
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('stays on the create form when the create fails', async () => {
    mockCreate.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { message: 'Bad' } }) })
    renderForm(CREATE)
    await userEvent.click(saveButton())
    await waitFor(() => expect(mockShowError).toHaveBeenCalled())
    expect(screen.queryByText('LIST PAGE')).not.toBeInTheDocument()
  })

  it('Cancel on a clean create returns to the list', async () => {
    renderForm(CREATE)
    await userEvent.click(cancelButton())
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument()
  })

  it('Cancel on a clean edit returns to the detail view', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
  })

  it('the header back arrow behaves like Cancel', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.click(backButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
  })
})

describe('ProviderSettlementFormPage unsaved changes (#1277)', () => {
  it('asks before leaving an edited draft', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')

    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()
  })

  it('counts a changed payment selection as unsaved', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))

    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
  })

  it('compares the selection as a set, so a reordered selection is clean', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    // Uncheck and re-check pay-1: the selection is now [pay-2, pay-1] — the
    // same payments in a different order. A positional compare would call
    // this dirty.
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))
    await waitForDraftSeeded()

    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('stays dirty when the save fails', async () => {
    mockUpdate.mockReturnValue({ unwrap: () => Promise.reject({ status: 500, data: { message: 'Boom' } }) })
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')
    await userEvent.click(saveButton())
    await waitFor(() => expect(mockShowError).toHaveBeenCalled())

    await userEvent.click(cancelButton())
    expect(await screen.findByText(DIALOG_MESSAGE)).toBeInTheDocument()
  })

  it('is clean again after a successful edit save, and stays on the form', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')
    await userEvent.click(saveButton())
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Provider Reference')).toHaveValue('ATM-1X')

    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('does not block the navigation after save-and-post', async () => {
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')

    await userEvent.click(postButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('ps-1')
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('leaves the saved draft clean when posting fails after the save', async () => {
    mockPost.mockReturnValue({ unwrap: () => Promise.reject({ status: 400, data: { message: 'Nope' } }) })
    renderForm(EDIT)
    await waitForDraftSeeded()
    await userEvent.type(screen.getByLabelText('Provider Reference'), 'X')

    await userEvent.click(postButton())
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Nope'))
    expect(screen.queryByText('DETAIL PAGE')).not.toBeInTheDocument()

    // The save half succeeded, so there is nothing unsaved to warn about.
    await userEvent.click(cancelButton())
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
    expect(screen.queryByText(DIALOG_MESSAGE)).not.toBeInTheDocument()
  })

  it('disables every action and labels the save while it is in flight', async () => {
    let resolve!: (v: unknown) => void
    mockUpdate.mockReturnValue({ unwrap: () => new Promise((r) => { resolve = r }) })
    renderForm(EDIT)
    await waitForDraftSeeded()

    await userEvent.click(saveButton())
    const saving = await screen.findByRole('button', { name: 'Saving...' })
    expect(saving).toBeDisabled()
    expect(cancelButton()).toBeDisabled()
    expect(postButton()).toBeDisabled()

    resolve(DRAFT)
    expect(await screen.findByRole('button', { name: /^save draft$/i })).toBeEnabled()
  })
})
