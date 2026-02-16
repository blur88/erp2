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
  let accountingService: jest.Mocked<AccountingService>;
  let stockMovementService: jest.Mocked<StockMovementService>;

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
          useValue: {},
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
          useValue: {},
        },
        {
          provide: BaseCostCalculatorService,
          useValue: {},
        },
        {
          provide: StockMovementService,
          useValue: {
            create: jest.fn(),
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
          },
        },
      ],
    }).compile();

    service = module.get<PurchaseOrderService>(PurchaseOrderService);
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    purchaseOrderItemRepository = module.get(getRepositoryToken(PurchaseOrderItem));
    productRepository = module.get(getRepositoryToken(Product));
    grnRepository = module.get(getRepositoryToken(GoodsReceivedNote));
    accountingService = module.get(AccountingService);
    stockMovementService = module.get(StockMovementService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jest.spyOn(service as any, 'updateBaseCostsForGrn').mockResolvedValue(undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue(mockReturnDto);

    purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrder);
    purchaseOrderRepository.update.mockResolvedValue({} as any);
    grnRepository.save.mockResolvedValue(mockReceivedGrn);
    productRepository.findOne.mockResolvedValue({ id: 'product-1' } as Product);
    stockMovementService.create.mockResolvedValue({} as any);
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
});
