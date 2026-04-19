import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Customer } from '../../../database/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { AuditLogService } from '../../audit-logs/services';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';

describe('SalesOrderLifecycleService', () => {
  let service: SalesOrderLifecycleService;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let invoiceRepository: jest.Mocked<Repository<Invoice>>;

  const mockOrder = {
    id: 'so-1',
    orderNumber: 'SO-000001',
    customerId: 'cust-1',
    paidAmount: 0,
    isFulfilled: false,
    notes: 'old notes',
  } as SalesOrder;

  const mockDraftInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-000001',
    salesOrderId: 'so-1',
    customerId: 'cust-1',
    notes: 'old notes',
    status: InvoiceStatus.DRAFT,
  } as Invoice;

  const mockPaidInvoice = {
    ...mockDraftInvoice,
    status: InvoiceStatus.PAID,
  } as Invoice;

  beforeEach(async () => {
    salesOrderRepository = {
      findOne: jest.fn(),
      manager: { getRepository: jest.fn() },
    } as unknown as jest.Mocked<Repository<SalesOrder>>;

    invoiceRepository = {
      find: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Invoice>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderLifecycleService,
        { provide: getRepositoryToken(SalesOrder), useValue: salesOrderRepository },
        { provide: getRepositoryToken(SalesOrderItem), useValue: { delete: jest.fn() } },
        { provide: getRepositoryToken(Customer), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        {
          provide: InventoryIntegrationService,
          useValue: { releaseReservation: jest.fn() },
        },
        {
          provide: StockMovementService,
          useValue: { deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 0 }) },
        },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(SalesOrderLifecycleService);
  });

  describe('assertItemsNotLocked', () => {
    it('throws when the order is paid', async () => {
      salesOrderRepository.findOne.mockResolvedValue({
        ...mockOrder,
        paidAmount: 10,
      } as SalesOrder);

      await expect(service.assertItemsNotLocked('so-1')).rejects.toThrow(
        new BadRequestException(
          'Cannot edit sales order items that have been paid. Please unpay first.',
        ),
      );
    });

    it('throws when the order is fulfilled', async () => {
      salesOrderRepository.findOne.mockResolvedValue({
        ...mockOrder,
        isFulfilled: true,
      } as SalesOrder);

      await expect(service.assertItemsNotLocked('so-1')).rejects.toThrow(
        new BadRequestException(
          'Cannot edit sales order items that have been fulfilled. Please unfulfill first.',
        ),
      );
    });

    it('resolves when the order is neither paid nor fulfilled', async () => {
      salesOrderRepository.findOne.mockResolvedValue(mockOrder);

      await expect(service.assertItemsNotLocked('so-1')).resolves.toBeUndefined();
    });
  });

  describe('syncChildHeaderFromSalesOrder', () => {
    it('syncs customer and notes to draft invoices', async () => {
      const updatedOrder = {
        ...mockOrder,
        customerId: 'cust-2',
        notes: 'new notes',
      } as SalesOrder;
      invoiceRepository.find.mockResolvedValue([mockDraftInvoice]);

      await service.syncChildHeaderFromSalesOrder(updatedOrder);

      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-2',
          notes: 'new notes',
        }),
      );
    });

    it('skips paid invoices', async () => {
      invoiceRepository.find.mockResolvedValue([mockPaidInvoice]);

      await service.syncChildHeaderFromSalesOrder(mockOrder);

      expect(invoiceRepository.save).not.toHaveBeenCalled();
    });
  });
});
