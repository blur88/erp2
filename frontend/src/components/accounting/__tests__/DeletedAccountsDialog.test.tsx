import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import DeletedAccountsDialog from '../DeletedAccountsDialog'

const mockedApi = vi.hoisted(() => ({
  useGetDeletedChartOfAccountsQuery: vi.fn(),
  useRestoreChartOfAccountMutation: vi.fn(),
  usePermanentDeleteChartOfAccountMutation: vi.fn(),
  useBulkRestoreChartOfAccountsMutation: vi.fn(),
  useBulkPermanentDeleteChartOfAccountsMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetDeletedChartOfAccountsQuery: mockedApi.useGetDeletedChartOfAccountsQuery,
  useRestoreChartOfAccountMutation: mockedApi.useRestoreChartOfAccountMutation,
  usePermanentDeleteChartOfAccountMutation: mockedApi.usePermanentDeleteChartOfAccountMutation,
  useBulkRestoreChartOfAccountsMutation: mockedApi.useBulkRestoreChartOfAccountsMutation,
  useBulkPermanentDeleteChartOfAccountsMutation: mockedApi.useBulkPermanentDeleteChartOfAccountsMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

describe('DeletedAccountsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetDeletedChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'acc-1',
            code: '1000',
            name: 'Cash',
            type: 'ASSET',
            isActive: true,
            fullCode: '1000',
            isParent: false,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            deletedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useRestoreChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.usePermanentDeleteChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkRestoreChartOfAccountsMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPermanentDeleteChartOfAccountsMutation.mockReturnValue([vi.fn()])
  })

  it('shows bulk action buttons after selecting a deleted account checkbox', async () => {
    render(<DeletedAccountsDialog open onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Restore Selected/i })).not.toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    expect(screen.getByRole('button', { name: /Restore Selected \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete Selected \(1\)/i })).toBeInTheDocument()
  })
})
