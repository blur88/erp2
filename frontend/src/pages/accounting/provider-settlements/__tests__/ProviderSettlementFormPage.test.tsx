import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

function renderForm(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/accounting/provider-settlements/create" element={<ProviderSettlementFormPage />} />
        <Route path="/accounting/provider-settlements/:id/edit" element={<ProviderSettlementFormPage />} />
      </Routes>
    </MemoryRouter>,
  )
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
      expect(screen.getByRole('button', { name: /^post$/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
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

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

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

    await userEvent.click(screen.getByRole('button', { name: /save/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(mockUpdate.mock.calls.at(-1)![0].body.paymentIds).toEqual(['pay-2'])
    })
  })
})
