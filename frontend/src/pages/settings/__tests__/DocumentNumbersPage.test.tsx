import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DocumentNumbersPage from '../DocumentNumbersPage'

const { mockUpdateSettings } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
}))

const mockConfigurations = [
  { documentName: 'Sales Orders', prefix: 'SO', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Payments', prefix: 'PAY', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Purchase Orders', prefix: 'PO', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Goods Received', prefix: 'GRN', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Stock Adjustment', prefix: 'SA', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Journal Entries', prefix: 'JE', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Expenses', prefix: 'EXP', nextNumber: 1, paddingDigits: 3 },
]

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
  })

  it('renders exactly the five active document types', () => {
    render(<DocumentNumbersPage />)
    for (const name of [
      'Sales Orders',
      'Purchase Orders',
      'Stock Adjustment',
      'Journal Entries',
      'Expenses',
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
    ])
  })
})
