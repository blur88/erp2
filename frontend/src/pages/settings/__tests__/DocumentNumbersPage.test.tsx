import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DocumentNumbersPage from '../DocumentNumbersPage'

const { mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
}))

// Frozen to mirror RTK Query, which freezes cached data in development. Any
// in-place edit of a config object therefore throws here instead of silently
// corrupting the cache (and leaking state between tests).
const mockConfigurations = [
  { documentName: 'Sales Orders', prefix: 'SO', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Payments', prefix: 'PAY', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Purchase Orders', prefix: 'PO', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Goods Received', prefix: 'GRN', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Stock Adjustment', prefix: 'SA', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Journal Entries', prefix: 'JE', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Expenses', prefix: 'EXP', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Owner Equity', prefix: 'EQ', nextNumber: 7, paddingDigits: 3 },
  { documentName: 'Provider Settlements', prefix: 'PS', nextNumber: 4, paddingDigits: 3 },
].map((c) => Object.freeze(c))

// Stable across renders, mirroring RTK Query: a fresh object literal per call
// would hand the component a new `configurations` reference every render.
const mockQueryResult = {
  data: { configurations: mockConfigurations },
  isLoading: false,
  error: undefined,
  refetch: vi.fn(),
}

vi.mock('@/store/api/settingsApi', () => ({
  useGetDocumentNumberSettingsQuery: () => mockQueryResult,
  useUpdateDocumentNumberSettingsMutation: () => [mockUpdateSettings, {}],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

describe('DocumentNumbersPage', () => {
  beforeEach(() => {
    mockUpdateSettings.mockClear()
    mockQueryResult.refetch.mockClear()
  })

  it('renders exactly the seven active document types', () => {
    render(<DocumentNumbersPage />)
    for (const name of [
      'Sales Orders',
      'Purchase Orders',
      'Stock Adjustment',
      'Journal Entries',
      'Expenses',
      'Owner Equity',
      'Provider Settlements',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('renders the four module group headings', () => {
    render(<DocumentNumbersPage />)
    for (const group of ['Sales', 'Purchasing', 'Inventory', 'Accounting']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
  })

  it('omits Payments and Goods Received even when the API still returns them', () => {
    render(<DocumentNumbersPage />)
    expect(screen.queryByText('Payments')).not.toBeInTheDocument()
    expect(screen.queryByText('Goods Received')).not.toBeInTheDocument()
  })

  it('edits a prefix without mutating the cached config object', async () => {
    render(<DocumentNumbersPage />)

    // Prefix inputs render in MODULE_GROUPS order; the first is Sales Orders.
    const prefixInput = screen.getAllByRole('textbox')[0] as HTMLInputElement
    expect(prefixInput.value).toBe('SO')

    fireEvent.change(prefixInput, { target: { value: 'SORD' } })

    await waitFor(() => expect(prefixInput.value).toBe('SORD'))

    // The RTK Query fixture must be untouched: the edit belongs to local state.
    expect(mockConfigurations.find((c) => c.documentName === 'Sales Orders')?.prefix).toBe('SO')

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalled())

    const { configurations } = mockUpdateSettings.mock.calls[0][0] as {
      configurations: Array<{ documentName: string; prefix: string }>
    }
    expect(configurations.find((c) => c.documentName === 'Sales Orders')?.prefix).toBe('SORD')
  })

  it('discards edits on Cancel even when refetch returns the same data', async () => {
    render(<DocumentNumbersPage />)

    const prefixInput = screen.getAllByRole('textbox')[0] as HTMLInputElement
    expect(prefixInput.value).toBe('SO')

    fireEvent.change(prefixInput, { target: { value: 'SORD' } })
    await waitFor(() => expect(prefixInput.value).toBe('SORD'))

    // mockQueryResult is a stable object, so refetch() yields an identical
    // array reference — exactly what RTK Query's structural sharing produces
    // when nothing changed server-side. Cancel must still revert.
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    await waitFor(() => expect(prefixInput.value).toBe('SO'))
    expect(mockQueryResult.refetch).toHaveBeenCalled()
  })

  it('does not resubmit legacy rows that are hidden from the table', async () => {
    render(<DocumentNumbersPage />)

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalled())

    const { configurations } = mockUpdateSettings.mock.calls[0][0] as {
      configurations: Array<{ documentName: string }>
    }
    expect(configurations.map((c) => c.documentName)).toEqual([
      'Sales Orders',
      'Purchase Orders',
      'Stock Adjustment',
      'Journal Entries',
      'Expenses',
      'Owner Equity',
      'Provider Settlements',
    ])
  })

  // Issue #1081 defect 2: the backend already seeded Owner Equity/EQ, but the
  // frontend MODULE_GROUPS list omitted it, so the row was invisible and its
  // prefix/next-number unconfigurable.
  it('shows the Owner Equity row under Accounting with its prefix and preview', () => {
    render(<DocumentNumbersPage />)

    const row = screen.getByText('Owner Equity').closest('tr')
    expect(row).not.toBeNull()

    const inputs = within(row as HTMLElement).getAllByRole('textbox') as HTMLInputElement[]
    expect(inputs[0].value).toBe('EQ')

    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    expect(within(row as HTMLElement).getByText(`EQ-${yy}-007`)).toBeInTheDocument()
  })

  // Issue #1271, same shape as #1081 defect 2: the backend seeds Provider
  // Settlements/PS (migration 1789915303816) and generates settlement numbers
  // from it, but MODULE_GROUPS omitted the name, so the row was filtered out
  // of the table and its prefix/next-number could not be configured.
  it('shows the Provider Settlements row under Accounting with its prefix and preview', () => {
    render(<DocumentNumbersPage />)

    const row = screen.getByText('Provider Settlements').closest('tr')
    expect(row).not.toBeNull()

    const inputs = within(row as HTMLElement).getAllByRole('textbox') as HTMLInputElement[]
    expect(inputs[0].value).toBe('PS')

    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    expect(within(row as HTMLElement).getByText(`PS-${yy}-004`)).toBeInTheDocument()
  })
})
