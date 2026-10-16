import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import DeletedPaymentMethodsDialog from '../DeletedPaymentMethodsDialog'

const mockedApi = vi.hoisted(() => ({
  useGetDeletedPaymentMethodsQuery: vi.fn(),
  useRestorePaymentMethodMutation: vi.fn(),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetDeletedPaymentMethodsQuery: mockedApi.useGetDeletedPaymentMethodsQuery,
  useRestorePaymentMethodMutation: mockedApi.useRestorePaymentMethodMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

describe('DeletedPaymentMethodsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetDeletedPaymentMethodsQuery.mockReturnValue({
      data: [
        {
          id: 'pm-1',
          code: 'SHOPEE',
          name: 'Shopee',
          deletedAt: '2026-10-01T00:00:00Z',
        },
      ],
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useRestorePaymentMethodMutation.mockReturnValue([vi.fn(), { isLoading: false }])
  })

  it('offers restore and no permanent delete (#1398 project 1)', () => {
    render(<DeletedPaymentMethodsDialog open onClose={vi.fn()} />)

    // Soft delete, the deleted list and restore stay until project 8.
    expect(screen.getByRole('button', { name: 'Restore payment method' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Permanently Delete/ })).toBeNull()

    // The info text must not promise a capability the dialog no longer has.
    expect(screen.getByText(/You can restore them to make them active again/)).toBeInTheDocument()
    expect(screen.queryByText(/permanently delete them/)).toBeNull()
  })
})
