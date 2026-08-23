import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import CustomerPaymentsTab from '../CustomerPaymentsTab';

const { mockGetPayments } = vi.hoisted(() => ({
  mockGetPayments: vi.fn(),
}));

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>();
  return {
    ...actual,
    useGetPaymentsQuery: mockGetPayments,
  };
});

function renderTab(customerId: string) {
  const store = configureStore({ reducer: { sales: (state = {}) => state } });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CustomerPaymentsTab customerId={customerId} />
      </MemoryRouter>
    </Provider>,
  );
}

// Columns are Date | Invoice # | Status | Method | Amount, so the Invoice #
// cell of the first body row is index 1. Reading it directly keeps these
// assertions tied to the column under test instead of to page-wide text.
const INVOICE_COLUMN_INDEX = 1;

function invoiceCellText() {
  return screen.getAllByRole('cell')[INVOICE_COLUMN_INDEX].textContent;
}

describe('CustomerPaymentsTab', () => {
  it('shows loading state', () => {
    mockGetPayments.mockReturnValue({ data: undefined, isLoading: true });
    renderTab('c1');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows empty state when no payments', () => {
    mockGetPayments.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });
    renderTab('c1');
    expect(screen.getByText(/No payments yet/)).toBeInTheDocument();
  });

  it('renders payment rows', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p1',
            paymentDate: '2026-01-25',
            amount: 1000,
            paymentMethodEntity: { id: 'pm1', name: 'Cash', isActive: true },
            status: 'completed',
            customerId: 'c1',
            createdAt: '2026-01-25',
            updatedAt: '2026-01-25',
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View/i })).not.toBeInTheDocument();
  });

  it('shows em dash when paymentMethodEntity is absent', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p2',
            paymentDate: '2026-02-01',
            amount: 500,
            status: 'completed',
            customerId: 'c1',
            createdAt: '2026-02-01',
            updatedAt: '2026-02-01',
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('passes customerId, page, limit and date-desc sort to the query', () => {
    mockGetPayments.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false });
    renderTab('cust-99');
    expect(mockGetPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-99',
        page: 1,
        limit: expect.any(Number),
        sortBy: 'paymentDate',
        sortOrder: 'DESC',
      }),
    );
  });

  it('renders the pagination footer with the total', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p1',
            paymentDate: '2026-01-25',
            amount: 1000,
            paymentMethodEntity: { id: 'pm1', name: 'Cash', isActive: true },
            status: 'completed',
            customerId: 'c1',
            createdAt: '2026-01-25',
            updatedAt: '2026-01-25',
          },
        ],
        meta: { total: 17 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(screen.getByText(/of 17 records/)).toBeInTheDocument();
  });

  it('does not render a Payment # column', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p1',
            paymentDate: '2026-01-25',
            amount: 1000,
            paymentMethodEntity: { id: 'pm1', name: 'Cash', isActive: true },
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByText('Payment #')).not.toBeInTheDocument();
    expect(screen.queryByText('PAY-001')).not.toBeInTheDocument();
  });

  it('renders the sales order number in the Invoice # column', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p1',
            paymentDate: '2026-01-25',
            amount: 1000,
            salesOrderId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
            salesOrder: { id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', orderNumber: 'SO-26-001' },
            paymentMethodEntity: { id: 'pm1', name: 'Cash', isActive: true },
            status: 'completed',
            customerId: 'c1',
            createdAt: '2026-01-25',
            updatedAt: '2026-01-25',
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(invoiceCellText()).toBe('SO-26-001');
    expect(
      screen.queryByText('3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
    ).not.toBeInTheDocument();
  });

  it('renders an em dash for a payment with no linked sales order', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p2',
            paymentDate: '2026-02-01',
            amount: 500,
            salesOrderId: '9c858901-8a57-4791-81fe-4c455b099bc9',
            paymentMethodEntity: { id: 'pm1', name: 'Cash', isActive: true },
            status: 'completed',
            customerId: 'c1',
            createdAt: '2026-02-01',
            updatedAt: '2026-02-01',
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(
      screen.queryByText('9c858901-8a57-4791-81fe-4c455b099bc9'),
    ).not.toBeInTheDocument();
    // Assert on the Invoice # cell by position rather than on the page's only
    // em dash: other columns fall back to '—' too, so a text-wide query would
    // pass for the wrong reason if this fixture ever loses paymentMethodEntity.
    expect(invoiceCellText()).toBe('—');
  });

  it('renders a Status column so a voided payment is distinguishable', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [
          {
            id: 'p1',
            paymentDate: '2026-01-25',
            amount: 1000,
            paymentMethodEntity: { id: 'pm1', name: 'Cash', isActive: true },
            status: 'cancelled',
            customerId: 'c1',
            createdAt: '2026-01-25',
            updatedAt: '2026-01-25',
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
    });
    renderTab('c1');
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows the error state, not the empty state, when the query fails', () => {
    mockGetPayments.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderTab('c1');
    expect(screen.getByText('Failed to load payments.')).toBeInTheDocument();
    expect(screen.queryByText(/No payments yet/)).not.toBeInTheDocument();
  });
});
