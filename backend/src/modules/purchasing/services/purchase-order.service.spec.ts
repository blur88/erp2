import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
  GoodsReceivedNote,
  VendorPayment,
} from '../../../database/entities';
import { GrnStatus } from '../../../database/entities/goods-received-note.entity';
import { SupplierService } from './supplier.service';
import { GoodsReceivedNoteService } from './goods-received-note.service';
import { VendorPaymentService } from './vendor-payment.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';

describe('PurchaseOrderService', () => {
  let service: PurchaseOrderService;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let purchaseOrderItemRepository: jest.Mocked<Repository<PurchaseOrderItem>>;
  let productRepository: jest.Mocked<Repository<Product>>;
  let grnRepository: jest.Mocked<Repository<GoodsReceivedNote>>;
  let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
  let accountingService: jest.Mocked<AccountingService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let vendorPaymentService: jest.Mocked<VendorPaymentService>;
  let grnService: jest.Mocked<GoodsReceivedNoteService>;

  const mockPurchaseOrder = {
    id: 'po-1',
    orderNumber: 'PO-000001',
    items: [
      {
        id: 'po-item-1',
        productId: 'product-1',
        quantity: 10,
        unitCost: 20,
        receivedQuantity: 0,
      },
    ],
    supplier: {
      id: 'supplier-1',
      companyName: 'Supplier A',
    },
  } as unknown as PurchaseOrder;

  const mockDraftGrn = {
    id: 'grn-1',
    grnNumber: 'GRN-000001',
    purchaseOrderId: 'po-1',
    receivedDate: new Date('2024-01-15'),
    status: GrnStatus.DRAFT,
    items: [
      {
        id: 'grn-item-1',
        grnId: 'grn-1',
        productId: 'product-1',
        orderedQuantity: 10,
        receivedQuantity: 0,
        purchaseOrderItemId: 'po-item-1',
      },
    ],
    calculateTotals: jest.fn(),
  } as unknown as GoodsReceivedNote;

  const mockReceivedGrn = {
    ...mockDraftGrn,
    status: GrnStatus.RECEIVED,
    items: [
      {
        id: 'grn-item-1',
        grnId: 'grn-1',
        productId: 'product-1',
        orderedQuantity: 10,
        receivedQuantity: 10,
        purchaseOrderItemId: 'po-item-1',
      },
    ],
  } as unknown as GoodsReceivedNote;

  const mockReceivedGrnWithRelations = {
    ...mockReceivedGrn,
    supplier: mockPurchaseOrder.supplier,
    purchaseOrder: mockPurchaseOrder,
  } as unknown as GoodsReceivedNote;

  const mockReturnDto = {
    id: 'po-1',
    orderNumber: 'PO-000001',
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrderService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrderItem),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(GoodsReceivedNote),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
          },
        },
        {
          provide: SupplierService,
          useValue: {},
        },
        {
          provide: GoodsReceivedNoteService,
          useValue: {
            updateGrnItems: jest.fn(),
          },
        },
        {
          provide: VendorPaymentService,
          useValue: {
            findAllByPurchaseOrder: jest.fn(),
            softDeleteForUnpay: jest.fn(),
            create: jest.fn(),
            findOne: jest.fn(),
            findByPurchaseOrder: jest.fn(),
            createForPurchaseOrder: jest.fn(),
          },
        },
        {
          provide: BaseCostCalculatorService,
          useValue: {},
        },
        {
          provide: StockMovementService,
          useValue: {
            create: jest.fn(),
            deleteByReference: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {},
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: AccountingService,
          useValue: {
            postGoodsReceivedEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
            postVendorPaymentEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PurchaseOrderService>(PurchaseOrderService);
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    purchaseOrderItemRepository = module.get(getRepositoryToken(PurchaseOrderItem));
    productRepository = module.get(getRepositoryToken(Product));
    grnRepository = module.get(getRepositoryToken(GoodsReceivedNote));
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    accountingService = module.get(AccountingService);
    stockMovementService = module.get(StockMovementService);
    vendorPaymentService = module.get(VendorPaymentService);
    grnService = module.get(GoodsReceivedNoteService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jest.spyOn(service as any, 'updateBaseCostsForGrn').mockResolvedValue(undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue(mockReturnDto);

    purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrder);
    purchaseOrderRepository.update.mockResolvedValue({} as any);
    purchaseOrderRepository.save.mockResolvedValue(mockPurchaseOrder);
    grnRepository.save.mockResolvedValue(mockReceivedGrn);
    productRepository.findOne.mockResolvedValue({ id: 'product-1' } as Product);
    stockMovementService.create.mockResolvedValue({} as any);
    stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 1 } as any);
    purchaseOrderItemRepository.save.mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('receiveGoods', () => {
    it('posts accounting entry after receiving goods', async () => {
      grnRepository.findOne
        .mockResolvedValueOnce(mockDraftGrn)
        .mockResolvedValueOnce(mockReceivedGrn)
        .mockResolvedValueOnce(mockReceivedGrnWithRelations);

      accountingService.postGoodsReceivedEntry.mockResolvedValue({} as any);

      await service.receiveGoods('po-1');

      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledTimes(1);
      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledWith(
        mockReceivedGrnWithRelations,
        'system',
      );
    });
  });

  describe('markAsUnpaid', () => {
    const mockPayment = {
      id: 'vp-1',
      paymentNumber: 'VP-000001',
      amount: 200,
    } as VendorPayment;

    const mockPaidOrder = {
      ...mockPurchaseOrder,
      paidAmount: 200,
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPaidOrder);
      grnRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([mockPayment]);
      vendorPaymentService.softDeleteForUnpay.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      purchaseOrderRepository.save.mockResolvedValue(mockPaidOrder);
    });

    it('reverses accounting entries for each vendor payment', async () => {
      await service.markAsUnpaid('po-1');
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'vendor_payment',
        'vp-1',
        'system',
      );
    });

    it('soft-deletes vendor payments instead of hard-deleting', async () => {
      await service.markAsUnpaid('po-1');
      expect(vendorPaymentService.softDeleteForUnpay).toHaveBeenCalledWith('vp-1');
    });

    it('resets paidAmount to 0', async () => {
      await service.markAsUnpaid('po-1');
      expect(purchaseOrderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: 0 }),
      );
    });
  });

  describe('returnGoods', () => {
    beforeEach(() => {
      const receivedGrn = {
        ...mockReceivedGrn,
        status: GrnStatus.RECEIVED,
        items: [...mockReceivedGrn.items],
        calculateTotals: jest.fn(),
      } as any;
      const draftGrn = {
        ...receivedGrn,
        status: GrnStatus.DRAFT,
      } as any;

      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrder,
        supplierId: 'supplier-1',
      } as any);
      grnRepository.findOne.mockResolvedValue(receivedGrn);
      grnRepository.save.mockResolvedValue(draftGrn);
      jest.spyOn(service as any, 'reverseBaseCostsForGrn').mockResolvedValue(undefined);
      grnService.updateGrnItems.mockResolvedValue(undefined);
      stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 1 } as any);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      purchaseOrderItemRepository.save.mockResolvedValue({} as any);
      purchaseOrderRepository.update.mockResolvedValue({} as any);
    });

    it('reverses the GRN accounting entry after returning goods', async () => {
      await service.returnGoods('po-1');
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'goods_received_note',
        'grn-1',
        'system',
      );
    });

    it('still succeeds even if accounting reversal fails', async () => {
      accountingService.reverseSourceEntries.mockRejectedValue(new Error('No fiscal period'));
      await expect(service.returnGoods('po-1')).resolves.not.toThrow();
    });
  });

  describe('recordOrderPayments', () => {
    const mockDeletedPayment = {
      id: 'vp-old-1',
      paymentNumber: 'VP-000001',
      purchaseOrderId: 'po-1',
      deletedAt: new Date('2026-02-19'),
      isActive: false,
      paymentMethodId: 'pm-bank',
      amount: 100,
    } as unknown as VendorPayment;

    const mockRestoredPayment = {
      ...mockDeletedPayment,
      deletedAt: null,
      isActive: true,
    } as unknown as VendorPayment;

    const mockPurchaseOrderForPayment = {
      ...mockPurchaseOrder,
      supplierId: 'supplier-1',
      paidAmount: 0,
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrderForPayment);
      purchaseOrderRepository.save.mockResolvedValue(mockPurchaseOrderForPayment);
      vendorPaymentService.findOne.mockResolvedValue(mockRestoredPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue(undefined);
    });

    it('creates a new vendor payment when no previous soft-deleted payment exists', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      expect(vendorPaymentService.create).toHaveBeenCalled();
      expect(vendorPaymentRepository.restore).not.toHaveBeenCalled();
    });

    it('restores the previous soft-deleted payment on re-pay', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(mockDeletedPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.save.mockResolvedValue(mockRestoredPayment);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      expect(vendorPaymentRepository.restore).toHaveBeenCalledWith('vp-old-1');
    });

    it('updates payment method and amount when restoring', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(mockDeletedPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.save.mockResolvedValue(mockRestoredPayment);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 300 }]);

      expect(vendorPaymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodId: 'pm-cash', amount: 300, isActive: true }),
      );
    });

    it('re-posts accounting entry after restoring', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(mockDeletedPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.save.mockResolvedValue(mockRestoredPayment);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledWith(
        mockRestoredPayment,
        'system',
      );
    });
  });
});
