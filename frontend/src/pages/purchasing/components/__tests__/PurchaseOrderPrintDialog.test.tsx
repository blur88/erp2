import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PurchaseOrderPrintDialog, {
  type PurchaseOrderPrintData,
  type PrintSupplier,
  type PrintPurchaseOrderItem,
} from '../PurchaseOrderPrintDialog';

import type { VendorPayment } from '@/types';
import { formatDate } from '@/utils/formatters';

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
  purchasingPerPageFooter: '',
  purchasingEndOfDocFooter: '',
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

// Supplier as the PO response DTO actually returns it: FLATTENED, not shipping*/billing*.
const flatSupplier: PrintSupplier = {
  companyName: 'Acme Supplies',
  phone: '0123456789',
  address: '12 Jalan Test',
  city: 'KL',
  state: 'WP',
  postalCode: '50000',
  country: 'Malaysia',
};

function makePurchaseOrder(
  overrides: Partial<PurchaseOrderPrintData> = {},
): PurchaseOrderPrintData {
  const items: PrintPurchaseOrderItem[] = [
    {
      id: 'poi-1',
      quantity: 2,
      unitPrice: 50,
      totalAmount: 100,
      product: { id: 'p-1', name: 'Widget' },
    },
  ];
  return {
    id: 'po-1',
    orderNumber: 'PO-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    supplier: flatSupplier,
    subtotal: 100,
    shippingAmount: 0,
    totalAmount: 100,
    orderDate: new Date('2026-06-01'),
    items,
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    ...overrides,
  } as PurchaseOrderPrintData;
}

