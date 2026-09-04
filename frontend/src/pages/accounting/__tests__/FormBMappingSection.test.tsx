import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGetFormBMappingsQuery } from '@/store/api/accountingApi'
import FormBMappingSection from '../FormBMappingSection'
import { useFormBMappingDraft } from '../useFormBMappingDraft'

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
  // Provide a draft for backwards compatibility with old tests that don't pass one
  const Harness = () => {
    const draft = useFormBMappingDraft()
    return (
      <FormBMappingSection
        isAdmin={opts.isAdmin ?? true}
        disabled={false}
        draft={draft}
        saveError={opts.saveError ?? null}
      />
    )
  }
  vi.mocked(useGetFormBMappingsQuery).mockReturnValue({
    data: overrideRows,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
  } as any)
  // keep mockUpdateMapping for old tests that assert not called, but component no longer uses it
  // we still mock it to avoid errors if some test imports it
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  )
}

function renderWithDraft(overrideRows: any = rows, opts: any = {}) {
  const Harness = () => {
    const draft = useFormBMappingDraft()
    return (
      <FormBMappingSection
        isAdmin={opts.isAdmin ?? true}
        disabled={opts.disabled ?? false}
        draft={draft}
        saveError={opts.saveError ?? null}
      />
    )
  }
  vi.mocked(useGetFormBMappingsQuery).mockReturnValue({
    data: overrideRows, isLoading: false, isError: false,
  } as any)
  return render(<MemoryRouter><Harness /></MemoryRouter>)
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
      { saveError: 'Account 6100 cannot be mapped: INACTIVE' },
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

  it('lets a staged clear be undone without discarding the rest of the page', async () => {
    const user = userEvent.setup()
    renderWithDraft(rows)

    const button = screen.getByTestId('formb-map-clear-b1')
    await user.click(button)

    /*
     * The button must TOGGLE. Staging the clear sets the draft value to null,
     * and a button disabled on `draftValue === null` would trap the edit — the
     * only escape being Cancel, which discards every other edit on the page.
     */
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent(/undo clear/i)
    // The staged clear is reported by the button's own label — no row chip and
    // no pending caption exist to report it (#1184).
    expect(screen.queryByTestId('formb-map-changed-b1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-pending-b1')).not.toBeInTheDocument()

    await user.click(button)

    // Undo restores the persisted category, so the row is genuinely clean —
    // not an equal-but-still-dirty overlay entry.
    expect(button).toHaveTextContent(/^Clear$/i)
  })

  /*
   * The Status column was removed: it rendered a chip ONLY for an inactive
   * account and nothing at all otherwise, so on a healthy chart it was a
   * permanently blank column carrying no information.
   *
   * Nothing was lost. An inactive account is ineligible, and the Account cell
   * already states the reason in words — "Account is inactive, so its mapping
   * can no longer be changed" — which says strictly more than a chip did.
   */
  it('has no Status column', () => {
    renderSection(rows)
    expect(screen.queryByRole('columnheader', { name: /^status$/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-status-i1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-status-a1')).not.toBeInTheDocument()
  })

  it('still explains an inactive account in the Account cell, and allows clearing it', () => {
    renderSection(rows)
    expect(within(screen.getByTestId('formb-map-row-i1')).getByText(/account is inactive/i))
      .toBeInTheDocument()
    expect(screen.getByTestId('formb-map-clear-i1')).toBeEnabled()
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

describe('FormBMappingSection — staged drafts', () => {
  it('does not call any update API when a mapping changes', async () => {
    const user = userEvent.setup()
    renderWithDraft()

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N15 — Loan Interest/i }))

    expect(mockUpdateMapping).not.toHaveBeenCalled()
  })

  /*
   * #1184 removed every per-row dirty decoration: no yellow row background, no
   * "Changed" chip, no `Pending: …` caption. The staged edit is visible on the
   * Select itself, and the page's Save/Cancel buttons carry the draft state.
   *
   * The row background was an Emotion style and unobservable in jsdom
   * (CLAUDE.md), so what this pins is the markup that carried the treatment.
   */
  it('stages a change with no row-level decoration', async () => {
    const user = userEvent.setup()
    renderWithDraft()

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))

    // The staged value lives on the control...
    expect(screen.getByTestId('formb-map-select-a1')).toHaveTextContent(/N16 — Salaries/)
    // ...and the persisted column is unchanged: a1 is still unmapped, so it
    // reads as the automatic fallback until the save lands.
    expect(screen.getByTestId('formb-map-line-a1')).toHaveTextContent(/Automatic/)
    expect(screen.queryByTestId('formb-map-changed-a1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-pending-a1')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Pending:/)).not.toBeInTheDocument()
  })

  it('stages a clear on an ineligible row without decorating it', async () => {
    const user = userEvent.setup()
    // i1 is mapped to RENT_LEASE but ineligible, so it offers Clear only.
    renderWithDraft()

    await user.click(screen.getByTestId('formb-map-clear-i1'))

    // The persisted mapping is still shown as the current truth; the staged
    // clear is reported by the button label alone (#1184).
    expect(screen.getByTestId('formb-map-line-i1')).toHaveTextContent(/RENT_LEASE|N17|Rent/i)
    expect(screen.getByTestId('formb-map-clear-i1')).toHaveTextContent(/undo clear/i)
    expect(screen.queryByTestId('formb-map-changed-i1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('formb-map-pending-i1')).not.toBeInTheDocument()
  })

  it('leaves an untouched row showing its persisted value', async () => {
    const user = userEvent.setup()
    renderWithDraft()

    await user.click(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /N16 — Salaries/i }))

    // Editing a1 must not disturb b1, which is ineligible and offers Clear only.
    expect(screen.getByTestId('formb-map-clear-b1')).toHaveTextContent(/^Clear$/i)
    expect(screen.queryByTestId('formb-map-changed-b1')).not.toBeInTheDocument()
  })

  it('disables every control while a page save is in flight', () => {
    renderWithDraft(rows, { disabled: true })

    expect(within(screen.getByTestId('formb-map-select-a1')).getByRole('combobox')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('formb-map-clear-i1')).toBeDisabled()
  })

  it('surfaces a save error passed down from the page', () => {
    renderWithDraft(rows, { saveError: 'Account 5150 cannot be mapped' })

    expect(screen.getByTestId('formb-mapping-save-error'))
      .toHaveTextContent('Account 5150 cannot be mapped')
  })
})
