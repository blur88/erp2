import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CustomerWorkspaceCard from '../CustomerWorkspaceCard';
import { CustomerType } from '@/types';

const mockUseGetCustomerSalesHistoryQuery = vi.hoisted(() => vi.fn());
const mockUseGetCustomerPaymentsQuery = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomerSalesHistoryQuery: mockUseGetCustomerSalesHistoryQuery,
  useGetCustomerPaymentsQuery: mockUseGetCustomerPaymentsQuery,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCustomer = {
  id: 'customer-1',
  type: CustomerType.BUSINESS,
  name: 'Acme Supplies',
  isActive: true,
  totalSales: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('CustomerWorkspaceCard', () => {
  beforeEach(() => {
    mockUseGetCustomerSalesHistoryQuery.mockReset();
    mockUseGetCustomerPaymentsQuery.mockReset();
    mockNavigate.mockReset();

    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
  });

  it('renders nothing when no customer is selected', () => {
    const { container } = render(<CustomerWorkspaceCard selectedCustomer={null} />);
    expect(container.querySelector('[role="tabpanel"]')).not.toBeInTheDocument();
  });

  it('renders Orders and Payments tabs', () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('loads orders on initial render, Payments tab only when clicked', () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    expect(mockUseGetCustomerSalesHistoryQuery).toHaveBeenCalledWith('customer-1', { skip: false });
    expect(mockUseGetCustomerPaymentsQuery).toHaveBeenCalledWith('customer-1', { skip: true });
  });

  it('shows orders empty state when no orders', () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: { orders: [] },
      isLoading: false,
      isError: false,
    });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    expect(screen.getByText('No orders found.')).toBeInTheDocument();
  });

  it('renders order rows', () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: {
        orders: [
          {
            id: 'o-1',
            orderNumber: 'SO-001',
            orderDate: '2026-01-10',
            isFulfilled: false,
            isPaid: false,
            totalAmount: 500,
            itemsCount: 2,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    expect(screen.getByText('SO-001')).toBeInTheDocument();
  });

  it('clicking an order navigates to sales orders list with highlight param', () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: {
        orders: [
          {
            id: 'o-1',
            orderNumber: 'SO-001',
            orderDate: '2026-01-10',
            isFulfilled: false,
            isPaid: false,
            totalAmount: 500,
            itemsCount: 2,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    fireEvent.click(screen.getByText('SO-001').closest('tr')!);
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=o-1');
  });

  it('shows payments empty state when Payments tab clicked with no data', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }));

    await waitFor(() => {
      expect(screen.getByText('No payments found.')).toBeInTheDocument();
    });
  });

  it('renders payment rows', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: [
        {
          id: 'pay-1',
          paymentDate: '2026-01-15',
          status: 'completed',
          amount: 1500,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }));

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
    });
  });

  it('payment rows are no longer navigable', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: [
        {
          id: 'pay-1',
          paymentDate: '2026-01-15',
          status: 'completed',
          amount: 1500,
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }));

    await waitFor(() => expect(screen.getByText('completed')).toBeInTheDocument());

    fireEvent.click(screen.getByText('completed').closest('tr')!);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows error state for each tab on fetch failure', async () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />);

    expect(screen.getByText('Failed to load orders.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }));
    await waitFor(() => expect(screen.getByText('Failed to load payments.')).toBeInTheDocument());
  });
});
