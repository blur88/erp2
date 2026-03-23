import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettlementsPage from '../SettlementsPage'

const mocked = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  createSettlement: vi.fn(),
  cancelSettlement: vi.fn(),
  useGetSettlementsQuery: vi.fn(),
  useGetPendingSettlementSummaryQuery: vi.fn(),
  useCreateSettlementMutation: vi.fn(),
  useCancelSettlementMutation: vi.fn(),
}))

let createShouldFail = false
let cancelShouldFail = false

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mocked.showSuccess, showError: mocked.showError }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetSettlementsQuery: mocked.useGetSettlementsQuery,
  useGetPendingSettlementSummaryQuery: mocked.useGetPendingSettlementSummaryQuery,
  useCreateSettlementMutation: mocked.useCreateSettlementMutation,
  useCancelSettlementMutation: mocked.useCancelSettlementMutation,
}))

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
    mocked.useGetSettlementsQuery.mockReturnValue({
      data: {
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
      },
      isLoading: false,
    })
    mocked.useGetPendingSettlementSummaryQuery.mockReturnValue({})
    mocked.useCreateSettlementMutation.mockReturnValue([
      (data: any) => ({
        unwrap: () =>
          createShouldFail ? Promise.reject(new Error('Create failed')) : Promise.resolve({ id: 's-2', ...data }),
      }),
    ])
    mocked.useCancelSettlementMutation.mockReturnValue([
      (id: string) => ({
        unwrap: () =>
          cancelShouldFail ? Promise.reject(new Error('Cancel failed')) : Promise.resolve({ id }),
      }),
    ])
  })

  it('renders a static PageHeader title and subtitle', () => {
    render(<SettlementsPage />)

    expect(screen.getByText('Settlements')).toBeInTheDocument()
    expect(
      screen.getByText('Settle pending payments by payment method'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Settlements (1)')).not.toBeInTheDocument()
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
