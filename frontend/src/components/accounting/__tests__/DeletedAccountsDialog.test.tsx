import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import DeletedAccountsDialog from '../DeletedAccountsDialog'
import chartOfAccountsReducer from '@/store/slices/chartOfAccountsSlice'
import { ApiService } from '@/services/api'

vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
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

    ;(ApiService.get as any).mockImplementation((url: string) => {
      if (url === '/accounting/chart-of-accounts/deleted') {
        return Promise.resolve([
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
        ])
      }

      if (url.startsWith('/accounting/chart-of-accounts?')) {
        return Promise.resolve({
          data: [],
          meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
        })
      }

      return Promise.resolve([])
    })

    ;(ApiService.post as any).mockResolvedValue({
      message: 'ok',
      restoredCount: 1,
      failedIds: [],
    })

    ;(ApiService.delete as any).mockResolvedValue({
      message: 'ok',
      deletedCount: 1,
      failedIds: [],
    })
  })

  it('shows bulk action buttons after selecting a deleted account checkbox', async () => {
    const store = configureStore({
      reducer: {
        chartOfAccounts: chartOfAccountsReducer,
      },
    })

    render(
      <Provider store={store}>
        <DeletedAccountsDialog open onClose={vi.fn()} />
      </Provider>
    )

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
