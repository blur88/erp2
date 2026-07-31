import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockAdjustmentService } from './stock-adjustment.service';
import { StockAdjustment, StockAdjustmentItem, StockAdjustmentStatus } from '../../../database/entities/stock-adjustment.entity';
import { Product, ProductType } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import { StockMovementService } from './stock-movement.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { StockAdjustmentItemDto } from '../dto/stock-adjustment.dto';

describe('StockAdjustmentService', () => {
  let service: StockAdjustmentService;
  let stockAdjustmentRepository: jest.Mocked<Repository<StockAdjustment>>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;
  let stockMovementRepository: jest.Mocked<Repository<StockMovement>>;
  let productRepository: jest.Mocked<Repository<Product>>;
  let stockAdjustmentItemRepository: jest.Mocked<Repository<StockAdjustmentItem>>;
  let accountingPort: { postStockAdjustment: jest.Mock; reverseEntriesForDocument: jest.Mock };

  const createMockStockAdjustment = (status: StockAdjustmentStatus = StockAdjustmentStatus.DRAFT): Partial<StockAdjustment> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    adjustmentNumber: 'SA-000001',
    adjustmentDate: '2026-02-06',
    status,
    itemCount: 2,
    totalValue: 150,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        oldQuantity: 100,
        newQuantity: 110,
        difference: 10,
        unitCost: 10,
        totalValue: 100,
        product: {
          id: 'product-1',
          name: 'Test Product 1',
          baseCost: 10,
        } as Product,
      } as StockAdjustmentItem,
      {
        id: 'item-2',
        productId: 'product-2',
        oldQuantity: 50,
        newQuantity: 45,
        difference: -5,
        unitCost: 10,
        totalValue: 50,
        product: {
          id: 'product-2',
          name: 'Test Product 2',
          baseCost: 10,
        } as Product,
      } as StockAdjustmentItem,
    ],
    isEditable: function() {
      return this.status === StockAdjustmentStatus.DRAFT;
    },
    canComplete: function() {
      return this.status === StockAdjustmentStatus.DRAFT;
    },
  });

  beforeEach(async () => {
    // Mock QueryRunner for transaction support
    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      transaction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockAdjustmentService,
        {
          provide: getRepositoryToken(StockAdjustment),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StockAdjustmentItem),
          useValue: {
            save: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findBy: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(StockMovement),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
        {
          provide: StockMovementService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: ACCOUNTING_POSTING_PORT,
          useValue: {
            postStockAdjustment: jest.fn(),
            postPurchasePayment: jest.fn(),
            reverseEntriesForDocument: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockAdjustmentService>(StockAdjustmentService);
    stockAdjustmentRepository = module.get(getRepositoryToken(StockAdjustment));
    stockMovementService = module.get(StockMovementService);
    auditLogService = module.get(AuditLogService);
    stockMovementRepository = module.get(getRepositoryToken(StockMovement));
    productRepository = module.get(getRepositoryToken(Product));
    stockAdjustmentItemRepository = module.get(getRepositoryToken(StockAdjustmentItem));
    accountingPort = module.get(ACCOUNTING_POSTING_PORT) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('duplicate product rejection', () => {
    it('create() throws BadRequestException when the same productId appears twice', async () => {
      const dto = {
        adjustmentDate: '2026-07-20',
        items: [
          { productId: 'p1', oldQuantity: 0, newQuantity: 1, difference: 1 },
          { productId: 'p1', oldQuantity: 0, newQuantity: 2, difference: 2 },
        ],
      } as any;
      await expect(service.create(dto)).rejects.toThrow('Duplicate product');
    });
  });

  describe('findAll filters', () => {
    it('joins product and adds product.name to search + category filter', async () => {
      const calls: { sql: string; params?: any }[] = [];
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((sql: string, params?: any) => { calls.push({ sql, params }); return qb; }),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      jest.spyOn(stockAdjustmentRepository, 'createQueryBuilder').mockReturnValue(qb);
      await service.findAll({ search: 'widget', categoryId: 'cat-1' } as any);
      const joinedSql = calls.map(c => c.sql).join(' | ');
      expect(joinedSql).toContain('product.name');
      expect(joinedSql).toContain('product.categoryId');
    });
  });

  describe('findOne enrichment', () => {
    it('completed adjustment populates stockBefore/stockAfter from StockMovement and liveStock from product', async () => {
      const adjustment: any = {
        id: 'a1', adjustmentNumber: 'SA-000001', status: 'completed',
        adjustmentDate: '2026-07-20', itemCount: 1, totalValue: 10, createdAt: new Date(), updatedAt: new Date(),
        isEditable: () => false, canComplete: () => false,
        items: [{ id: 'i1', productId: 'p1', oldQuantity: 5, newQuantity: 7, difference: 2, unitCost: 5, totalValue: 10,
          isIncrease: true, isDecrease: false, absoluteDifference: 2,
          product: { id: 'p1', name: 'Widget', barcode: 'B1', stockQuantity: 7 } }],
      };
      jest.spyOn(stockAdjustmentRepository, 'findOne').mockResolvedValue(adjustment);
      jest.spyOn(stockMovementRepository, 'findOne').mockResolvedValue({ previousBalance: 5, newBalance: 7 } as any);

      const result = await service.findOne('a1');
      expect(result.items[0].liveStock).toBe(7);
      expect(result.items[0].stockBefore).toBe(5);
      expect(result.items[0].stockAfter).toBe(7);
    });

    it('draft adjustment returns null stockBefore/stockAfter and liveStock from product', async () => {
      const adjustment: any = {
        id: 'a2', adjustmentNumber: 'SA-000002', status: 'draft',
        adjustmentDate: '2026-07-20', itemCount: 1, totalValue: 0, createdAt: new Date(), updatedAt: new Date(),
        isEditable: () => true, canComplete: () => true,
        items: [{ id: 'i2', productId: 'p2', oldQuantity: 3, newQuantity: 4, difference: 1,
          isIncrease: true, isDecrease: false, absoluteDifference: 1,
          product: { id: 'p2', name: 'Gadget', barcode: 'B2', stockQuantity: 3 } }],
      };
      jest.spyOn(stockAdjustmentRepository, 'findOne').mockResolvedValue(adjustment);
      const result = await service.findOne('a2');
      expect(result.items[0].liveStock).toBe(3);
      expect(result.items[0].stockBefore).toBeNull();
      expect(result.items[0].stockAfter).toBeNull();
    });
  });

  describe('service product rejection', () => {
  const serviceProduct = { id: 'svc-1', type: ProductType.SERVICE, baseCost: 5 } as any

  it('create() rejects service products', async () => {
    productRepository.findBy.mockResolvedValue([serviceProduct])
    await expect(
      service.create({ adjustmentDate: '2026-07-05', items: [{ productId: 'svc-1', oldQuantity: 0, newQuantity: 1, difference: 1 }] } as any),
    ).rejects.toThrow('Service products are not valid for stock adjustments')
  })

  it('update() rejects service products', async () => {
    stockAdjustmentRepository.findOne.mockResolvedValue({ id: 'sa-1', isEditable: () => true, items: [] } as any)
    productRepository.findBy.mockResolvedValue([serviceProduct])
    await expect(
      service.update('sa-1', { items: [{ productId: 'svc-1', oldQuantity: 0, newQuantity: 1, difference: 1 }] } as any),
    ).rejects.toThrow('Service products are not valid for stock adjustments')
  })

  it('update() rejection does not reach the delete/save path', async () => {
    stockAdjustmentRepository.findOne.mockResolvedValue({ id: 'sa-1', isEditable: () => true, items: [] } as any)
    productRepository.findBy.mockResolvedValue([serviceProduct])
    await expect(
      service.update('sa-1', { items: [{ productId: 'svc-1', oldQuantity: 0, newQuantity: 1, difference: 1 }] } as any),
    ).rejects.toThrow()
    expect(stockAdjustmentItemRepository.delete).not.toHaveBeenCalled()
    expect(stockAdjustmentItemRepository.save).not.toHaveBeenCalled()
    expect(stockAdjustmentRepository.save).not.toHaveBeenCalled()
  })

  describe('create() derives newQuantity', () => {
    // Matches the `serviceProduct` fixture style above — the property is
    // `type`, and the stocked-goods member is GOODS ('Stocked Product').
    const stockProduct = { id: 'p-1', type: ProductType.GOODS, baseCost: 10 } as any;

    beforeEach(() => {
      productRepository.findBy.mockResolvedValue([stockProduct]);
      stockAdjustmentRepository.create.mockImplementation((dto: any) => dto);
      stockAdjustmentItemRepository.create.mockImplementation((dto: any) => dto as any);
      stockAdjustmentRepository.save.mockImplementation(async (entity: any) => ({
        ...entity,
        id: 'sa-new',
      }));
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'sa-new' } as any);
    });

    it('derives newQuantity from oldQuantity + difference', async () => {
      await service.create({
        adjustmentDate: '2026-07-31',
        items: [{ productId: 'p-1', oldQuantity: 100, difference: 10 }],
      } as any);

      const saved = stockAdjustmentRepository.save.mock.calls[0][0] as any;
      expect(saved.items[0].newQuantity).toBe('110.0000');
    });

    it('ignores a client-supplied newQuantity', async () => {
      await service.create({
        adjustmentDate: '2026-07-31',
        items: [{ productId: 'p-1', oldQuantity: 100, difference: 10, newQuantity: 999 }],
      } as any);

      const saved = stockAdjustmentRepository.save.mock.calls[0][0] as any;
      expect(saved.items[0].newQuantity).toBe('110.0000');
    });

    it('rejects a negative derived quantity, naming the item one-based', async () => {
      await expect(
        service.create({
          adjustmentDate: '2026-07-31',
          items: [{ productId: 'p-1', oldQuantity: 10, difference: -50 }],
        } as any),
      ).rejects.toThrow(/Item 1 \(product p-1\).*negative quantity/);
    });

    it('accepts a derived quantity of exactly zero', async () => {
      await service.create({
        adjustmentDate: '2026-07-31',
        items: [{ productId: 'p-1', oldQuantity: 0.0001, difference: -0.0001 }],
      } as any);

      const saved = stockAdjustmentRepository.save.mock.calls[0][0] as any;
      expect(saved.items[0].newQuantity).toBe('0.0000');
    });

    it('converts a helper range failure into a 400, not a 500', async () => {
      await expect(
        service.create({
          adjustmentDate: '2026-07-31',
          items: [{ productId: 'p-1', oldQuantity: 99999999999, difference: 1 }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  })
})

describe('complete and revert', () => {
  beforeEach(() => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'sa-1' } as any);
  });

  it('complete posts STOCK_ADJUSTMENT JE with directional amounts inside txn', async () => {
    const draft = createMockStockAdjustment(StockAdjustmentStatus.DRAFT);
    const items = draft.items!;
    const mockManager = {
      findOne: jest.fn().mockResolvedValue(draft), // header lock now runs on the txn manager
      find: jest.fn().mockResolvedValue(items),
      save: jest.fn(),
    };
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(mockManager),
    );
    (stockMovementService.create as jest.Mock).mockResolvedValue({});

    await service.complete('sa-1', 'user-1', 'admin');

    expect(stockMovementService.create).toHaveBeenCalledTimes(2);
    expect(accountingPort.postStockAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustmentId: '123e4567-e89b-12d3-a456-426614174000',
        sourceRef: 'SA-000001',
        increaseAmount: '100.0000',
        decreaseAmount: '50.0000',
      }),
      mockManager,
    );
    expect(mockManager.save).toHaveBeenCalled();
  });

  it('revert reverses stock + JE and sets REVERTED', async () => {
    const completed = createMockStockAdjustment(StockAdjustmentStatus.COMPLETED);
    const items = completed.items!;
    const mockManager = {
      findOne: jest.fn().mockResolvedValue(completed), // header lock now runs on the txn manager
      find: jest.fn().mockResolvedValue(items),
      save: jest.fn(),
    };
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(mockManager),
    );
    (stockMovementService.create as jest.Mock).mockResolvedValue({});

    await service.revert('sa-1', 'user-1', 'admin');

    expect(stockMovementService.create).toHaveBeenCalledTimes(2);
    expect(accountingPort.reverseEntriesForDocument).toHaveBeenCalledWith(
      'STOCK_ADJUSTMENT',
      'sa-1',
      ['STOCK_ADJUSTMENT'],
      expect.any(String),
      mockManager,
      'admin',
    );
    expect(mockManager.save).toHaveBeenCalled();
  });
});

describe('updateNotes', () => {
    it('updates notes on a completed adjustment without changing status/items', async () => {
      const adjustment: any = { id: 'a1', adjustmentNumber: 'SA-1', status: 'completed', notes: 'old', items: [] };
      jest.spyOn(stockAdjustmentRepository, 'findOne').mockResolvedValue(adjustment);
      jest.spyOn(stockAdjustmentRepository, 'save').mockImplementation(async (a: any) => a);
      const findOneSpy = jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'a1', notes: 'new', status: 'completed' } as any);

      const result = await service.updateNotes('a1', 'new');
      expect(adjustment.notes).toBe('new');
      expect(adjustment.status).toBe('completed');
      expect(result.notes).toBe('new');
      findOneSpy.mockRestore();
    });
  });

  describe('deriveNewQuantityMinor', () => {
    const derive = (old: number, diff: number): bigint =>
      (service as any).deriveNewQuantityMinor(old, diff);

    it('adds operands at scale-4 precision', () => {
      expect(derive(100, 10)).toBe(1100000n);
    });

    it('returns exactly zero at the scale-4 boundary', () => {
      // 0.0001 + (-0.0001) must land on 0, not a float near-zero.
      expect(derive(0.0001, -0.0001)).toBe(0n);
    });

    it('allows a negative result (the caller owns that rule, not the helper)', () => {
      expect(derive(10, -50)).toBe(-400000n);
    });

    it('accepts a negative oldQuantity snapshot (oversell)', () => {
      expect(derive(-5, 15)).toBe(100000n);
    });

    it('throws a plain Error, not an HttpException, on unconvertible input', () => {
      // 1e21 stringifies to "1e+21", which toMinorUnits' regex rejects.
      expect(() => derive(1e21, 0)).toThrow(Error);
      expect(() => derive(1e21, 0)).not.toThrow(BadRequestException);
    });

    it('rejects an operand beyond NUMERIC(15,4)', () => {
      expect(() => derive(100000000000, 0)).toThrow(/exceeds the supported range/);
    });

    it('rejects a sum beyond NUMERIC(15,4) built from two in-range operands', () => {
      // Each operand fits 11 integer digits; the sum does not.
      expect(() => derive(99999999999, 1)).toThrow(/exceeds the supported range/);
    });
  });
});

describe('StockAdjustmentItemDto', () => {
  it('allows negative oldQuantity because it is the current stock snapshot', async () => {
    const dto = new StockAdjustmentItemDto();
    dto.productId = '123e4567-e89b-42d3-a456-426614174000';
    dto.oldQuantity = -5;
    dto.newQuantity = 10;
    dto.difference = 15;

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects negative newQuantity because target stock must be non-negative', async () => {
    const dto = new StockAdjustmentItemDto();
    dto.productId = '123e4567-e89b-42d3-a456-426614174000';
    dto.oldQuantity = -5;
    dto.newQuantity = -1;
    dto.difference = 4;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'newQuantity')).toBe(true);
  });
});
