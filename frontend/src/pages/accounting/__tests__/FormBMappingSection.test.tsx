import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGetFormBMappingsQuery, useUpdateFormBMappingMutation } from '@/store/api/accountingApi'
import FormBMappingSection from '../FormBMappingSection'

const { mockUpdateMapping, mockShowSuccess } = vi.hoisted(() => ({
  mockUpdateMapping: vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
  mockShowSuccess: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetFormBMappingsQuery: vi.fn(),
  useUpdateFormBMappingMutation: vi.fn(() => [mockUpdateMapping, { isLoading: false }]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: vi.fn() }),
}))

const rows = [
  {
    accountId: 'a1',
    code: '6100',
    name: 'Salaries',
    type: 'Expense',
    isActive: true,
    category: null,
    eligibility: { eligible: true },
  },
  {
    accountId: 'i1',
    code: '6200',
    name: 'Old Rent',
    type: 'Expense',
    isActive: false,
    category: 'RENT_LEASE',
    eligibility: { eligible: false, reason: 'INACTIVE' },
  },
  {
    accountId: 'b1',
    code: '5150',
    name: 'Bad Map',
    type: 'Expense',
    isActive: true,
    category: 'COMMISSION',
    eligibility: { eligible: false, reason: 'DESCENDANT_OF_EXCLUDED_ROOT' },
  },
] as any

function renderSection(
  overrideRows: any = rows,
  opts: {
    isError?: boolean
    isLoading?: boolean
    saveError?: any
    isAdmin?: boolean
    update?: any
  } = {},
) {
  vi.mocked(useGetFormBMappingsQuery).mockReturnValue({
    data: overrideRows,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  } as any)
  vi.mocked(useUpdateFormBMappingMutation).mockReturnValue([
    opts.update ?? mockUpdateMapping,
    { isLoading: false, isError: Boolean(opts.saveError), error: opts.saveError },
  ] as any)
  return render(
    <MemoryRouter>
      <FormBMappingSection isAdmin={opts.isAdmin ?? true} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUpdateMapping.mockClear()
  mockShowSuccess.mockClear()
})

describe('FormBMappingSection — failure and permission states', () => {
  // "No mappable accounts" is what a SUCCESSFUL empty response renders, so a
  // failed load showing the same text reads as a configuration fact.
  it('shows an error instead of an empty state when the query fails', () => {
    renderSection([], { isError: true })
    expect(screen.getByTestId('formb-mapping-error')).toBeInTheDocument()
    expect(screen.queryByText(/no mappable accounts/i)).not.toBeInTheDocument()
  })

  it('surfaces a rejected save rather than silently closing the control', () => {
    renderSection(
      [{ accountId: 'a1', code: '6100', name: 'Salaries', type: 'Expense',
         isActive: true, category: null, eligibility: { eligible: true } }],
      { saveError: { data: { message: 'Account 6100 cannot be mapped: INACTIVE' } } },
    )
    expect(screen.getByTestId('formb-mapping-save-error'))
      .toHaveTextContent('Account 6100 cannot be mapped: INACTIVE')
  })

  // Writes are @Auth(UserRole.ADMIN) server-side; the UI must not invite a
  // change that can only 403.
  it('is read-only for a non-admin', () => {
    renderSection(
      [{ accountId: 'a1', code: '6100', name: 'Salaries', type: 'Expense',
         isActive: true, category: 'RENT_LEASE', eligibility: { eligible: true } }],
      { isAdmin: false },
    )
    expect(screen.getByTestId('formb-mapping-readonly')).toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-select-a1')).not.toBeInTheDocument()
    expect(screen.getByTestId('formb-map-clear-a1')).toBeDisabled()
  })

  // emptyLabel is interpolated by EntityTable as `No ${label} found`, so the
  // prop is a noun phrase. A sentence there renders "No No mappable accounts.
  // found".
  it('renders a readable empty state on a successful empty response', () => {
    renderSection([])
    expect(screen.getByText('No mappable accounts found')).toBeInTheDocument()
  })

  it('shows a skeleton while loading, not an empty state', () => {
    renderSection([], { isLoading: true })
    expect(screen.queryByText(/no mappable accounts/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-mapping-error')).not.toBeInTheDocument()
  })
})

describe('FormBMappingSection', () => {
  it('offers a category select on an eligible row', () => {
    renderSection(rows)
    expect(screen.getByTestId('formb-map-select-a1')).toBeInTheDocument()
  })

  // A mapped-but-ineligible row is listed PRECISELY so it can be repaired.
  it('offers clear-only on a mapped ineligible row', () => {
    renderSection(rows)
    expect(screen.queryByTestId('formb-map-select-b1')).not.toBeInTheDocument()
    expect(screen.getByTestId('formb-map-clear-b1')).toBeEnabled()
  })

  it('labels an inactive row and still allows clearing it', () => {
    renderSection(rows)
    expect(screen.getByTestId('formb-map-row-i1')).toHaveTextContent(/inactive/i)
    expect(screen.getByTestId('formb-map-clear-i1')).toBeEnabled()
  })

  it('sends an explicit null when clearing', async () => {
    const user = userEvent.setup()
    renderSection(rows)
    await user.click(screen.getByTestId('formb-map-clear-i1'))
    expect(mockUpdateMapping).toHaveBeenCalledWith({ accountId: 'i1', category: null })
  })

  it('sends the chosen category when assigning', async () => {
    const user = userEvent.setup()
    renderSection(rows)
    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /salaries and wages/i }))
    expect(mockUpdateMapping).toHaveBeenCalledWith({
      accountId: 'a1',
      category: 'SALARIES_AND_WAGES',
    })
  })

  it('sends null when the Unmapped option is chosen', async () => {
    const user = userEvent.setup()
    renderSection([
      { accountId: 'm1', code: '6300', name: 'Travel', type: 'Expense',
        isActive: true, category: 'TRAVEL_TRANSPORT', eligibility: { eligible: true } },
    ] as any)
    await user.click(within(screen.getByTestId('formb-map-select-m1')).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /^unmapped$/i }))
    expect(mockUpdateMapping).toHaveBeenCalledWith({ accountId: 'm1', category: null })
  })
})

