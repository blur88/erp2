import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { SalesOrderLifecycleService } from "./sales-order-lifecycle.service";
import {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderPaymentStatus,
} from "../../../database/entities/sales-order.entity";
import { AuditLogService } from "../../audit-logs/services";

const mockOrder = (overrides: Partial<SalesOrder> = {}): SalesOrder =>
  ({
    id: "order-1",
    orderNumber: "SO-000001",
    status: SalesOrderStatus.DRAFT,
    paymentStatus: SalesOrderPaymentStatus.UNPAID,
    totalAmount: 1000,
    customerId: "customer-1",
    items: [],
    ...overrides,
  }) as SalesOrder;

describe("SalesOrderLifecycleService", () => {
  let service: SalesOrderLifecycleService;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderLifecycleService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(SalesOrderLifecycleService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    auditLogService = module.get(AuditLogService);
    dataSource = module.get(DataSource) as jest.Mocked<DataSource>;
  });

  describe("assertEditAllowed", () => {
    it("passes when DRAFT and UNPAID", async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      await expect(service.assertEditAllowed("order-1")).resolves.not.toThrow();
    });

    it("passes when DRAFT and PARTIAL", async () => {
      orderRepo.findOne.mockResolvedValue(
        mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }),
      );
      await expect(service.assertEditAllowed("order-1")).resolves.not.toThrow();
    });

    it("passes when DRAFT and PAID", async () => {
      orderRepo.findOne.mockResolvedValue(
        mockOrder({ paymentStatus: SalesOrderPaymentStatus.PAID }),
      );
      await expect(service.assertEditAllowed("order-1")).resolves.not.toThrow();
    });

    it("passes when READY (persisted fully-paid order)", async () => {
      orderRepo.findOne.mockResolvedValue(
        mockOrder({
          status: SalesOrderStatus.READY,
          paymentStatus: SalesOrderPaymentStatus.PAID,
        }),
      );
      await expect(service.assertEditAllowed("order-1")).resolves.not.toThrow();
    });

    it("throws when status is FULFILLED", async () => {
      orderRepo.findOne.mockResolvedValue(
        mockOrder({ status: SalesOrderStatus.FULFILLED }),
      );
      await expect(service.assertEditAllowed("order-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws when status is CANCELLED", async () => {
      orderRepo.findOne.mockResolvedValue(
        mockOrder({ status: SalesOrderStatus.CANCELLED }),
      );
      await expect(service.assertEditAllowed("order-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // Drives the service's dataSource.transaction with a mock EntityManager whose
  // getRepository returns { findOne, update }.
  const setupTx = (
    findOneResult: SalesOrder | null,
  ): { findOne: jest.Mock; update: jest.Mock } => {
    const findOne = jest.fn().mockResolvedValue(findOneResult);
    const update = jest.fn().mockResolvedValue(undefined);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ findOne, update }),
    } as unknown as EntityManager;
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) =>
      cb(manager),
    );
    return { findOne, update };
  };

  describe("cancel", () => {
    it("throws when status is FULFILLED", async () => {
      setupTx(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      await expect(service.cancel("order-1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("throws when DRAFT but paymentStatus is not UNPAID", async () => {
      setupTx(mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }));
      await expect(service.cancel("order-1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("sets status to CANCELLED when DRAFT and UNPAID", async () => {
      const { update } = setupTx(mockOrder());

      await service.cancel("order-1");

      expect(update).toHaveBeenCalledWith(
        "order-1",
        expect.objectContaining({ status: SalesOrderStatus.CANCELLED }),
      );
    });
  });

  describe("cancel (locking)", () => {
    it("lock-reads the order through the transaction manager and persists via manager", async () => {
      const order = mockOrder({
        status: SalesOrderStatus.DRAFT,
        paymentStatus: SalesOrderPaymentStatus.UNPAID,
      });
      const findOne = jest.fn().mockResolvedValue(order);
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: jest.fn().mockReturnValue({ findOne, update }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: any) => cb(manager),
      );

      await service.cancel("order-1");

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1" },
          lock: { mode: "pessimistic_write" },
        }),
      );
      expect(update).toHaveBeenCalledWith(
        "order-1",
        expect.objectContaining({ status: SalesOrderStatus.CANCELLED }),
      );
    });

    it("throws ConflictException in-lock when the order is already FULFILLED", async () => {
      const findOne = jest
        .fn()
        .mockResolvedValue(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      const manager = {
        getRepository: jest
          .fn()
          .mockReturnValue({ findOne, update: jest.fn() }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: any) => cb(manager),
      );

      await expect(service.cancel("order-1")).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("uncancel", () => {
    it("throws when order is not CANCELLED", async () => {
      setupTx(mockOrder({ status: SalesOrderStatus.DRAFT }));
      await expect(service.uncancel("order-1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("sets status to DRAFT when CANCELLED", async () => {
      const { update } = setupTx(
        mockOrder({ status: SalesOrderStatus.CANCELLED }),
      );

      await service.uncancel("order-1");

      expect(update).toHaveBeenCalledWith(
        "order-1",
        expect.objectContaining({ status: SalesOrderStatus.DRAFT }),
      );
    });
  });
});
