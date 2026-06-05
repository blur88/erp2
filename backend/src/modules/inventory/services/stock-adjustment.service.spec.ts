import { Test, TestingModule } from "@nestjs/testing";
import { validate } from "class-validator";
import { getRepositoryToken, getDataSourceToken } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { StockAdjustmentService } from "./stock-adjustment.service";
import {
  StockAdjustment,
  StockAdjustmentItem,
  StockAdjustmentStatus,
} from "../../../database/entities/stock-adjustment.entity";
import { Product } from "../../../database/entities/product.entity";
import { User } from "../../../database/entities/user.entity";
import { StockMovementService } from "./stock-movement.service";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";
import { AccountingService } from "../../accounting/services/accounting.service";
import { StockAdjustmentItemDto } from "../dto/stock-adjustment.dto";

describe("StockAdjustmentService", () => {
  let service: StockAdjustmentService;
  let stockAdjustmentRepository: jest.Mocked<Repository<StockAdjustment>>;
  let accountingService: jest.Mocked<AccountingService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;

  const createMockStockAdjustment = (
    status: StockAdjustmentStatus = StockAdjustmentStatus.DRAFT,
  ): Partial<StockAdjustment> => ({
    id: "123e4567-e89b-12d3-a456-426614174000",
    adjustmentNumber: "SA-000001",
    adjustmentDate: new Date("2026-02-06"),
    status,
    itemCount: 2,
    totalValue: 150,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: "item-1",
        productId: "product-1",
        oldQuantity: 100,
        newQuantity: 110,
        difference: 10,
        unitCost: 10,
        totalValue: 100,
        product: {
          id: "product-1",
          name: "Test Product 1",
          baseCost: 10,
        } as Product,
      } as StockAdjustmentItem,
      {
        id: "item-2",
        productId: "product-2",
        oldQuantity: 50,
        newQuantity: 45,
        difference: -5,
        unitCost: 10,
        totalValue: 50,
        product: {
          id: "product-2",
          name: "Test Product 2",
          baseCost: 10,
        } as Product,
      } as StockAdjustmentItem,
    ],
    isEditable: function () {
      return this.status === StockAdjustmentStatus.DRAFT;
    },
    canComplete: function () {
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
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("complete", () => {
    it("should post accounting entry successfully", async () => {
      // Arrange
      const mockAdjustment = createMockStockAdjustment();
      const adjustmentId = mockAdjustment.id;
      const completedAdjustment = createMockStockAdjustment(
        StockAdjustmentStatus.COMPLETED,
      );

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
        id: "journal-1",
        referenceNumber: "JE-000001",
      } as any);

      // Act
      const result = await service.complete(adjustmentId);

      // Assert
      expect(accountingService.postStockAdjustmentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: adjustmentId,
          adjustmentNumber: mockAdjustment.adjustmentNumber,
        }),
        "system",
        undefined,
      );
      expect(result).toBeDefined();
      expect(stockMovementService.create).toHaveBeenCalled();
    });

    it("should continue when accounting post fails", async () => {
      // Arrange
      const mockAdjustment = createMockStockAdjustment();
      const adjustmentId = mockAdjustment.id;
      const completedAdjustment = createMockStockAdjustment(
        StockAdjustmentStatus.COMPLETED,
      );

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
        new Error("Account mappings not configured"),
      );

      // Act
      const result = await service.complete(adjustmentId);

      // Assert
      expect(accountingService.postStockAdjustmentEntry).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(stockMovementService.create).toHaveBeenCalled();
      // Should not throw error despite accounting failure
    });

    it("should load adjustment with relations before posting", async () => {
      // Arrange
      const mockAdjustment = createMockStockAdjustment();
      const adjustmentId = mockAdjustment.id;
      const completedAdjustment = createMockStockAdjustment(
        StockAdjustmentStatus.COMPLETED,
      );

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
        id: "journal-1",
        referenceNumber: "JE-000001",
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
        "system",
        undefined,
      );
      expect(result).toBeDefined();
    });
  });
});

describe("StockAdjustmentItemDto", () => {
  it("allows negative oldQuantity because it is the current stock snapshot", async () => {
    const dto = new StockAdjustmentItemDto();
    dto.productId = "123e4567-e89b-42d3-a456-426614174000";
    dto.oldQuantity = -5;
    dto.newQuantity = 10;
    dto.difference = 15;

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects negative newQuantity because target stock must be non-negative", async () => {
    const dto = new StockAdjustmentItemDto();
    dto.productId = "123e4567-e89b-42d3-a456-426614174000";
    dto.oldQuantity = -5;
    dto.newQuantity = -1;
    dto.difference = 4;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === "newQuantity")).toBe(true);
  });
});
