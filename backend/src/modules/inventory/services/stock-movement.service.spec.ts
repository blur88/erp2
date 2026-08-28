import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockMovementService } from './stock-movement.service';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { OwnerEquityDocument } from '../../owner-equity/entities/owner-equity-document.entity';
import { ProductService } from './product.service';

describe('StockMovementService', () => {
  let service: StockMovementService;
  let stockMovementRepository: any;
  let productRepository: any;
  let purchaseOrderRepository: any;
  let salesOrderRepository: any;
  let ownerEquityDocumentRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockMovementService,
        {
          provide: getRepositoryToken(StockMovement),
          useValue: {
            create: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
            findOne: (jest.fn as unknown as any)(),
            createQueryBuilder: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            save: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
            findOne: (jest.fn as unknown as any)(),
            createQueryBuilder: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: { find: (jest.fn as unknown as any)(), findOne: (jest.fn as unknown as any)() },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { find: (jest.fn as unknown as any)(), findOne: (jest.fn as unknown as any)() },
        },
        {
          provide: getRepositoryToken(OwnerEquityDocument),
          useValue: { find: (jest.fn as unknown as any)(), findOne: (jest.fn as unknown as any)() },
        },
        {
          provide: ProductService,
          useValue: {
            updateStockQuantity: (jest.fn as unknown as any)(),
          },
        },
        {
          // #1076: create()/deleteByReference()/reverseMovement() open their own
          // transaction when no manager is supplied, so the service now needs a
          // DataSource. The stub runs the callback against a manager whose
          // getRepository() returns the same mocks the tests already assert on,
          // and whose lock-read resolves to the mocked product.
          provide: DataSource,
          useValue: {
            transaction: (jest.fn as unknown as any)((cb: any) =>
              cb({
                getRepository: (entity: any) =>
                  entity === StockMovement
                    ? stockMovementRepository
                    : productRepository,
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<StockMovementService>(StockMovementService);
    stockMovementRepository = module.get(getRepositoryToken(StockMovement));
    productRepository = module.get(getRepositoryToken(Product));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    ownerEquityDocumentRepository = module.get(
      getRepositoryToken(OwnerEquityDocument),
    );

    // Silence logger output during tests
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteByReference', () => {
    it('returns deletedCount 0 when there are no movements', async () => {
      stockMovementRepository.find.mockResolvedValue([]);

      const result = await service.deleteByReference('sales_order', 'order-1');

      expect(result.deletedCount).toBe(0);
    });

    it('deleteByReference reads movements through the supplied manager', async () => {
      const find = (jest.fn as unknown as any)().mockResolvedValue([]); // no movements → early return { deletedCount: 0 }
      const manager = {
        getRepository: (jest.fn as unknown as any)().mockReturnValue({ find }),
      } as any;

      const result = await service.deleteByReference(
        'sales_order',
        'order-1',
        manager,
      );

      expect(manager.getRepository).toHaveBeenCalled();
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { referenceType: 'sales_order', referenceId: 'order-1' },
        }),
      );
      expect(result).toEqual({ deletedCount: 0 });
    });
  });

  function makeMovement(overrides: Partial<StockMovement>): StockMovement {
    return {
      id: 'm1',
      movementType: 'initial_stock' as any,
      movementDate: new Date(),
      quantity: 10,
      previousBalance: 0,
      newBalance: 10,
      referenceType: undefined,
      referenceId: undefined,
      product: { id: 'p1', name: 'Test', barcode: 'SKU001' } as any,
      isInward: true,
      isOutward: false,
      getDescription: () => '',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as StockMovement;
  }

  function mockQueryBuilder(movements: StockMovement[], total: number) {
    const qb: any = {
      leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
      where: (jest.fn as unknown as any)().mockReturnThis(),
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([movements, total]),
    };
    (stockMovementRepository.createQueryBuilder as any).mockReturnValue(qb);
    return qb;
  }

  describe('referenceNumber population', () => {
    it('populates referenceNumber from the related PO for purchase_order movements', async () => {
      const movements = [
        makeMovement({ id: 'm1', referenceType: 'purchase_order', referenceId: 'po-1' }),
        makeMovement({ id: 'm2', referenceType: 'initial_stock', referenceId: null }),
      ];
      mockQueryBuilder(movements, 2);
      (purchaseOrderRepository.find as any).mockResolvedValue([
        { id: 'po-1', orderNumber: 'PO-26-028' } as any,
      ]);
      (salesOrderRepository.find as any).mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data[0].referenceNumber).toBe('PO-26-028');
      expect(result.data[1].referenceNumber).toBeUndefined();
    });

    it('batches: one PO find and one SO find per page, no per-row queries', async () => {
      const movements = [
        makeMovement({ id: 'm1', referenceType: 'purchase_order', referenceId: 'po-1' }),
        makeMovement({ id: 'm2', referenceType: 'purchase_order', referenceId: 'po-2' }),
      ];
      mockQueryBuilder(movements, 2);
      (purchaseOrderRepository.find as any).mockResolvedValue([
        { id: 'po-1', orderNumber: 'PO-1' } as any,
        { id: 'po-2', orderNumber: 'PO-2' } as any,
      ]);
      (salesOrderRepository.find as any).mockResolvedValue([]);
      (ownerEquityDocumentRepository.find as any).mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 20 } as any);

      expect(purchaseOrderRepository.find).toHaveBeenCalledTimes(1);
      expect(salesOrderRepository.find).not.toHaveBeenCalled();
      expect(ownerEquityDocumentRepository.find).not.toHaveBeenCalled();
    });

    it('falls back to undefined when the referenced order is missing', async () => {
      const movements = [
        makeMovement({ id: 'm1', referenceType: 'sales_order', referenceId: 'gone' }),
      ];
      mockQueryBuilder(movements, 1);
      (purchaseOrderRepository.find as any).mockResolvedValue([]);
      (salesOrderRepository.find as any).mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data[0].referenceNumber).toBeUndefined();
    });

    it('resolveReferenceNumber reads through the transaction manager when given one', async () => {
      const managerPoRepo = { findOne: (jest.fn as unknown as any)().mockResolvedValue({ id: 'po-1', orderNumber: 'PO-TX' }) };
      const manager = { getRepository: (jest.fn as unknown as any)().mockReturnValue(managerPoRepo) } as any;

      const result = await (service as any).resolveReferenceNumber('purchase_order', 'po-1', manager);

      expect(manager.getRepository).toHaveBeenCalledWith(PurchaseOrder);
      expect(managerPoRepo.findOne).toHaveBeenCalled();
      expect(result).toBe('PO-TX');
      expect(purchaseOrderRepository.findOne).not.toHaveBeenCalled();
    });

    it('resolveReferenceNumber falls back to the injected repo when no manager is given', async () => {
      (purchaseOrderRepository.findOne as any).mockResolvedValue({ id: 'po-1', orderNumber: 'PO-NOTX' } as any);

      const result = await (service as any).resolveReferenceNumber('purchase_order', 'po-1');

      expect(purchaseOrderRepository.findOne).toHaveBeenCalled();
      expect(result).toBe('PO-NOTX');
    });

    it('populates referenceNumber from the Owner Equity document for owner_equity movements', async () => {
      // Both an owner drawing and its reversal carry referenceType
      // 'owner_equity' and point at the same document (#1022) — the frontend
      // View action needs this number, since the Owner Equity API is keyed by
      // reference number and has no by-id endpoint.
      const movements = [
        makeMovement({ id: 'm1', referenceType: 'owner_equity', referenceId: 'oe-1' }),
        makeMovement({ id: 'm2', referenceType: 'owner_equity', referenceId: 'oe-1' }),
      ];
      mockQueryBuilder(movements, 2);
      (purchaseOrderRepository.find as any).mockResolvedValue([]);
      (salesOrderRepository.find as any).mockResolvedValue([]);
      (ownerEquityDocumentRepository.find as any).mockResolvedValue([
        { id: 'oe-1', referenceNumber: 'OE-26-004' } as any,
      ]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data[0].referenceNumber).toBe('OE-26-004');
      expect(result.data[1].referenceNumber).toBe('OE-26-004');
      expect(ownerEquityDocumentRepository.find).toHaveBeenCalledTimes(1);
    });

    it('leaves referenceNumber undefined when the Owner Equity document is missing', async () => {
      const movements = [
        makeMovement({ id: 'm1', referenceType: 'owner_equity', referenceId: 'gone' }),
      ];
      mockQueryBuilder(movements, 1);
      (purchaseOrderRepository.find as any).mockResolvedValue([]);
      (salesOrderRepository.find as any).mockResolvedValue([]);
      (ownerEquityDocumentRepository.find as any).mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data[0].referenceNumber).toBeUndefined();
    });

    it('resolveReferenceNumber resolves an owner_equity reference', async () => {
      (ownerEquityDocumentRepository.findOne as any).mockResolvedValue({
        id: 'oe-1',
        referenceNumber: 'OE-26-004',
      } as any);

      const result = await (service as any).resolveReferenceNumber('owner_equity', 'oe-1');

      expect(result).toBe('OE-26-004');
    });

    it('findOne returns referenceNumber resolved from the related order', async () => {
      const movement = makeMovement({
        id: 'm1',
        referenceType: 'sales_order',
        referenceId: 'so-1',
      });
      (stockMovementRepository.findOne as any).mockResolvedValue(movement);
      (salesOrderRepository.findOne as any).mockResolvedValue({ id: 'so-1', orderNumber: 'SO-26-027' } as any);

      const result = await service.findOne('m1');

      expect(result.referenceNumber).toBe('SO-26-027');
    });
  });

  describe('pagination', () => {
    function mockQb(movements: StockMovement[], total: number) {
      const qb: any = {
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
        skip: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([movements, total]),
      };
      (stockMovementRepository.createQueryBuilder as any).mockReturnValue(qb);
      return qb;
    }

    it('returns full set when page/limit absent', async () => {
      const movements = [makeMovement({ id: 'm1' }), makeMovement({ id: 'm2' })];
      const qb = mockQb(movements, 2);
      (purchaseOrderRepository.find as any).mockResolvedValue([]);
      (salesOrderRepository.find as any).mockResolvedValue([]);
      const result = await service.findAll({} as any);
      expect(qb.skip).not.toHaveBeenCalled();
      expect(qb.take).not.toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
    });

    it('paginates when page/limit present', async () => {
      const movements = [makeMovement({ id: 'm1' })];
      const qb = mockQb(movements, 10);
      (purchaseOrderRepository.find as any).mockResolvedValue([]);
      (salesOrderRepository.find as any).mockResolvedValue([]);
      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });
});
