import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettlementsPage from '../SettlementsPage'

const mocked = vi.hoisted(() => ({
  dispatch: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  createSettlement: vi.fn((data: any) => ({ type: 'createSettlement', payload: data })),
  cancelSettlement: vi.fn((id: string) => ({ type: 'cancelSettlement', payload: id })),
  fetchSettlements: vi.fn((params: any) => ({ type: 'fetchSettlements', payload: params })),
  fetchPendingSummary: vi.fn(() => ({ type: 'fetchPendingSummary' })),
}))

let createShouldFail = false
let cancelShouldFail = false

const mockState = {
  settlements: {
    data: [
      {
        id: 's-1',
        settlementNumber: 'SET-001',
        paymentMethod: { name: 'Cash' },
        settlementDate: '2026-02-26',
        totalAmount: 120,
        paymentCount: 1,
        reference: 'ref',
        status: 'completed',
      },
    ],
    loading: false,
  },
}

vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => mocked.dispatch,
  useAppSelector: (selector: any) => selector(mockState),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mocked.showSuccess, showError: mocked.showError }),
}))

vi.mock('@/store/slices/settlementsSlice', async () => {
  const actual = await vi.importActual<typeof import('@/store/slices/settlementsSlice')>(
    '@/store/slices/settlementsSlice',
  )

  return {
    ...actual,
    createSettlement: mocked.createSettlement,
    cancelSettlement: mocked.cancelSettlement,
    fetchSettlements: mocked.fetchSettlements,
    fetchPendingSummary: mocked.fetchPendingSummary,
  }
})

vi.mock('@/components/accounting/CreateSettlementDialog', () => ({
  default: ({ open, onCreate }: any) =>
    open ? (
      <button
        onClick={() =>
          onCreate({
            paymentMethodId: 'pm-1',
            settlementDate: '2026-02-26',
            paymentIds: ['p-1'],
          })
        }
      >
        confirm create
      </button>
    ) : null,
}))

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (value: string) => value,
}))

describe('SettlementsPage notifications', () => {
  beforeEach(() => {
    createShouldFail = false
    cancelShouldFail = false

    mocked.showSuccess.mockClear()
    mocked.showError.mockClear()
    mocked.createSettlement.mockClear()
    mocked.cancelSettlement.mockClear()
    mocked.fetchSettlements.mockClear()
    mocked.fetchPendingSummary.mockClear()

    mocked.dispatch.mockReset()
    mocked.dispatch.mockImplementation((action: any) => {
      if (action?.type === 'createSettlement') {
        return {
          unwrap: () =>
            createShouldFail
              ? Promise.reject(new Error('Create failed'))
              : Promise.resolve({ id: 's-2' }),
        }
      }

      if (action?.type === 'cancelSettlement') {
        return {
          unwrap: () =>
            cancelShouldFail
              ? Promise.reject(new Error('Cancel failed'))
              : Promise.resolve({ id: 's-1' }),
        }
      }

      return Promise.resolve(action)
    })
  })

  it('shows success notification after creating settlement', async () => {
    const user = userEvent.setup()
    render(<SettlementsPage />)

    await user.click(screen.getByRole('button', { name: 'Create Settlement' }))
    await user.click(screen.getByRole('button', { name: 'confirm create' }))

    await waitFor(() => {
      expect(mocked.showSuccess).toHaveBeenCalledWith('Settlement created successfully')
    })
    expect(mocked.showError).not.toHaveBeenCalled()
  })

  it('shows error notification when create settlement fails', async () => {
    createShouldFail = true

    const user = userEvent.setup()
    render(<SettlementsPage />)

    await user.click(screen.getByRole('button', { name: 'Create Settlement' }))
    await user.click(screen.getByRole('button', { name: 'confirm create' }))

    await waitFor(() => {
      expect(mocked.showError).toHaveBeenCalledWith('Create failed')
    })
  })

  it('shows success notification after cancelling settlement', async () => {
    const user = userEvent.setup()
    render(<SettlementsPage />)

    const cancelIcon = screen.getByTestId('CancelIcon')
    const cancelButton = cancelIcon.closest('button')
    if (!cancelButton) throw new Error('Cancel button not found')

    await user.click(cancelButton)
    await user.click(screen.getByRole('button', { name: 'Cancel Settlement' }))

    await waitFor(() => {
      expect(mocked.showSuccess).toHaveBeenCalledWith('Settlement cancelled successfully')
    })
    expect(mocked.showError).not.toHaveBeenCalled()
  })

  it('shows error notification when cancelling settlement fails', async () => {
    cancelShouldFail = true

    const user = userEvent.setup()
    render(<SettlementsPage />)

    const cancelIcon = screen.getByTestId('CancelIcon')
    const cancelButton = cancelIcon.closest('button')
    if (!cancelButton) throw new Error('Cancel button not found')

    await user.click(cancelButton)
    await user.click(screen.getByRole('button', { name: 'Cancel Settlement' }))

    await waitFor(() => {
      expect(mocked.showError).toHaveBeenCalledWith('Cancel failed')
    })
  })
})