describe('FormBMappingSection — explaining the rules', () => {
  // The API returns the raw discriminator; rendering it verbatim told the user
  // nothing they could act on.
  it('renders eligibility reasons as sentences, not raw enum values', () => {
    renderSection(rows)
    expect(screen.getByTestId('formb-map-row-b1')).not.toHaveTextContent(
      /DESCENDANT_OF_EXCLUDED_ROOT/,
    )
    expect(screen.getByTestId('formb-map-row-b1')).toHaveTextContent(/Cost of Sales/i)
    expect(screen.getByTestId('formb-map-row-b1')).toHaveTextContent(/N7/)
  })

  it('states the contributed span and the assignable lines separately', () => {
    renderSection(rows)
    // N3–N27 is what mappings CONTRIBUTE to; only N9–N13 and N15–N24 can be
    // chosen. Conflating the two implies every line is configurable.
    expect(screen.getByText(/N3–N27/)).toBeInTheDocument()
    expect(screen.getByText(/N9–N13/)).toBeInTheDocument()
    expect(screen.getByText(/N15–N24/)).toBeInTheDocument()
  })

  it('says Balance Sheet lines are out of scope', () => {
    renderSection(rows)
    expect(screen.getByText(/N28–N50/)).toBeInTheDocument()
  })

  it('points business identity at Company Settings', () => {
    renderSection(rows)
    const note = screen.getByTestId('formb-identity-note')
    expect(note).toHaveTextContent(/Company Settings/i)
    expect(within(note).getByRole('link', { name: /company settings/i }))
      .toHaveAttribute('href', '/settings/company')
  })

  // The report falls unmapped accounts back to N24/N13 automatically. A blank
  // cell reads as "excluded"; a cell identical to an explicit mapping reads as
  // "someone chose this". Neither is true.
  it('marks an unmapped eligible account as an automatic fallback, not a mapping', () => {
    renderSection(rows)
    const cell = screen.getByTestId('formb-map-line-a1')
    expect(cell).toHaveTextContent(/Automatic/i)
    expect(cell).toHaveTextContent(/N24/)
    expect(cell).toHaveTextContent(/No mapping saved/i)
  })

  it('distinguishes an explicit N24 mapping from the automatic fallback', () => {
    renderSection([
      { accountId: 'e1', code: '6900', name: 'Sundry', type: 'Expense',
        isActive: true, category: 'OTHER_EXPENSES', eligibility: { eligible: true } },
    ] as any)
    const cell = screen.getByTestId('formb-map-line-e1')
    expect(cell).toHaveTextContent(/N24 — Other Expenses/)
    expect(cell).not.toHaveTextContent(/Automatic/i)
    expect(cell).not.toHaveTextContent(/No mapping saved/i)
  })

  it('shows income accounts the income lines, not the expense lines', async () => {
    const user = userEvent.setup()
    renderSection([
      { accountId: 'in1', code: '4200', name: 'Interest Received', type: 'Income',
        isActive: true, category: null, eligibility: { eligible: true } },
    ] as any)
    await user.click(within(screen.getByTestId('formb-map-select-in1')).getByRole('combobox'))
    expect(screen.getByRole('option', { name: /N11 — Interest and Discounts/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Salaries and Wages/ })).not.toBeInTheDocument()
  })
})

describe('FormBMappingSection — save outcomes', () => {
  it('confirms a successful save', async () => {
    const user = userEvent.setup()
    renderSection(rows)
    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /salaries and wages/i }))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
    expect(mockShowSuccess.mock.calls[0][0]).toMatch(/6100/)
  })

  /*
   * The observable contract, not the mechanism: after a rejected write the
   * control must show the PERSISTED value again. The component holds no local
   * selection state, so this holds without relying on tag invalidation — which
   * RTK Query does not even run on a failed mutation.
   */
  it('returns the displayed selection to the persisted value when a save is rejected', async () => {
    const user = userEvent.setup()
    const rejecting = vi.fn(() => ({
      unwrap: () => Promise.reject({ data: { message: 'nope' } }),
    }))
    renderSection(
      [{ accountId: 'm1', code: '6300', name: 'Travel', type: 'Expense',
         isActive: true, category: 'TRAVEL_TRANSPORT', eligibility: { eligible: true } }] as any,
      { update: rejecting },
    )

    const select = screen.getByTestId('formb-map-select-m1')
    expect(select).toHaveTextContent(/N21 — Travel and Transportation/)

    await user.click(within(select).getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: /N20 — Bad Debts/ }))

    await waitFor(() => expect(rejecting).toHaveBeenCalled())
    // The cache never changed, so the persisted value is what renders.
    await waitFor(() =>
      expect(screen.getByTestId('formb-map-select-m1'))
        .toHaveTextContent(/N21 — Travel and Transportation/),
    )
    expect(screen.getByTestId('formb-map-select-m1')).not.toHaveTextContent(/Bad Debts/)
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})
