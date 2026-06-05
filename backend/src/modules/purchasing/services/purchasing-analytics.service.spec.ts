import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
  VendorPayment,
} from "../../../database/entities";
import { PurchasingAnalyticsService } from "./purchasing-analytics.service";
import { PurchasingAnalyticsQueryDto } from "../dto/purchasing-analytics.dto";
import { DateRange } from "@/common/dto/analytics.dto";
import { SettingsService } from "../../settings/settings.service";

function makeChainableQb(
  rawManyResult: any[] = [],
  manyResult: any[] = [],
  rawOneResult: any = {},
) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawManyResult),
    getRawOne: jest.fn().mockResolvedValue(rawOneResult),
    getMany: jest.fn().mockResolvedValue(manyResult),
    getOne: jest.fn().mockResolvedValue(null),
  };
  return qb;
}

describe("PurchasingAnalyticsService", () => {
  let service: PurchasingAnalyticsService;
  let purchaseOrderRepository: { createQueryBuilder: jest.Mock };
  let settingsService: { getRegionalSettings: jest.Mock };

  beforeEach(async () => {
    purchaseOrderRepository = { createQueryBuilder: jest.fn() };
    settingsService = {
      getRegionalSettings: jest.fn().mockResolvedValue({ timezone: "UTC" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingAnalyticsService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: purchaseOrderRepository,
        },
        {
          provide: getRepositoryToken(PurchaseOrderItem),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: { createQueryBuilder: jest.fn() },
        },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get<PurchasingAnalyticsService>(
      PurchasingAnalyticsService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // Helper: minimal valid analytics query
  const baseQuery = (): PurchasingAnalyticsQueryDto =>
    ({
      dateRange: DateRange.THIS_MONTH,
    }) as PurchasingAnalyticsQueryDto;

  describe("getPurchasingAnalytics — filter propagation", () => {
    it("passes supplierId WHERE clause to calculatePurchasingMetrics query builders", async () => {
      const qb = makeChainableQb(
        [], // getRawMany (period data)
        [], // getMany (recent orders)
        {
          totalSpent: "0",
          totalOrders: "0",
          averageOrderValue: "0",
          activeSuppliers: "0",
        },
      );
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), supplierId: "supplier-uuid-123" };
      await service.getPurchasingAnalytics(query);

      // andWhere should have been called with supplierId filter at least once
      const andWhereCalls: string[] = qb.andWhere.mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(andWhereCalls.some((call) => call.includes("supplierId"))).toBe(
        true,
      );
    });

    it("passes status=received as NOT EXISTS subquery WHERE clause", async () => {
      const qb = makeChainableQb([], [], {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), status: "received" as const };
      await service.getPurchasingAnalytics(query);

      const andWhereCalls: string[] = qb.andWhere.mock.calls.map(
        (c: any[]) => c[0],
      );
      expect(
        andWhereCalls.some(
          (call) => typeof call === "string" && call.includes("NOT EXISTS"),
        ),
      ).toBe(true);
    });

    it("passes status=pending as EXISTS subquery WHERE clause", async () => {
      const qb = makeChainableQb([], [], {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), status: "pending" as const };
      await service.getPurchasingAnalytics(query);

      const andWhereCalls: string[] = qb.andWhere.mock.calls.map(
        (c: any[]) => c[0],
      );
      // EXISTS but NOT "NOT EXISTS"
      expect(
        andWhereCalls.some(
          (call) =>
            typeof call === "string" &&
            call.includes("EXISTS") &&
            !call.includes("NOT EXISTS"),
        ),
      ).toBe(true);
    });
  });

  describe("getRecentPurchaseOrders — paymentStatus post-query filtering", () => {
    it("filters to orders where paidAmount > totalAmount when paymentStatus=overpaid", async () => {
      const orders = [
        {
          orderNumber: "PO-0001",
          orderDate: new Date("2026-03-01"),
          supplier: { companyName: "Acme" },
          totalAmount: "1000",
          vendorPayments: [{ amount: "1100" }],
          isFullyReceived: true,
          shippingAmount: "0",
        },
        {
          orderNumber: "PO-0002",
          orderDate: new Date("2026-03-02"),
          supplier: { companyName: "Beta" },
          totalAmount: "500",
          vendorPayments: [{ amount: "500" }],
          isFullyReceived: false,
          shippingAmount: "0",
        },
      ];
      const qb = makeChainableQb([], orders, {
        totalSpent: "1500",
        totalOrders: "2",
        averageOrderValue: "750",
        activeSuppliers: "2",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), paymentStatus: "overpaid" as const };
      const result = await service.getPurchasingAnalytics(query);

      expect(result.recentOrders).toHaveLength(1);
      expect(result.recentOrders[0].orderNumber).toBe("PO-0001");
    });

    it("returns only paid orders when paymentStatus=paid filter is active", async () => {
      const mockOrders = [
        {
          orderNumber: "PO-001",
          orderDate: new Date("2026-03-01"),
          supplier: { companyName: "Supplier A" },
          totalAmount: "1000",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "1000" }], // fully paid
        },
        {
          orderNumber: "PO-002",
          orderDate: new Date("2026-03-02"),
          supplier: { companyName: "Supplier B" },
          totalAmount: "500",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [], // unpaid
        },
        {
          orderNumber: "PO-003",
          orderDate: new Date("2026-03-03"),
          supplier: { companyName: "Supplier C" },
          totalAmount: "300",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "150" }], // partial
        },
      ];

      const qb = makeChainableQb([], mockOrders, {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), paymentStatus: "paid" as const };
      const result = await service.getPurchasingAnalytics(query);

      expect(result.recentOrders).toHaveLength(1);
      expect(result.recentOrders[0].orderNumber).toBe("PO-001");
    });

    it("returns only unpaid orders when paymentStatus=unpaid filter is active", async () => {
      const mockOrders = [
        {
          orderNumber: "PO-001",
          orderDate: new Date("2026-03-01"),
          supplier: { companyName: "Supplier A" },
          totalAmount: "1000",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "1000" }], // paid
        },
        {
          orderNumber: "PO-002",
          orderDate: new Date("2026-03-02"),
          supplier: { companyName: "Supplier B" },
          totalAmount: "500",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [], // unpaid
        },
      ];

      const qb = makeChainableQb([], mockOrders, {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), paymentStatus: "unpaid" as const };
      const result = await service.getPurchasingAnalytics(query);

      expect(result.recentOrders).toHaveLength(1);
      expect(result.recentOrders[0].orderNumber).toBe("PO-002");
    });

    it("returns only partial orders when paymentStatus=partial filter is active", async () => {
      const mockOrders = [
        {
          orderNumber: "PO-001",
          orderDate: new Date("2026-03-01"),
          supplier: { companyName: "Supplier A" },
          totalAmount: "1000",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "1000" }], // paid
        },
        {
          orderNumber: "PO-002",
          orderDate: new Date("2026-03-02"),
          supplier: { companyName: "Supplier B" },
          totalAmount: "500",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "250" }], // partial
        },
      ];

      const qb = makeChainableQb([], mockOrders, {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), paymentStatus: "partial" as const };
      const result = await service.getPurchasingAnalytics(query);

      expect(result.recentOrders).toHaveLength(1);
      expect(result.recentOrders[0].orderNumber).toBe("PO-002");
    });

    it("does not apply DB LIMIT when paymentStatus filter is active (fetches all for in-app filtering)", async () => {
      const qb = makeChainableQb([], [], {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), paymentStatus: "paid" as const };
      await service.getPurchasingAnalytics(query);

      // limit() should have been called with undefined (no limit) for the recent orders QB
      // when paymentStatus filter is active
      const limitCalls: any[][] = qb.limit.mock.calls;
      expect(limitCalls.some((args) => args[0] === undefined)).toBe(true);
    });
  });

  describe("getPurchasingPeriodData — paymentStatus in-app aggregation", () => {
    it("groups paid orders by period when paymentStatus=paid", async () => {
      const mockOrders = [
        {
          orderNumber: "PO-001",
          orderDate: new Date("2026-03-05"),
          supplier: { companyName: "Supplier A" },
          totalAmount: "1000",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "1000" }], // paid
        },
        {
          orderNumber: "PO-002",
          orderDate: new Date("2026-03-10"),
          supplier: { companyName: "Supplier B" },
          totalAmount: "500",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [], // unpaid — should be excluded
        },
        {
          orderNumber: "PO-003",
          orderDate: new Date("2026-02-15"),
          supplier: { companyName: "Supplier C" },
          totalAmount: "800",
          items: [],
          isFullyReceived: () => false,
          vendorPayments: [{ amount: "800" }], // paid, different month
        },
      ];

      const qb = makeChainableQb([], mockOrders, {
        totalSpent: "0",
        totalOrders: "0",
        averageOrderValue: "0",
        activeSuppliers: "0",
      });
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(qb);

      const query = { ...baseQuery(), paymentStatus: "paid" as const };
      const result = await service.getPurchasingAnalytics(query);

      // Period data should only include paid orders, grouped by month
      const marchEntry = result.current.periodData.find((p) =>
        p.period.startsWith("2026-03"),
      );
      const febEntry = result.current.periodData.find((p) =>
        p.period.startsWith("2026-02"),
      );

      // PO-001 (paid, March) should appear; PO-002 (unpaid, March) should be excluded
      expect(marchEntry?.orders).toBe(1);
      expect(marchEntry?.spent).toBe(1000);
      expect(febEntry?.orders).toBe(1);
      expect(febEntry?.spent).toBe(800);
    });
  });
});
