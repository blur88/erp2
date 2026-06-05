import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Logger } from "@nestjs/common";
import { GoodsReceivedNoteService } from "./goods-received-note.service";
import {
  GoodsReceivedNote,
  GoodsReceivedNoteItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
} from "../../../database/entities";
import { GrnStatus } from "../../../database/entities/goods-received-note.entity";
import { BaseCostCalculatorService } from "../../inventory/services/base-cost-calculator.service";
import { StockMovementService } from "../../inventory/services/stock-movement.service";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";
import { AccountingService } from "../../accounting/services/accounting.service";
import { CreateGoodsReceivedNoteDto } from "../dto/goods-received-note.dto";

describe("GoodsReceivedNoteService", () => {
  let service: GoodsReceivedNoteService;
  let grnRepository: jest.Mocked<Repository<GoodsReceivedNote>>;
  let grnItemRepository: jest.Mocked<Repository<GoodsReceivedNoteItem>>;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let accountingService: jest.Mocked<AccountingService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let settingsService: jest.Mocked<SettingsService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;

  const mockPurchaseOrder: Partial<PurchaseOrder> = {
    id: "po-123",
    orderNumber: "PO-000001",
    supplier: {
      id: "supplier-123",
      companyName: "Test Supplier",
    } as Supplier,
    items: [
      {
        id: "po-item-1",
        quantity: 10,
        unitCost: 100,
        product: {
          id: "product-1",
          name: "Test Product",
          baseCost: 90,
        } as Product,
      } as PurchaseOrderItem,
    ],
    subtotal: 1000,
    shippingAmount: 50,
  };

  const mockGrn: Partial<GoodsReceivedNote> = {
    id: "grn-123",
    grnNumber: "GRN-000001",
    purchaseOrderId: "po-123",
    supplierId: "supplier-123",
    receivedDate: new Date("2024-01-15"),
    status: GrnStatus.RECEIVED,
    items: [
      {
        id: "grn-item-1",
        productId: "product-1",
        orderedQuantity: 10,
        receivedQuantity: 10,
        purchaseOrderItemId: "po-item-1",
      } as GoodsReceivedNoteItem,
    ],
    calculateTotals: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceivedNoteService,
        {
          provide: getRepositoryToken(GoodsReceivedNote),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(GoodsReceivedNoteItem),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {},
        },
        {
          provide: BaseCostCalculatorService,
          useValue: {
            calculateShippingByValue: jest.fn(),
            addStock: jest.fn(),
          },
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
            postGoodsReceivedEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GoodsReceivedNoteService>(GoodsReceivedNoteService);
    grnRepository = module.get(getRepositoryToken(GoodsReceivedNote));
    grnItemRepository = module.get(getRepositoryToken(GoodsReceivedNoteItem));
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    accountingService = module.get(AccountingService);
    auditLogService = module.get(AuditLogService);
    settingsService = module.get(SettingsService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    const createDto: CreateGoodsReceivedNoteDto = {
      purchaseOrderId: "po-123",
      receivedDate: "2024-01-15",
    };

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(
        mockPurchaseOrder as PurchaseOrder,
      );
      grnRepository.findOne.mockResolvedValue(null); // No existing GRN
      settingsService.generateDocumentNumber.mockResolvedValue("GRN-000001");
      grnRepository.create.mockReturnValue(mockGrn as GoodsReceivedNote);
      grnRepository.save.mockResolvedValue(mockGrn as GoodsReceivedNote);
      grnItemRepository.create.mockImplementation(
        (item) => item as GoodsReceivedNoteItem,
      );
      grnItemRepository.save.mockResolvedValue([mockGrn.items![0]] as any);
      stockMovementService.create.mockResolvedValue({} as any);
      baseCostCalculator.calculateShippingByValue.mockReturnValue(5);
      baseCostCalculator.addStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
    });

    it("should post accounting entry successfully", async () => {
      // Mock findOne to return GRN with all relations for accounting
      const fullGrn = {
        ...mockGrn,
        supplier: mockPurchaseOrder.supplier,
        purchaseOrder: mockPurchaseOrder,
      } as GoodsReceivedNote;

      grnRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing GRN
        .mockResolvedValueOnce(fullGrn) // Load GRN with relations for accounting
        .mockResolvedValueOnce(fullGrn); // Final findOne for return

      accountingService.postGoodsReceivedEntry.mockResolvedValue({} as any);

      await service.create(createDto);

      // Verify accounting service was called with correct parameters
      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledWith(
        fullGrn,
        "system",
        undefined,
      );

      // Verify it was called exactly once
      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledTimes(1);

      // Verify GRN was still created successfully
      expect(grnRepository.save).toHaveBeenCalled();
    });

    it("should continue when accounting post fails", async () => {
      // Mock findOne to return GRN with all relations for accounting
      const fullGrn = {
        ...mockGrn,
        supplier: mockPurchaseOrder.supplier,
        purchaseOrder: mockPurchaseOrder,
      } as GoodsReceivedNote;

      grnRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing GRN
        .mockResolvedValueOnce(fullGrn) // Load GRN with relations for accounting
        .mockResolvedValueOnce(fullGrn); // Final findOne for return

      // Mock accounting service to throw error
      const accountingError = new Error("Account mapping not configured");
      accountingService.postGoodsReceivedEntry.mockRejectedValue(
        accountingError,
      );

      // Should not throw error - GRN creation should continue
      await expect(service.create(createDto)).resolves.toBeDefined();

      // Verify error was logged
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post accounting entry"),
        expect.any(String),
      );

      // Verify GRN was still created successfully
      expect(grnRepository.save).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        "CREATE",
        "GoodsReceivedNote",
        expect.stringContaining("Created GRN"),
        expect.any(Object),
      );
    });

    it("should load GRN with relations before posting", async () => {
      // Mock findOne to return GRN with all relations
      const fullGrn = {
        ...mockGrn,
        supplier: mockPurchaseOrder.supplier,
        purchaseOrder: mockPurchaseOrder,
      } as GoodsReceivedNote;

      grnRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing GRN
        .mockResolvedValueOnce(fullGrn) // Load GRN with relations for accounting
        .mockResolvedValueOnce(fullGrn); // Final findOne for return

      accountingService.postGoodsReceivedEntry.mockResolvedValue({} as any);

      await service.create(createDto);

      // Verify findOne was called with correct relations for accounting
      expect(grnRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockGrn.id },
        relations: {
          supplier: true,
          purchaseOrder: true,
          items: { product: true, purchaseOrderItem: true },
        },
      });

      // Verify the full GRN with relations was passed to accounting service
      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockGrn.id,
          supplier: mockPurchaseOrder.supplier,
          purchaseOrder: mockPurchaseOrder,
        }),
        "system",
        undefined,
      );
    });

    it("should handle accounting post when GRN not found after creation", async () => {
      const fullGrn = {
        ...mockGrn,
        supplier: mockPurchaseOrder.supplier,
        purchaseOrder: mockPurchaseOrder,
      } as GoodsReceivedNote;

      grnRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing GRN
        .mockResolvedValueOnce(null) // Load GRN with relations returns null
        .mockResolvedValueOnce(fullGrn); // Final findOne for return

      // Should not call accounting service if GRN not found
      await service.create(createDto);

      // Verify accounting service was not called
      expect(accountingService.postGoodsReceivedEntry).not.toHaveBeenCalled();

      // Verify GRN was still created and returned
      expect(grnRepository.save).toHaveBeenCalled();
    });

    it("should create GRN with stock movements and base cost updates", async () => {
      const fullGrn = {
        ...mockGrn,
        supplier: mockPurchaseOrder.supplier,
        purchaseOrder: mockPurchaseOrder,
      } as GoodsReceivedNote;

      grnRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing GRN
        .mockResolvedValueOnce(fullGrn) // Load GRN with relations for accounting
        .mockResolvedValueOnce(fullGrn); // Final findOne for return

      accountingService.postGoodsReceivedEntry.mockResolvedValue({} as any);

      await service.create(createDto);

      // Verify stock movement was created
      expect(stockMovementService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: "product-1",
          movementType: "purchase_receipt",
          quantity: 10,
          unitValue: 100,
        }),
      );

      // Verify base cost was updated
      expect(baseCostCalculator.addStock).toHaveBeenCalledWith(
        "product-1",
        mockGrn.id,
        10,
        100,
        5, // shipping per unit
        mockGrn.receivedDate,
      );

      // Verify audit log was created
      expect(auditLogService.log).toHaveBeenCalledWith(
        "CREATE",
        "GoodsReceivedNote",
        "Created GRN: GRN-000001",
        expect.objectContaining({
          entityId: mockGrn.id,
          userId: "system",
        }),
      );

      // Verify accounting entry was posted
      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalled();
    });

    it("should use the document number returned by settingsService", async () => {
      const fullGrn = {
        ...mockGrn,
        supplier: mockPurchaseOrder.supplier,
        purchaseOrder: mockPurchaseOrder,
      } as GoodsReceivedNote;

      grnRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fullGrn)
        .mockResolvedValueOnce(fullGrn);

      settingsService.generateDocumentNumber.mockResolvedValue("GRN-26-007");
      grnRepository.create.mockReturnValue({
        ...mockGrn,
        grnNumber: "GRN-26-007",
      } as GoodsReceivedNote);

      await service.create(createDto);

      expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith(
        "Goods Received",
      );
      expect(grnRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ grnNumber: "GRN-26-007" }),
      );
    });

    it("should throw BadRequestException when settingsService.generateDocumentNumber fails", async () => {
      grnRepository.findOne.mockResolvedValueOnce(null);
      settingsService.generateDocumentNumber.mockRejectedValue(
        new Error("Document number config for 'Goods Received' not found"),
      );

      await expect(service.create(createDto)).rejects.toThrow(
        "Failed to create goods received note",
      );
      expect(grnRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    beforeEach(() => {
      grnRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
    });

    it("applies supplierId WHERE clause when supplierId is provided", async () => {
      await service.findAll({ supplierId: "supplier-123" } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "grn.supplierId = :supplierId",
        { supplierId: "supplier-123" },
      );
    });

    it("applies status WHERE clause when status is provided", async () => {
      await service.findAll({ status: GrnStatus.RECEIVED } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "grn.status = :status",
        { status: GrnStatus.RECEIVED },
      );
    });

    it("does not apply supplierId or status clauses when neither is provided", async () => {
      await service.findAll({} as any);

      const calls = mockQueryBuilder.andWhere.mock.calls.map(
        ([clause]) => clause as string,
      );
      expect(calls.some((clause) => clause.includes("supplierId"))).toBe(false);
      expect(calls.some((clause) => clause.includes("status"))).toBe(false);
    });

    it("applies receivedDateFrom WHERE clause when provided", async () => {
      await service.findAll({ receivedDateFrom: "2025-01-01" } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "grn.receivedDate >= :receivedDateFrom",
        { receivedDateFrom: "2025-01-01" },
      );
    });

    it("applies receivedDateTo WHERE clause when provided", async () => {
      await service.findAll({ receivedDateTo: "2025-01-31" } as any);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "grn.receivedDate <= :receivedDateTo",
        { receivedDateTo: "2025-01-31" },
      );
    });

    it("does not apply date clauses when neither is provided", async () => {
      await service.findAll({} as any);

      const calls = mockQueryBuilder.andWhere.mock.calls.map(
        ([clause]) => clause as string,
      );
      expect(calls.some((clause) => clause.includes("receivedDateFrom"))).toBe(
        false,
      );
      expect(calls.some((clause) => clause.includes("receivedDateTo"))).toBe(
        false,
      );
    });
  });
});
