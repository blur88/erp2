import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StockAdjustmentService } from './stock-adjustment.service';
import { StockAdjustment, StockAdjustmentItem, StockAdjustmentStatus } from '../../../database/entities/stock-adjustment.entity';
import { Product } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import { StockMovementService } from './stock-movement.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { StockAdjustmentItemDto } from '../dto/stock-adjustment.dto';

describe('StockAdjustmentService', () => {
  let service: StockAdjustmentService;
  let stockAdjustmentRepository: jest.Mocked<Repository<StockAdjustment>>;
  let accountingService: jest.Mocked<AccountingService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;
  let stockMovementRepository: jest.Mocked<Repository<StockMovement>>;

  const createMockStockAdjustment = (status: StockAdjustmentStatus = StockAdjustmentStatus.DRAFT): Partial<StockAdjustment> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    adjustmentNumber: 'SA-000001',
    adjustmentDate: new Date('2026-02-06'),
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
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {},
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
          provide: AccountingService,
          useValue: {
            postStockAdjustmentEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockAdjustmentService>(StockAdjustmentService);
    stockAdjustmentRepository = module.get(getRepositoryToken(StockAdjustment));
    accountingService = module.get(AccountingService);
    stockMovementService = module.get(StockMovementService);
    auditLogService = module.get(AuditLogService);
    stockMovementRepository = module.get(getRepositoryToken(StockMovement));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('complete', () => {
    it('should post accounting entry successfully', async () => {
      // Arrange
      const mockAdjustment = createMockStockAdjustment();
      const adjustmentId = mockAdjustment.id;
      const completedAdjustment = createMockStockAdjustment(StockAdjustmentStatus.COMPLETED);

      // First call returns draft, subsequent calls return completed
      let callCount = 0;
      stockAdjustmentRepository.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockAdjustment as StockAdjustment);
        }
        return Promise.resolve(completedAdjustment as StockAdjustment);
      });

      stockMovementService.create.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);

      accountingService.postStockAdjustmentEntry.mockResolvedValue({
        id: 'journal-1',
        referenceNumber: 'JE-000001',
      } as any);

      // Act
      const result = await service.complete(adjustmentId);

      // Assert
      expect(accountingService.postStockAdjustmentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: adjustmentId,
          adjustmentNumber: mockAdjustment.adjustmentNumber,
        }),
        'system',
        undefined,
      );
      expect(result).toBeDefined();
      expect(stockMovementService.create).toHaveBeenCalled();
    });

    it('should continue when accounting post fails', async () => {
      // Arrange
      const mockAdjustment = createMockStockAdjustment();
      const adjustmentId = mockAdjustment.id;
      const completedAdjustment = createMockStockAdjustment(StockAdjustmentStatus.COMPLETED);

      // First call returns draft, subsequent calls return completed
      let callCount = 0;
      stockAdjustmentRepository.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockAdjustment as StockAdjustment);
        }
        return Promise.resolve(completedAdjustment as StockAdjustment);
      });

      stockMovementService.create.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);

      accountingService.postStockAdjustmentEntry.mockRejectedValue(
        new Error('Account mappings not configured'),
      );

      // Act
      const result = await service.complete(adjustmentId);

      // Assert
      expect(accountingService.postStockAdjustmentEntry).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(stockMovementService.create).toHaveBeenCalled();
      // Should not throw error despite accounting failure
    });

    it('should load adjustment with relations before posting', async () => {
      // Arrange
      const mockAdjustment = createMockStockAdjustment();
      const adjustmentId = mockAdjustment.id;
      const completedAdjustment = createMockStockAdjustment(StockAdjustmentStatus.COMPLETED);

      // First call returns draft, second call should load with relations
      let callCount = 0;
      stockAdjustmentRepository.findOne.mockImplementation((options: any) => {
        callCount++;
        if (callCount === 1) {
          // First call to find the adjustment
          return Promise.resolve(mockAdjustment as StockAdjustment);
        } else if (callCount === 2) {
          // Second call should be findOne(id) to get relations - this is from the findOne method
          expect(options.where?.id || options).toBeTruthy();
          return Promise.resolve(completedAdjustment as StockAdjustment);
        }
        return Promise.resolve(completedAdjustment as StockAdjustment);
      });

      stockMovementService.create.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);

      accountingService.postStockAdjustmentEntry.mockResolvedValue({
        id: 'journal-1',
        referenceNumber: 'JE-000001',
      } as any);

      // Act
      const result = await service.complete(adjustmentId);

      // Assert
      // Note: findOne is called 3 times:
      // 1. Initial load to check if adjustment exists
      // 2. Load after transaction completes (for accounting)
      // 3. Final load to return the response
      expect(stockAdjustmentRepository.findOne).toHaveBeenCalledTimes(3);
      expect(accountingService.postStockAdjustmentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.any(Array),
        }),
        'system',
        undefined,
      );
      expect(result).toBeDefined();
    });
  });

  describe('duplicate product rejection', () => {
    it('create() throws BadRequestException when the same productId appears twice', async () => {
      const dto = {
        adjustmentDate: new Date(),
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
        adjustmentDate: new Date(), itemCount: 1, totalValue: 10, createdAt: new Date(), updatedAt: new Date(),
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
        adjustmentDate: new Date(), itemCount: 1, totalValue: 0, createdAt: new Date(), updatedAt: new Date(),
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
