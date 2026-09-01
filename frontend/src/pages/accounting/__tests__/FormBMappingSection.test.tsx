import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useGetFormBMappingsQuery, useUpdateFormBMappingMutation } from '@/store/api/accountingApi'
import FormBMappingSection from '../FormBMappingSection'

const { mockUpdateMapping } = vi.hoisted(() => ({
  mockUpdateMapping: vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetFormBMappingsQuery: vi.fn(),
  useUpdateFormBMappingMutation: vi.fn(() => [mockUpdateMapping, { isLoading: false }]),
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
  opts: { isError?: boolean; saveError?: any; isAdmin?: boolean } = {},
) {
  vi.mocked(useGetFormBMappingsQuery).mockReturnValue({
    data: overrideRows,
    isLoading: false,
    isError: opts.isError ?? false,
  } as any)
  vi.mocked(useUpdateFormBMappingMutation).mockReturnValue([
    mockUpdateMapping,
    { isLoading: false, isError: Boolean(opts.saveError), error: opts.saveError },
  ] as any)
  mockUpdateMapping.mockClear()
  return render(<FormBMappingSection isAdmin={opts.isAdmin ?? true} />)
}

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
})

describe('FormBMappingSection', () => {
  it('offers a category select on an eligible row', () => {
    renderSection(rows)
    expect(screen.getByTestId('formb-map-select-a1')).toBeEnabled()
  })

  // A mapped-but-ineligible row is listed PRECISELY so it can be repaired.
  it('offers clear-only on a mapped ineligible row and names the reason', () => {
    renderSection(rows)
    expect(screen.queryByTestId('formb-map-select-b1')).not.toBeInTheDocument()
    expect(screen.getByTestId('formb-map-clear-b1')).toBeEnabled()
    expect(screen.getByTestId('formb-map-row-b1')).toHaveTextContent(/DESCENDANT_OF_EXCLUDED_ROOT/i)
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
    await user.click(screen.getByTestId('formb-map-select-a1'))
    await user.click(screen.getByRole('option', { name: /salaries and wages/i }))
    expect(mockUpdateMapping).toHaveBeenCalledWith({
      accountId: 'a1',
      category: 'SALARIES_AND_WAGES',
    })
  })
})