describe('PurchaseOrderPrintDialog', () => {
  it('renders the Purchase Order preview by default in a print-root', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={null}
        onClose={() => {}}
      />,
    );
    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toBeInTheDocument();
    expect(printRoot).toHaveTextContent(/PURCHASE ORDER/i);
  });

  it('maps the flattened supplier address and non-zero unit price', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={null}
        onClose={() => {}}
      />,
    );
    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toHaveTextContent('12 Jalan Test');
    expect(printRoot).toHaveTextContent(/50000, KL/);
    expect(printRoot).toHaveTextContent(/50\.00/);
  });

  it('falls back to unitCost when unitPrice is absent', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          items: [
            {
              id: 'poi-2',
              quantity: 1,
              unitCost: 77,
              totalAmount: 77,
              product: { id: 'p-2', name: 'Gadget' },
            },
          ],
        })}
        payment={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('print-root')).toHaveTextContent(/77\.00/);
  });

  it('uses description when product name is missing', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          items: [
            {
              id: 'poi-3',
              quantity: 1,
              unitPrice: 10,
              totalAmount: 10,
              description: 'Custom line item',
            },
          ],
        })}
        payment={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('print-root')).toHaveTextContent('Custom line item');
  });

  it('calls window.print when Print is clicked', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={null}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Print/i }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('disables Vendor Payment when no payment is available', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Vendor Payment/i })).toBeDisabled();
  });

  it('enables Vendor Payment when a payment is provided', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={{ id: 'vp-1', amount: 40 } as Partial<VendorPayment>}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Vendor Payment/i })).toBeEnabled();
  });

  it('shows vendor payment preview with mapped price, paid, and balance', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={
          { id: 'vp-1', amount: 40, paymentDate: '2026-06-05' } as Partial<VendorPayment>
        }
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Vendor Payment/i }));

    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toHaveTextContent(/VENDOR PAYMENT/i);
    expect(printRoot).toHaveTextContent('12 Jalan Test');
    expect(printRoot).toHaveTextContent(/Paid:/i);
    expect(printRoot).toHaveTextContent(/40\.00/);
    expect(printRoot).toHaveTextContent(/Balance:/i);
    expect(printRoot).toHaveTextContent(/60\.00/);

    const widgetRow = within(printRoot).getByText('Widget').closest('tr') as HTMLElement;
    expect(within(widgetRow).getByText(/50\.00/)).toBeInTheDocument();
    expect(within(widgetRow).getByText(/100\.00/)).toBeInTheDocument();
  });

  it('uses the order cumulative paidAmount, not a single payment amount', async () => {
    // Repro of PO-26-028: total 50, fully paid across two payments (20 + 30).
    // The dialog receives one payment (20); balance must still be 0, not 30.
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          subtotal: 50,
          totalAmount: 50,
          paidAmount: 50,
          items: [
            {
              id: 'poi-50',
              quantity: 1,
              unitPrice: 50,
              totalAmount: 50,
              product: { id: 'p-50', name: 'Widget' },
            },
          ],
        })}
        payment={
          { id: 'vp-20', amount: 20, paymentDate: '2026-06-13' } as Partial<VendorPayment>
        }
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Vendor Payment/i }));

    const printRoot = screen.getByTestId('print-root');
    // Paid reflects cumulative 50.00 (the order's paidAmount), not the 20 payment.
    expect(printRoot).toHaveTextContent(/50\.00/);
    expect(printRoot).toHaveTextContent(/Balance:/i);
    expect(printRoot).toHaveTextContent(/0\.00/);
    // The single-payment value must NOT be the balance.
    expect(printRoot).not.toHaveTextContent(/30\.00/);
  });

  it('falls back to PO supplier when payment carries a PO without a supplier', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder()}
        payment={
          {
            id: 'vp-2',
            amount: 40,
            paymentDate: '2026-06-05',
            // Nested PO present but missing a supplier — recipient must fall
            // back to the outer purchaseOrder's flattened supplier.
            purchaseOrder: { orderNumber: 'PO-001', items: [] } as never,
          } as Partial<VendorPayment>
        }
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Vendor Payment/i }));
    expect(screen.getByTestId('print-root')).toHaveTextContent('Acme Supplies');
  });

  it('resolves the address from a global-shape supplier (shipping*/billing*)', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          // Supplier in the global entity shape, not the flattened PO-DTO shape.
          supplier: {
            companyName: 'Global Co',
            shippingStreetAddress: '99 Shipping Rd',
            shippingCity: 'Penang',
            shippingPostalCode: '10000',
          } as PrintSupplier,
        })}
        payment={null}
        onClose={() => {}}
      />,
    );
    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toHaveTextContent('99 Shipping Rd');
    expect(printRoot).toHaveTextContent(/10000, Penang/);
  });

  it('computes the vendor payment line amount when totalAmount is absent', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          items: [
            {
              id: 'poi-9',
              quantity: 3,
              unitPrice: 25,
              // no totalAmount -> amount should be 3 * 25 = 75.00, not 0
              product: { id: 'p-9', name: 'Sprocket' },
            },
          ],
        })}
        payment={{ id: 'vp-3', amount: 10 } as Partial<VendorPayment>}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /Vendor Payment/i }));
    const printRoot = screen.getByTestId('print-root');
    const row = within(printRoot).getByText('Sprocket').closest('tr') as HTMLElement;
    expect(within(row).getByText(/75\.00/)).toBeInTheDocument();
  });

  it('disables Goods Received Note when the PO is not RECEIVED', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({ status: 'READY' })}
        payment={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Goods Received Note/i })).toBeDisabled();
  });

  it('enables Goods Received Note when the PO is RECEIVED', () => {
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({ status: 'RECEIVED' })}
        payment={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Goods Received Note/i })).toBeEnabled();
  });

  it('shows the GRN preview with received quantities and no pricing columns', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          status: 'RECEIVED',
          receivedDate: new Date('2026-06-10'),
          items: [
            {
              id: 'poi-1',
              quantity: 5,
              receivedQuantity: 3,
              unitPrice: 50,
              totalAmount: 250,
              product: { id: 'p-1', name: 'Widget' },
            },
          ],
        })}
        payment={null}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Goods Received Note/i }));
    const printRoot = screen.getByTestId('print-root');
    expect(printRoot).toHaveTextContent(/GOODS RECEIVED NOTE/i);
    // Qty column shows received qty (3), not ordered (5).
    const widgetRow = within(printRoot).getByText('Widget').closest('tr') as HTMLElement;
    expect(within(widgetRow).getByText('3')).toBeInTheDocument();
    // No money: unit price / amount must not appear.
    expect(printRoot).not.toHaveTextContent(/50\.00/);
    expect(printRoot).not.toHaveTextContent(/250\.00/);
    // Total Quantity box present.
    expect(printRoot).toHaveTextContent(/Total Quantity/i);
  });

  it('GRN date uses receivedDate when present', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          status: 'RECEIVED',
          receivedDate: new Date('2026-06-10'),
          updatedAt: new Date('2026-06-30'),
        })}
        payment={null}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Goods Received Note/i }));
    // Assert via formatDate (it reads localStorage.dateFormat) rather than a hardcoded
    // string, and assert it is NOT the updatedAt date.
    expect(screen.getByTestId('print-root')).toHaveTextContent(
      formatDate(new Date('2026-06-10')),
    );
    expect(screen.getByTestId('print-root')).not.toHaveTextContent(
      formatDate(new Date('2026-06-30')),
    );
  });

  it('GRN date falls back to updatedAt when receivedDate is absent', async () => {
    const user = userEvent.setup();
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({
          status: 'RECEIVED',
          receivedDate: null,
          updatedAt: new Date('2026-06-30'),
        })}
        payment={null}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Goods Received Note/i }));
    expect(screen.getByTestId('print-root')).toHaveTextContent(
      formatDate(new Date('2026-06-30')),
    );
  });

  it('calls window.print for the GRN type', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(
      <PurchaseOrderPrintDialog
        open
        purchaseOrder={makePurchaseOrder({ status: 'RECEIVED' })}
        payment={null}
        onClose={() => {}}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Goods Received Note/i }));
    await user.click(screen.getByRole('button', { name: /Print/i }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
