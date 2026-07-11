import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import PaymentMethodsPage from '../PaymentMethodsPage';

const mockedApi = vi.hoisted(() => ({
  useGetPaymentMethodsQuery: vi.fn(),
  useGetDeletedPaymentMethodsQuery: vi.fn(),
  useCreatePaymentMethodMutation: vi.fn(),
  useUpdatePaymentMethodMutation: vi.fn(),
  useDeletePaymentMethodMutation: vi.fn(),
  useRestorePaymentMethodMutation: vi.fn(),
  usePermanentDeletePaymentMethodMutation: vi.fn(),
}));

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetPaymentMethodsQuery: mockedApi.useGetPaymentMethodsQuery,
  useGetDeletedPaymentMethodsQuery: mockedApi.useGetDeletedPaymentMethodsQuery,
  useCreatePaymentMethodMutation: mockedApi.useCreatePaymentMethodMutation,
  useUpdatePaymentMethodMutation: mockedApi.useUpdatePaymentMethodMutation,
  useDeletePaymentMethodMutation: mockedApi.useDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation: mockedApi.useRestorePaymentMethodMutation,
  usePermanentDeletePaymentMethodMutation: mockedApi.usePermanentDeletePaymentMethodMutation,
}));

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

describe('PaymentMethodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'pm-1',
            code: 'CASH',
            name: 'Cash',
            useForPurchases: true,
            accountingChannel: 'CASH',
            sortOrder: 1,
            isActive: true,
          },
        ],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
      isLoading: false,
    });
    mockedApi.useCreatePaymentMethodMutation.mockReturnValue([vi.fn()]);
    mockedApi.useUpdatePaymentMethodMutation.mockReturnValue([vi.fn()]);
    mockedApi.useDeletePaymentMethodMutation.mockReturnValue([vi.fn()]);
    mockedApi.useGetDeletedPaymentMethodsQuery.mockReturnValue({
      data: [],
      isFetching: false,
    });
    mockedApi.useRestorePaymentMethodMutation.mockReturnValue([vi.fn()]);
    mockedApi.usePermanentDeletePaymentMethodMutation.mockReturnValue([vi.fn()]);
  });

  it('renders payment methods from RTK Query data', () => {
    render(<PaymentMethodsPage />);

    expect(screen.getByText('Payment Methods (1)')).toBeInTheDocument();
    expect(screen.getAllByText('Cash')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /add payment method/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view deleted/i })).toBeInTheDocument();
  });
});
