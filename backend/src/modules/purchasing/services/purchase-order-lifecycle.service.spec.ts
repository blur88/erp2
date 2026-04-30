import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GoodsReceivedNote, PurchaseOrder, VendorPayment } from '../../../database/entities';
import { GrnStatus } from '../../../database/entities/goods-received-note.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { AuditLogService } from '../../audit-logs/services';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';

describe('PurchaseOrderLifecycleService', () => {
  let service: PurchaseOrderLifecycleService;
  let poRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let grnRepository: jest.Mocked<Repository<GoodsReceivedNote>>;
  let vpRepository: jest.Mocked<Repository<VendorPayment>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const poQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const grnQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const vpQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const mockOrder = {
    id: 'po-1',
    orderNumber: 'PO-000001',
    supplierId: 'supplier-1',
    totalAmount: 100,
    paidAmount: 0,
  } as PurchaseOrder;

  const mockDraftGrn = {
    id: 'grn-1',
    grnNumber: 'GRN-000001',
    purchaseOrderId: 'po-1',
    status: GrnStatus.DRAFT,
  } as GoodsReceivedNote;

  const mockReceivedGrn = {
    ...mockDraftGrn,
    status: GrnStatus.RECEIVED,
  } as GoodsReceivedNote;

  const mockVendorPayment = {
    id: 'vp-1',
    paymentNumber: 'VP-000001',
    purchaseOrderId: 'po-1',
    amount: 50,
  } as VendorPayment;

  beforeEach(async () => {
    poRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(poQueryBuilder),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(0),
        }),
      },
    } as unknown as jest.Mocked<Repository<PurchaseOrder>>;

    grnRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(grnQueryBuilder),
    } as unknown as jest.Mocked<Repository<GoodsReceivedNote>>;

    vpRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(vpQueryBuilder),
    } as unknown as jest.Mocked<Repository<VendorPayment>>;

    auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrderLifecycleService,
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepository },
        { provide: getRepositoryToken(GoodsReceivedNote), useValue: grnRepository },
        { provide: getRepositoryToken(VendorPayment), useValue: vpRepository },
        {
          provide: StockMovementService,
          useValue: { deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 0 }) },
        },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(PurchaseOrderLifecycleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertItemsNotLocked', () => {
    it('throws when purchase order is missing', async () => {
      poRepository.findOne.mockResolvedValue(null);

      await expect(service.assertItemsNotLocked('po-1')).rejects.toThrow(NotFoundException);
    });

    it('throws when paid amount is greater than zero', async () => {
      poRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 50 } as PurchaseOrder);

      await expect(service.assertItemsNotLocked('po-1')).rejects.toThrow(
        'Cannot edit purchase order items that have been paid. Please unpay first.',
      );
    });

    it('throws when a received GRN exists', async () => {
      poRepository.findOne.mockResolvedValue(mockOrder);
      grnRepository.findOne.mockResolvedValue(mockReceivedGrn);

      await expect(service.assertItemsNotLocked('po-1')).rejects.toThrow(
        'Cannot edit purchase order items with received goods. Please return goods first.',
      );
    });

    it('resolves when no payment or received GRN exists', async () => {
      poRepository.findOne.mockResolvedValue(mockOrder);
      grnRepository.findOne.mockResolvedValue(mockDraftGrn);

      await expect(service.assertItemsNotLocked('po-1')).resolves.toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('throws when purchase order has been paid', async () => {
      poRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 20 } as PurchaseOrder);

      await expect(service.softDelete('po-1')).rejects.toThrow(
        'Cannot delete purchase order that has been paid. Please unpay first.',
      );
    });

    it('throws when purchase order has received goods', async () => {
      poRepository.findOne.mockResolvedValue(mockOrder);
      grnRepository.findOne.mockResolvedValue(mockReceivedGrn);

      await expect(service.softDelete('po-1')).rejects.toThrow(
        'Cannot delete purchase order with received goods. Please return goods first.',
      );
    });

    it('soft deletes the PO, GRN, and vendor payments with the same timestamp', async () => {
      poRepository.findOne.mockResolvedValue(mockOrder);
      grnRepository.findOne.mockResolvedValue(mockDraftGrn);
      vpRepository.find.mockResolvedValue([mockVendorPayment]);

      await service.softDelete('po-1', 'user-1', 'admin');

      expect(poQueryBuilder.execute).toHaveBeenCalled();
      expect(grnQueryBuilder.execute).toHaveBeenCalled();
      expect(vpQueryBuilder.execute).toHaveBeenCalledTimes(1);

      const poDeletedAt = poQueryBuilder.set.mock.calls[0][0].deletedAt;
      const grnDeletedAt = grnQueryBuilder.set.mock.calls[0][0].deletedAt;
      const vpDeletedAt = vpQueryBuilder.set.mock.calls[0][0].deletedAt;

      expect(poDeletedAt).toBeInstanceOf(Date);
      expect(poDeletedAt).toEqual(grnDeletedAt);
      expect(poDeletedAt).toEqual(vpDeletedAt);
      expect(auditLogService.log).toHaveBeenCalledTimes(3);
    });
  });

  describe('assertPermanentDeleteAllowed', () => {
    it('throws when stock movements exist for the purchase order', async () => {
      const count = jest.fn().mockResolvedValue(2);
      (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });

      await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(
        'Cannot permanently delete purchase order with existing stock movements.',
      );
      expect(poRepository.manager.getRepository).toHaveBeenCalledWith(StockMovement);
      expect(count).toHaveBeenCalledWith({
        where: { referenceType: 'purchase_order', referenceId: 'po-1' },
      });
    });

    it('throws when the purchase order is not found', async () => {
      const count = jest.fn().mockResolvedValue(0);
      (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
      poRepository.findOne.mockResolvedValue(null);

      await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(NotFoundException);
    });

    it('throws when the purchase order has a paid amount greater than zero', async () => {
      const count = jest.fn().mockResolvedValue(0);
      (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
      poRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 50 } as PurchaseOrder);
      vpRepository.find.mockResolvedValue([]);

      await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(
        'Cannot permanently delete purchase order that has payments recorded. Please unpay first.',
      );
    });

    it('allows deletion when soft-deleted vendor payments exist but paidAmount is zero', async () => {
      const count = jest.fn().mockResolvedValue(0);
      (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
      poRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 0 } as PurchaseOrder);
      vpRepository.find.mockResolvedValue([mockVendorPayment]);

      await expect(service.assertPermanentDeleteAllowed('po-1')).resolves.toBeUndefined();
    });

    it('resolves when neither stock movements nor paid amount exist', async () => {
      const count = jest.fn().mockResolvedValue(0);
      (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
      poRepository.findOne.mockResolvedValue(mockOrder);
      vpRepository.find.mockResolvedValue([]);

      await expect(service.assertPermanentDeleteAllowed('po-1')).resolves.toBeUndefined();
    });
  });
});
