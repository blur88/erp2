import { InvoiceController } from './invoice.controller';
import { InvoiceService } from '../services/invoice.service';

describe('InvoiceController', () => {
  let controller: InvoiceController;
  let invoiceService: Pick<InvoiceService, 'batchSendInvoices' | 'getRevenueStatistics'>;

  beforeEach(() => {
    invoiceService = {
      batchSendInvoices: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
      getRevenueStatistics: jest.fn().mockResolvedValue({ totalRevenue: 0 }),
    } as any;

    controller = new InvoiceController(invoiceService as InvoiceService);
  });

  it('passes validated invoice IDs to batchSendInvoices', async () => {
    const invoiceIds = ['550e8400-e29b-41d4-a716-446655440000'];

    await controller.batchSendInvoices({ invoiceIds });

    expect(invoiceService.batchSendInvoices).toHaveBeenCalledWith(invoiceIds);
  });

  it('passes validated revenue stats dates to getRevenueStatistics', async () => {
    await controller.getRevenueStats({
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });

    expect(invoiceService.getRevenueStatistics).toHaveBeenCalledWith(
      '2026-01-01',
      '2026-01-31',
    );
  });
});
