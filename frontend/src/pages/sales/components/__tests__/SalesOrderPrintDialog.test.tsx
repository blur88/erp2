import { render, screen } from '@testing-library/react';
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
    totalAmount: 100,
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
});
