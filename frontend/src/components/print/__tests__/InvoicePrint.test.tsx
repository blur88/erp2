import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InvoicePrint from '../InvoicePrint';

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

describe('InvoicePrint', () => {
  it('renders "Invoice" title', () => {
    render(
      <InvoicePrint
        salesOrder={{
          orderNumber: 'SO-001',
          fulfilledAt: '2026-06-01',
          subtotalAmount: 100,
          shippingAmount: 10,
          totalAmount: 110,
          customerName: 'Test Customer',
          items: [{ name: 'Product A', quantity: 2, unitPrice: 50, total: 100 }],
        }}
        paidTotal={70}
      />,
    );
    expect(screen.getByText('INVOICE')).toBeInTheDocument();
  });

  it('shows Balance Due', () => {
    render(
      <InvoicePrint
        salesOrder={{
          orderNumber: 'SO-001',
          fulfilledAt: '2026-06-01',
          subtotalAmount: 100,
          shippingAmount: 10,
          totalAmount: 110,
        }}
        paidTotal={70}
      />,
    );
    expect(screen.getByText('Balance:')).toBeInTheDocument();
  });

  it('calculates Balance Due correctly: (100 + 10) - 70 = 40', () => {
    render(
      <InvoicePrint
        salesOrder={{
          orderNumber: 'SO-001',
          fulfilledAt: '2026-06-01',
          subtotalAmount: 100,
          shippingAmount: 10,
          totalAmount: 110,
        }}
        paidTotal={70}
      />,
    );
    expect(screen.getByText('RM 40.00')).toBeInTheDocument();
  });

  it('shows the fulfilment date', () => {
    render(
      <InvoicePrint
        salesOrder={{
          orderNumber: 'SO-001',
          fulfilledAt: '2026-06-01',
          subtotalAmount: 100,
          shippingAmount: 10,
          totalAmount: 110,
        }}
        paidTotal={70}
      />,
    );
    // Date label is present and non-empty (formatted by formatDate).
    const dateNode = screen.getByText('Date:').parentElement;
    expect(dateNode?.textContent?.replace('Date:', '').trim()).not.toBe('');
  });

  it('renders the Discount column to match the Sales Order template', () => {
    render(
      <InvoicePrint
        salesOrder={{
          orderNumber: 'SO-001',
          fulfilledAt: '2026-06-01',
          subtotalAmount: 100,
          shippingAmount: 10,
          totalAmount: 110,
          items: [
            { name: 'Product A', quantity: 2, unitPrice: 50, discount: 0, discountDisplay: '-', total: 100 },
          ],
        }}
        paidTotal={70}
      />,
    );
    expect(screen.getByText('Discount')).toBeInTheDocument();
  });
});
