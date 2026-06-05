import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Logger } from "@nestjs/common";
import { PurchaseOrderService } from "./purchase-order.service";
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
  GoodsReceivedNote,
  VendorPayment,
} from "../../../database/entities";
import { GrnStatus } from "../../../database/entities/goods-received-note.entity";
import { UserRole } from "../../../database/entities/user.entity";
import { SupplierService } from "./supplier.service";
import { GoodsReceivedNoteService } from "./goods-received-note.service";
import { VendorPaymentService } from "./vendor-payment.service";
import { BaseCostCalculatorService } from "../../inventory/services/base-cost-calculator.service";
import { StockMovementService } from "../../inventory/services/stock-movement.service";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";
import { AccountingService } from "../../accounting/services/accounting.service";
import { PurchaseOrderLifecycleService } from "./purchase-order-lifecycle.service";

describe("PurchaseOrderService", () => {
  let module: TestingModule;
  let service: PurchaseOrderService;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let purchaseOrderItemRepository: jest.Mocked<Repository<PurchaseOrderItem>>;
  let productRepository: jest.Mocked<Repository<Product>>;
  let grnRepository: jest.Mocked<Repository<GoodsReceivedNote>>;
  let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let accountingService: jest.Mocked<AccountingService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let vendorPaymentService: jest.Mocked<VendorPaymentService>;
  let grnService: jest.Mocked<GoodsReceivedNoteService>;
  const adminUser = { role: UserRole.ADMIN } as any;

  const mockPurchaseOrder = {
    id: "po-1",
    orderNumber: "PO-000001",
    items: [
      {
        id: "po-item-1",
        productId: "product-1",
        quantity: 10,
        unitCost: 20,
        receivedQuantity: 0,
      },
    ],
    supplier: {
      id: "supplier-1",
      companyName: "Supplier A",
    },
  } as unknown as PurchaseOrder;

  const mockDraftGrn = {
    id: "grn-1",
    grnNumber: "GRN-000001",
    purchaseOrderId: "po-1",
    receivedDate: new Date("2024-01-15"),
    status: GrnStatus.DRAFT,
    items: [
      {
        id: "grn-item-1",
        grnId: "grn-1",
        productId: "product-1",
        orderedQuantity: 10,
        receivedQuantity: 0,
        purchaseOrderItemId: "po-item-1",
      },
    ],
    calculateTotals: jest.fn(),
  } as unknown as GoodsReceivedNote;

  const mockReceivedGrn = {
    ...mockDraftGrn,
    status: GrnStatus.RECEIVED,
    items: [
      {
        id: "grn-item-1",
        grnId: "grn-1",
        productId: "product-1",
        orderedQuantity: 10,
        receivedQuantity: 10,
        purchaseOrderItemId: "po-item-1",
      },
    ],
  } as unknown as GoodsReceivedNote;

  const mockReceivedGrnWithRelations = {
    ...mockReceivedGrn,
    supplier: mockPurchaseOrder.supplier,
    purchaseOrder: mockPurchaseOrder,
  } as unknown as GoodsReceivedNote;

  const mockReturnDto = {
    id: "po-1",
    orderNumber: "PO-000001",
  } as any;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PurchaseOrderService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
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
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            restore: jest.fn(),
            remove: jest.fn(),
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
        {
          provide: PurchaseOrderLifecycleService,
          useValue: {
            assertItemsNotLocked: jest.fn(),
            assertPermanentDeleteAllowed: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PurchaseOrderService>(PurchaseOrderService);
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    purchaseOrderItemRepository = module.get(
      getRepositoryToken(PurchaseOrderItem),
    );
    productRepository = module.get(getRepositoryToken(Product));
    grnRepository = module.get(getRepositoryToken(GoodsReceivedNote));
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    auditLogService = module.get(AuditLogService);
    accountingService = module.get(AccountingService);
    stockMovementService = module.get(StockMovementService);
    vendorPaymentService = module.get(VendorPaymentService);
    grnService = module.get(GoodsReceivedNoteService);

    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();

    jest
      .spyOn(service as any, "updateBaseCostsForGrn")
      .mockResolvedValue(undefined);
    jest.spyOn(service, "findOne").mockResolvedValue(mockReturnDto);

    purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrder);
    purchaseOrderRepository.update.mockResolvedValue({} as any);
    purchaseOrderRepository.save.mockResolvedValue(mockPurchaseOrder);
    grnRepository.save.mockResolvedValue(mockReceivedGrn);
    productRepository.findOne.mockResolvedValue({ id: "product-1" } as Product);
    stockMovementService.create.mockResolvedValue({} as any);
    stockMovementService.deleteByReference.mockResolvedValue({
      deletedCount: 1,
    } as any);
    purchaseOrderItemRepository.save.mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("searchGlobal", () => {
    function mockPOQuery(order: {
      id: string;
      orderNumber: string;
      supplier: { companyName: string };
    }) {
      purchaseOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([order]),
      } as any);
    }

    it("returns matching purchase orders as GlobalSearchResultDto", async () => {
      const order = {
        id: "po-uuid-1",
        orderNumber: "PO-000001",
        supplier: { companyName: "Acme Supplies" },
        deletedAt: null,
      };
      purchaseOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([order]),
      } as any);

      const results = await service.searchGlobal("PO-000001", {
        role: UserRole.PROCUREMENT_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: "transaction",
        id: "po-uuid-1",
        label: "PO-000001",
        description: "Acme Supplies",
        route: "/purchasing/orders/po-uuid-1/edit",
      });
    });

    it("exact orderNumber match scores SCORE_EXACT_CODE + BOOST_TRANSACTION + BOOST_EXACT_MATCH", async () => {
      mockPOQuery({
        id: "po1",
        orderNumber: "PO-001",
        supplier: { companyName: "Vendor" },
      });

      const results = await service.searchGlobal("PO-001", adminUser);

      expect(results[0].score).toBe(150);
    });

    it("orderNumber startsWith scores SCORE_STARTSWITH_CODE + BOOST_TRANSACTION", async () => {
      mockPOQuery({
        id: "po1",
        orderNumber: "PO-001",
        supplier: { companyName: "Vendor" },
      });

      const results = await service.searchGlobal("PO-", adminUser);

      expect(results[0].score).toBe(110);
    });

    it("contains match scores SCORE_CONTAINS + BOOST_TRANSACTION", async () => {
      mockPOQuery({
        id: "po1",
        orderNumber: "PO-001",
        supplier: { companyName: "Global Vendor" },
      });

      const results = await service.searchGlobal("Vendor", adminUser);

      expect(results[0].score).toBe(70);
    });
  });

  describe("findAll", () => {
    function createFindAllQueryBuilder(orders: PurchaseOrder[] = []) {
      return {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(orders.length),
        getMany: jest.fn().mockResolvedValue(orders),
      };
    }

    function createFindAllOrder(
      overrides: Partial<PurchaseOrder> = {},
    ): PurchaseOrder {
      return {
        id: "po-findall-1",
        orderNumber: "PO-000101",
        orderDate: new Date("2026-04-01"),
        subtotal: 100,
        discountPercent: 0,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: 100,
        paidAmount: 0,
        notes: "",
        supplier: {
          id: "supplier-1",
          companyName: "Supplier A",
        },
        items: [],
        goodsReceivedNotes: [],
        vendorPayments: [],
        isFullyReceived: jest.fn().mockReturnValue(false),
        getTotalReceivedQuantity: jest.fn().mockReturnValue(0),
        getTotalOrderedQuantity: jest.fn().mockReturnValue(0),
        ...overrides,
      } as unknown as PurchaseOrder;
    }

    it("adds unpaid paymentStatus filter", async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: 0, totalAmount: 100 }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.findAll({ paymentStatus: "unpaid" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "(po.paidAmount = 0 OR po.paidAmount IS NULL)",
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBe(0);
      });
    });

    it("adds partial paymentStatus filter", async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: 40, totalAmount: 100 }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.findAll({ paymentStatus: "partial" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "po.paidAmount > 0 AND po.paidAmount < po.totalAmount",
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBeGreaterThan(0);
        expect(Number(order.paidAmount)).toBeLessThan(
          Number(order.totalAmount),
        );
      });
    });

    it("adds paid paymentStatus filter", async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: 100, totalAmount: 100 }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.findAll({ paymentStatus: "paid" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "po.paidAmount >= po.totalAmount AND po.paidAmount > 0",
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBeGreaterThanOrEqual(
          Number(order.totalAmount),
        );
      });
    });

    it("adds overpaid paymentStatus filter", async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: 120, totalAmount: 100 }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.findAll({ paymentStatus: "overpaid" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "po.paidAmount > po.totalAmount",
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBeGreaterThan(
          Number(order.totalAmount),
        );
      });
    });

    it("adds draft status filter", async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({
          goodsReceivedNotes: [
            {
              id: "grn-1",
              grnNumber: "GRN-1",
              status: GrnStatus.DRAFT,
              receivedDate: new Date("2026-04-01"),
            },
          ] as any,
        }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.findAll({ status: "draft" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "grns.status = :grnStatus",
        {
          grnStatus: "draft",
        },
      );
      result.orders.forEach((order) => {
        expect(order.goodsReceivedNotes?.[0]?.status).toBe("draft");
      });
    });

    it("adds received status filter", async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({
          goodsReceivedNotes: [
            {
              id: "grn-2",
              grnNumber: "GRN-2",
              status: GrnStatus.RECEIVED,
              receivedDate: new Date("2026-04-02"),
            },
          ] as any,
        }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.findAll({ status: "received" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "grns.status = :grnStatus",
        {
          grnStatus: "received",
        },
      );
      result.orders.forEach((order) => {
        expect(order.goodsReceivedNotes?.[0]?.status).toBe("received");
      });
    });
  });

  describe("findDeleted", () => {
    function createDeletedQueryBuilder(orders: PurchaseOrder[] = []) {
      return {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(orders.length),
        getMany: jest.fn().mockResolvedValue(orders),
      };
    }

    function createDeletedOrder(
      overrides: Partial<PurchaseOrder> = {},
    ): PurchaseOrder {
      return {
        id: "po-deleted-1",
        orderNumber: "PO-000201",
        orderDate: new Date("2026-03-01"),
        subtotal: 100,
        discountPercent: 0,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: 100,
        paidAmount: 0,
        notes: "",
        supplier: {
          id: "supplier-1",
          companyName: "Supplier A",
        },
        items: [],
        goodsReceivedNotes: [],
        vendorPayments: [],
        isFullyReceived: jest.fn().mockReturnValue(false),
        getTotalReceivedQuantity: jest.fn().mockReturnValue(0),
        getTotalOrderedQuantity: jest.fn().mockReturnValue(0),
        ...overrides,
      } as unknown as PurchaseOrder;
    }

    it("falls back to deletedAt when deleted sortBy is not allowlisted", async () => {
      const queryBuilder = createDeletedQueryBuilder([createDeletedOrder()]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      await service.findDeleted({
        sortBy: "drop table purchase_orders",
        sortOrder: "ASC",
      } as any);

      expect(queryBuilder.orderBy).toHaveBeenCalledWith("po.deletedAt", "ASC");
    });
  });

  describe("receiveGoods", () => {
    it("posts accounting entry after receiving goods", async () => {
      grnRepository.findOne
        .mockResolvedValueOnce(mockDraftGrn)
        .mockResolvedValueOnce(mockReceivedGrn)
        .mockResolvedValueOnce(mockReceivedGrnWithRelations);

      accountingService.postGoodsReceivedEntry.mockResolvedValue({} as any);

      await service.receiveGoods("po-1");

      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledTimes(1);
      expect(accountingService.postGoodsReceivedEntry).toHaveBeenCalledWith(
        mockReceivedGrnWithRelations,
        "system",
        undefined,
      );
    });
  });

  describe("markAsUnpaid", () => {
    const mockPayment = {
      id: "vp-1",
      paymentNumber: "VP-000001",
      amount: 200,
    } as VendorPayment;

    const mockPaidOrder = {
      ...mockPurchaseOrder,
      paidAmount: 200,
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPaidOrder);
      grnRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        mockPayment,
      ]);
      vendorPaymentService.softDeleteForUnpay.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      purchaseOrderRepository.save.mockResolvedValue(mockPaidOrder);
    });

    it("reverses accounting entries for each vendor payment", async () => {
      await service.markAsUnpaid("po-1");
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        "vendor_payment",
        "vp-1",
        "system",
      );
    });

    it("soft-deletes vendor payments instead of hard-deleting", async () => {
      await service.markAsUnpaid("po-1");
      expect(vendorPaymentService.softDeleteForUnpay).toHaveBeenCalledWith(
        "vp-1",
      );
    });

    it("resets paidAmount to 0", async () => {
      await service.markAsUnpaid("po-1");
      expect(purchaseOrderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: 0 }),
      );
    });
  });

  describe("permanentDelete", () => {
    const mockPO = {
      id: "po-1",
      orderNumber: "PO-000001",
      supplierId: "supplier-1",
      totalAmount: 500,
      isFullyReceived: false,
    } as unknown as PurchaseOrder;

    const mockVP1 = {
      id: "vp-1",
      paymentNumber: "VP-000001",
      amount: 250,
      status: "completed",
    } as unknown as VendorPayment;

    const mockVP2 = {
      id: "vp-2",
      paymentNumber: "VP-000002",
      amount: 250,
      status: "completed",
    } as unknown as VendorPayment;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(null);
      stockMovementService.deleteByReference.mockResolvedValue({
        deletedCount: 0,
      } as any);
      vendorPaymentRepository.find.mockResolvedValue([]);
      vendorPaymentRepository.remove.mockResolvedValue(undefined as any);
      purchaseOrderRepository.remove.mockResolvedValue(undefined as any);
      auditLogService.log.mockResolvedValue(undefined as any);
    });

    it("queries vendor payments with withDeleted: true", async () => {
      await service.permanentDelete("po-1", "user-1", "admin");
      expect(vendorPaymentRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { purchaseOrderId: "po-1" },
          withDeleted: true,
        }),
      );
    });

    it("logs PERMANENT_DELETE audit entry for each vendor payment", async () => {
      vendorPaymentRepository.find.mockResolvedValue([mockVP1, mockVP2]);

      await service.permanentDelete("po-1", "user-1", "admin");

      const vendorPaymentPermanentDeleteLogs =
        auditLogService.log.mock.calls.filter(
          ([action, entityType]) =>
            action === "PERMANENT_DELETE" && entityType === "VendorPayment",
        );

      expect(auditLogService.log).toHaveBeenCalledWith(
        "PERMANENT_DELETE",
        "VendorPayment",
        expect.stringContaining("VP-000001"),
        expect.objectContaining({ entityId: "vp-1" }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        "PERMANENT_DELETE",
        "VendorPayment",
        expect.stringContaining("VP-000002"),
        expect.objectContaining({ entityId: "vp-2" }),
      );
      expect(vendorPaymentPermanentDeleteLogs).toHaveLength(2);
    });

    it("calls vendorPaymentRepository.remove with all payments", async () => {
      vendorPaymentRepository.find.mockResolvedValue([mockVP1, mockVP2]);

      await service.permanentDelete("po-1", "user-1", "admin");

      expect(vendorPaymentRepository.remove).toHaveBeenCalledWith([
        mockVP1,
        mockVP2,
      ]);
    });

    it("does not call remove when there are no vendor payments", async () => {
      vendorPaymentRepository.find.mockResolvedValue([]);

      await service.permanentDelete("po-1", "user-1", "admin");

      expect(vendorPaymentRepository.remove).not.toHaveBeenCalled();
    });

    it("still hard-deletes the PO after removing vendor payments", async () => {
      vendorPaymentRepository.find.mockResolvedValue([mockVP1]);

      await service.permanentDelete("po-1", "user-1", "admin");

      expect(purchaseOrderRepository.remove).toHaveBeenCalledWith(mockPO);
      expect(vendorPaymentRepository.remove).toHaveBeenCalledWith([mockVP1]);
      expect(
        purchaseOrderRepository.remove.mock.invocationCallOrder[0],
      ).toBeGreaterThan(
        vendorPaymentRepository.remove.mock.invocationCallOrder[0],
      );
    });
  });

  describe("update", () => {
    it("syncs the draft GRN supplier when the PO supplier changes without item edits", async () => {
      const existingPO = {
        ...mockPurchaseOrder,
        supplierId: "supplier-1",
        orderDate: new Date("2026-01-01"),
      } as unknown as PurchaseOrder;

      const savedPO = {
        ...existingPO,
        supplierId: "supplier-2",
      } as unknown as PurchaseOrder;

      const draftGrn = {
        ...mockDraftGrn,
        supplierId: "supplier-1",
      } as unknown as GoodsReceivedNote;

      purchaseOrderRepository.findOne
        .mockResolvedValueOnce(existingPO)
        .mockResolvedValueOnce(savedPO);
      purchaseOrderRepository.save.mockResolvedValue(savedPO);
      grnRepository.findOne.mockResolvedValue(draftGrn);

      await service.update(
        "po-1",
        { supplierId: "supplier-2", notes: "new notes" } as any,
        "user-1",
        "admin",
      );

      expect(grnRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "supplier-2",
        }),
      );
    });
  });

  describe("returnGoods", () => {
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
        supplierId: "supplier-1",
      } as any);
      grnRepository.findOne.mockResolvedValue(receivedGrn);
      grnRepository.save.mockResolvedValue(draftGrn);
      jest
        .spyOn(service as any, "reverseBaseCostsForGrn")
        .mockResolvedValue(undefined);
      grnService.updateGrnItems.mockResolvedValue(undefined);
      stockMovementService.deleteByReference.mockResolvedValue({
        deletedCount: 1,
      } as any);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      purchaseOrderItemRepository.save.mockResolvedValue({} as any);
      purchaseOrderRepository.update.mockResolvedValue({} as any);
    });

    it("reverses the GRN accounting entry after returning goods", async () => {
      await service.returnGoods("po-1");
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        "goods_received_note",
        "grn-1",
        "system",
      );
    });

    it("still succeeds even if accounting reversal fails", async () => {
      accountingService.reverseSourceEntries.mockRejectedValue(
        new Error("No fiscal period"),
      );
      await expect(service.returnGoods("po-1")).resolves.not.toThrow();
    });
  });

  describe("recordOrderPayments", () => {
    const mockDeletedPayment = {
      id: "vp-old-1",
      paymentNumber: "VP-000001",
      purchaseOrderId: "po-1",
      deletedAt: new Date("2026-02-19"),
      isActive: false,
      paymentMethodId: "pm-bank",
      amount: 100,
    } as unknown as VendorPayment;

    const mockRestoredPayment = {
      ...mockDeletedPayment,
      deletedAt: null,
      isActive: true,
    } as unknown as VendorPayment;

    const mockPurchaseOrderForPayment = {
      ...mockPurchaseOrder,
      supplierId: "supplier-1",
      paidAmount: 0,
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(
        mockPurchaseOrderForPayment,
      );
      purchaseOrderRepository.save.mockResolvedValue(
        mockPurchaseOrderForPayment,
      );
      vendorPaymentService.findOne.mockResolvedValue(mockRestoredPayment);
      accountingService.postVendorPaymentEntry.mockResolvedValue(undefined);
    });

    it("creates a new vendor payment when no previous soft-deleted payment exists", async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({
        id: "vp-new",
      } as VendorPayment);

      await service.recordOrderPayments("po-1", [
        { paymentMethodId: "pm-cash", amount: 200 },
      ]);

      expect(vendorPaymentService.create).toHaveBeenCalled();
      expect(vendorPaymentRepository.restore).not.toHaveBeenCalled();
    });

    it("restores the previous soft-deleted payment on re-pay", async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments("po-1", [
        { paymentMethodId: "pm-cash", amount: 200 },
      ]);

      expect(vendorPaymentRepository.restore).toHaveBeenCalledWith("vp-old-1");
    });

    it("updates payment method and amount when restoring", async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments("po-1", [
        { paymentMethodId: "pm-cash", amount: 300 },
      ]);

      expect(vendorPaymentRepository.update).toHaveBeenCalledWith(
        "vp-old-1",
        expect.objectContaining({
          paymentMethodId: "pm-cash",
          amount: 300,
          isActive: true,
        }),
      );
    });

    it("re-posts accounting entry after restoring", async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments("po-1", [
        { paymentMethodId: "pm-cash", amount: 200 },
      ]);

      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledWith(
        mockRestoredPayment,
        "system",
      );
    });
  });
});
