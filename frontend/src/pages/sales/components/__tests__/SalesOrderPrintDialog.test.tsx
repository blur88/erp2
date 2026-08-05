import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SalesOrderPrintDialog from '../SalesOrderPrintDialog';

import type { SalesOrder } from '@/types';

const mockPrintData = {
  logoUrl: '',
  companyName: 'My Company',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  salesPerPageFooter: '',
  salesEndOfDocFooter: '',
};

vi.mock('@/store/api/printSettingsApi', () => ({
  useGetPrintSettingsQuery: vi.fn(() => ({
    data: mockPrintData,
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: vi.fn(() => ({ currency: 'RM' })),
}));

function makeSalesOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'so-1',
    orderNumber: 'SO-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    customerId: 'c-1',
    totalAmount: '100.0000',
    orderDate: new Date('2026-06-01'),
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    ...overrides,
  } as SalesOrder;
}

describe('SalesOrderPrintDialog', () => {
  it('disables Invoice option when status is not FULFILLED', () => {
    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({ status: 'DRAFT' })}
        onClose={() => {}}
      />,
    );
    const invoiceRadio = screen.getByRole('radio', { name: /Invoice/i });
    expect(invoiceRadio).toBeDisabled();
  });

  it('enables Invoice option when status is FULFILLED', () => {
    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({ status: 'FULFILLED' })}
        onClose={() => {}}
      />,
    );
    const invoiceRadio = screen.getByRole('radio', { name: /Invoice/i });
    expect(invoiceRadio).toBeEnabled();
  });

  it('wraps the document template in a print-root container', () => {
    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({ status: 'FULFILLED' })}
        onClose={() => {}}
      />,
    );
    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toBeInTheDocument();
    // Document title from BasePrintTemplate must be inside the print root.
    expect(printRoot).toHaveTextContent(/SALES ORDER/i);
  });

  it('passes customer address fields to invoice print', async () => {
    const user = userEvent.setup();

    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({
          status: 'FULFILLED',
          customer: {
            id: 'c-1',
            slug: 'acme',
            type: 'business',
            name: 'Acme Co',
            phone: '0123456789',
            billingStreetAddress: '12 Jalan Test',
            billingCity: 'KL',
            billingState: 'WP',
            billingPostalCode: '50000',
            billingCountry: 'Malaysia',
            isActive: true,
            totalSales: 0,
            totalOrders: 0,
            averageOrderValue: 0,
            createdAt: new Date('2026-06-01'),
            updatedAt: new Date('2026-06-01'),
          } as any,
        })}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Invoice/i }));

    expect(screen.getByTestId('print-root')).toHaveTextContent('12 Jalan Test');
    expect(screen.getByTestId('print-root')).toHaveTextContent(/50000, KL/);
  });

  it('disables Payment Receipt when no payment recorded', () => {
    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({ paidAmount: '0.0000' })}
        onClose={() => {}}
      />,
    );

    const radio = screen.getByRole('radio', { name: /Payment Receipt/i });
    expect(radio).toBeDisabled();
  });

  it('enables Payment Receipt when paidAmount > 0', () => {
    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({ paidAmount: '50.0000' })}
        onClose={() => {}}
      />,
    );

    const radio = screen.getByRole('radio', { name: /Payment Receipt/i });
    expect(radio).toBeEnabled();
  });

  it('renders Paid and Balance when Payment Receipt selected', async () => {
    const user = userEvent.setup();

    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({
          paidAmount: '50.0000',
          subtotal: 100,
          totalAmount: '100.0000',
          status: 'FULFILLED',
        })}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Payment Receipt/i }));

    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toHaveTextContent(/PAYMENT RECEIPT/i);
    expect(printRoot).toHaveTextContent(/Paid:/i);
    expect(printRoot).toHaveTextContent(/Balance:/i);
  });

  it('shows negative balance on overpayment', async () => {
    const user = userEvent.setup();

    render(
      <SalesOrderPrintDialog
        open
        salesOrder={makeSalesOrder({
          paidAmount: '150.0000',
          subtotal: 100,
          totalAmount: '100.0000',
          status: 'FULFILLED',
          items: [
            {
              id: 'item-1',
              quantity: 1,
              unitPrice: 100,
              totalAmount: 100,
              total: 100,
              discount: 0,
              product: {
                id: 'product-1',
                name: 'Product A',
              } as any,
            } as any,
          ],
        })}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Payment Receipt/i }));

    expect(screen.getByTestId('print-root')).toHaveTextContent(/-50\.00/);
  });
});
