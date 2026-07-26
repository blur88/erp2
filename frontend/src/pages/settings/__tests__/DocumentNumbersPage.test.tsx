import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DocumentNumbersPage from '../DocumentNumbersPage'

const mockConfigurations = [
  { documentName: 'Sales Orders', prefix: 'SO', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Payments', prefix: 'PAY', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Purchase Orders', prefix: 'PO', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Goods Received', prefix: 'GRN', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Stock Adjustment', prefix: 'SA', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Journal Entries', prefix: 'JE', nextNumber: 1, paddingDigits: 3 },
  { documentName: 'Expenses', prefix: 'EXP', nextNumber: 1, paddingDigits: 3 },
]

vi.mock('@/store/api/settingsApi', () => ({
  useGetDocumentNumberSettingsQuery: () => ({
    data: { configurations: mockConfigurations },
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useUpdateDocumentNumberSettingsMutation: () => [vi.fn(), {}],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

describe('DocumentNumbersPage', () => {
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
})
