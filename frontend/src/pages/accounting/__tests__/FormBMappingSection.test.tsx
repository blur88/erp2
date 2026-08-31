import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useGetFormBMappingsQuery } from '@/store/api/accountingApi'
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

function renderSection(overrideRows: any = rows) {
  vi.mocked(useGetFormBMappingsQuery).mockReturnValue({
    data: overrideRows,
    isLoading: false,
    isError: false,
  } as any)
  mockUpdateMapping.mockClear()
  return render(<FormBMappingSection />)
}

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
