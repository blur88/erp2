import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
  VendorPayment,
} from '../../../database/entities';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { AuditLogService } from '../../audit-logs/services';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';

describe('PurchaseOrderLifecycleService', () => {
  let service: PurchaseOrderLifecycleService;
  let poRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let vpRepository: jest.Mocked<Repository<VendorPayment>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: { transaction: jest.Mock };
  let stockMovementService: { deleteByReference: jest.Mock; create: jest.Mock };
  let baseCostCalculator: { addStock: jest.Mock; removeStock: jest.Mock; calculateShippingByValue: jest.Mock };
  const poQueryBuilder = {
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
    status: PurchaseOrderStatus.DRAFT,
    paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
  } as PurchaseOrder;

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

    vpRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(vpQueryBuilder),
    } as unknown as jest.Mocked<Repository<VendorPayment>>;

    dataSource = {
      transaction: jest.fn(),
    };

    auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    stockMovementService = {
      deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      create: jest.fn().mockResolvedValue({}),
    };
    baseCostCalculator = {
      addStock: jest.fn(),
      removeStock: jest.fn(),
      calculateShippingByValue: jest.fn().mockReturnValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrderLifecycleService,
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepository },
        { provide: getRepositoryToken(VendorPayment), useValue: vpRepository },
        { provide: StockMovementService, useValue: stockMovementService },
        { provide: BaseCostCalculatorService, useValue: baseCostCalculator },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get(PurchaseOrderLifecycleService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cancel and uncancel', () => {
    it('cancel sets status CANCELLED when order is draft and unpaid', async () => {
      const orderRepo = {
        findOne: jest.fn().mockResolvedValue({ ...mockOrder }),
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb({ getRepository: () => orderRepo }));

      const result = await service.cancel('po-1', 'user-1', 'admin');

      expect(orderRepo.findOne).toHaveBeenCalled();
      expect(orderRepo.update).toHaveBeenCalledWith('po-1', expect.objectContaining({ status: PurchaseOrderStatus.CANCELLED }));
      expect(result.status).toBe(PurchaseOrderStatus.CANCELLED);
    });

    it('cancel rejects when payments were recorded', async () => {
      const orderRepo = {
        findOne: jest.fn().mockResolvedValue({
          ...mockOrder,
          status: PurchaseOrderStatus.DRAFT,
          paymentStatus: PurchaseOrderPaymentStatus.PARTIAL,
        }),
        update: jest.fn(),
      } as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb({ getRepository: () => orderRepo }));

      await expect(service.cancel('po-1')).rejects.toThrow(/recorded payments/i);
    });

    it('uncancel sets status DRAFT when order is cancelled', async () => {
      const orderRepo = {
        findOne: jest.fn().mockResolvedValue({
          ...mockOrder,
          status: PurchaseOrderStatus.CANCELLED,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb({ getRepository: () => orderRepo }));

      const result = await service.uncancel('po-1', 'user-1', 'admin');

      expect(orderRepo.update).toHaveBeenCalledWith('po-1', expect.objectContaining({ status: PurchaseOrderStatus.DRAFT }));
      expect(result.status).toBe(PurchaseOrderStatus.DRAFT);
    });
  });

  describe('assertStatusEditable', () => {
    it('does not throw for DRAFT', () => {
      expect(() =>
        PurchaseOrderLifecycleService.assertStatusEditable(PurchaseOrderStatus.DRAFT),
      ).not.toThrow();
    });

    it('does not throw for READY', () => {
      expect(() =>
        PurchaseOrderLifecycleService.assertStatusEditable(PurchaseOrderStatus.READY),
      ).not.toThrow();
    });

    it('throws "Return the goods first." for RECEIVED', () => {
      expect(() =>
        PurchaseOrderLifecycleService.assertStatusEditable(PurchaseOrderStatus.RECEIVED),
      ).toThrow('Return the goods first.');
    });

    it('throws "Uncancel the order first." for CANCELLED', () => {
      expect(() =>
        PurchaseOrderLifecycleService.assertStatusEditable(PurchaseOrderStatus.CANCELLED),
      ).toThrow('Uncancel the order first.');
    });
  });

  describe('receive and return', () => {
    it('receive posts stock + cost + GL and sets RECEIVED', async () => {
      const readyOrder = {
        ...mockOrder,
        status: PurchaseOrderStatus.READY,
        items: [
          {
            id: 'po-item-1',
            productId: 'product-1',
            quantity: 10,
            unitCost: 5,
            totalAmount: 50,
            receivedQuantity: 0,
            product: { id: 'product-1' },
          },
        ],
        subtotal: 50,
        shippingAmount: 0,
        supplier: { companyName: 'Acme' },
      } as any;

      const poRepo = {
        findOne: jest.fn()
          .mockResolvedValueOnce(readyOrder)
          .mockResolvedValueOnce(readyOrder),
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      const itemRepo = {
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === PurchaseOrder) return poRepo;
            if (entity === PurchaseOrderItem) return itemRepo;
            return {};
          },
        }),
      );

      const result = await service.receive('po-1', 'user-1', 'admin');

      expect(stockMovementService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: 'purchase_receipt',
          referenceType: 'purchase_order',
          referenceId: 'po-1',
        }),
        'user-1',
        expect.anything(),
      );
      expect(baseCostCalculator.addStock).toHaveBeenCalledWith(
        'product-1',
        'po-1',
        10,
        5,
        0,
        expect.any(Date),
        expect.anything(),
      );
      expect(result.status).toBe(PurchaseOrderStatus.RECEIVED);

      expect(poRepo.update).toHaveBeenCalledWith(
        'po-1',
        expect.objectContaining({
          status: PurchaseOrderStatus.RECEIVED,
          receivedDate: expect.any(Date),
        }),
      );
      expect(result.receivedDate).toBeInstanceOf(Date);
    });

    it('capitalizes inventory at the NET (after-discount) unit cost so GL matches the subledger', async () => {
      // unitCost 10, but line total 80 for qty 10 -> 20% line discount -> net 8/unit.
      // The GL entry debits inventory from item.totalAmount (80), so the cost
      // batch must also capitalize 8/unit, not the raw 10.
      const discountedOrder = {
        ...mockOrder,
        status: PurchaseOrderStatus.READY,
        items: [
          {
            id: 'po-item-1',
            productId: 'product-1',
            quantity: 10,
            unitCost: 10,
            totalAmount: 80,
            receivedQuantity: 0,
            product: { id: 'product-1' },
          },
        ],
        subtotal: 80,
        shippingAmount: 0,
        supplier: { companyName: 'Acme' },
      } as any;

      const poRepo = {
        findOne: jest.fn().mockResolvedValueOnce(discountedOrder).mockResolvedValueOnce(discountedOrder),
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      const itemRepo = { update: jest.fn().mockResolvedValue(undefined) } as any;
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === PurchaseOrder) return poRepo;
            if (entity === PurchaseOrderItem) return itemRepo;
            return {};
          },
        }),
      );
      await service.receive('po-1', 'user-1', 'admin');

      // 4th positional arg to addStock is the net unit cost = 80 / 10 = 8.
      expect(baseCostCalculator.addStock).toHaveBeenCalledWith(
        'product-1',
        'po-1',
        10,
        8,
        0,
        expect.any(Date),
        expect.anything(),
      );
      // Stock movement unitValue must also be the net cost.
      expect(stockMovementService.create).toHaveBeenCalledWith(
        expect.objectContaining({ unitValue: 8 }),
        'user-1',
        expect.anything(),
      );
    });

    it('return reverses stock + cost + GL and sets READY', async () => {
      const receivedOrder = {
        ...mockOrder,
        status: PurchaseOrderStatus.RECEIVED,
        receivedDate: new Date('2026-06-01'),
        items: [
          {
            id: 'po-item-1',
            productId: 'product-1',
            quantity: 10,
            unitCost: 5,
            receivedQuantity: 10,
            product: { id: 'product-1' },
          },
        ],
      } as any;

      const poRepo = {
        findOne: jest.fn()
          .mockResolvedValueOnce(receivedOrder)
          .mockResolvedValueOnce(receivedOrder),
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      const itemRepo = {
        update: jest.fn().mockResolvedValue(undefined),
      } as any;
      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === PurchaseOrder) return poRepo;
            if (entity === PurchaseOrderItem) return itemRepo;
            return {};
          },
        }),
      );

      const result = await service.return('po-1', 'user-1', 'admin');

      expect(baseCostCalculator.removeStock).toHaveBeenCalledWith(
        'product-1',
        'po-1',
        expect.anything(),
      );
      expect(stockMovementService.deleteByReference).toHaveBeenCalledWith(
        'purchase_order',
        'po-1',
        expect.anything(),
      );
      expect(result.status).toBe(PurchaseOrderStatus.READY);

      expect(poRepo.update).toHaveBeenCalledWith(
        'po-1',
        expect.objectContaining({
          status: PurchaseOrderStatus.READY,
          receivedDate: null,
        }),
      );
      expect(result.receivedDate).toBeNull();
    });
  });

});
