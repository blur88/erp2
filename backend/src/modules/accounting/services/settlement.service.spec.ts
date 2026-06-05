import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { In, IsNull } from "typeorm";
import { Repository } from "typeorm";
import {
  Settlement,
  SettlementStatus,
} from "../../../database/entities/settlement.entity";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import {
  Payment,
  SettlementStatusEnum,
} from "../../../database/entities/payment.entity";
import { SettlementService } from "./settlement.service";
import { AccountingService } from "./accounting.service";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";

const mockPaymentMethod = {
  id: "pm-1",
  code: "SHOPEE",
  name: "Shopee",
  requiresSettlement: true,
  isActive: true,
} as PaymentMethodEntity;

const mockPayment = {
  id: "p-1",
  paymentNumber: "PAY-1",
  amount: 100,
  paymentMethodId: "pm-1",
  settlementStatus: SettlementStatusEnum.PENDING,
  settlementId: null,
} as unknown as Payment;

const mockDraftSettlement = {
  id: "s-1",
  settlementNumber: "STL-26-001",
  paymentMethodId: "pm-1",
  settlementDate: new Date("2026-02-14"),
  totalAmount: 100,
  status: SettlementStatus.DRAFT,
  paymentMethod: mockPaymentMethod,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
} as Settlement;

const mockPostedSettlement = {
  ...mockDraftSettlement,
  status: SettlementStatus.POSTED,
} as Settlement;

describe("SettlementService", () => {
  let service: SettlementService;
  let settlementRepository: jest.Mocked<Repository<Settlement>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let paymentRepository: jest.Mocked<Repository<Payment>>;
  let accountingService: jest.Mocked<AccountingService>;
  let settingsService: jest.Mocked<SettingsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        {
          provide: getRepositoryToken(Settlement),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            delete: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            find: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: AccountingService,
          useValue: {
            postSettlementEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn().mockResolvedValue("STL-26-001"),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
    settlementRepository = module.get(getRepositoryToken(Settlement));
    paymentMethodRepository = module.get(
      getRepositoryToken(PaymentMethodEntity),
    );
    paymentRepository = module.get(getRepositoryToken(Payment));
    accountingService = module.get(AccountingService);
    settingsService = module.get(SettingsService);

    mockDraftSettlement.status = SettlementStatus.DRAFT;
    mockDraftSettlement.reference = undefined;
    mockPostedSettlement.status = SettlementStatus.POSTED;
    mockPostedSettlement.reference = undefined;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("creates settlement as draft and reserves only selected payments without posting journal entry", async () => {
      paymentMethodRepository.findOne.mockResolvedValue(mockPaymentMethod);
      paymentRepository.find.mockResolvedValue([mockPayment]);
      settlementRepository.create.mockReturnValue(mockDraftSettlement);
      settlementRepository.save.mockResolvedValue(mockDraftSettlement);
      settlementRepository.findOne.mockResolvedValue(mockDraftSettlement);
      paymentRepository.count.mockResolvedValue(1);

      const result = await service.create({
        paymentMethodId: "pm-1",
        settlementDate: "2026-02-14",
        paymentIds: ["p-1"],
      });

      expect(result.status).toBe(SettlementStatus.DRAFT);
      expect(paymentRepository.update).toHaveBeenCalledWith(
        { id: In(["p-1"]) },
        { settlementId: "s-1" },
      );
      expect(accountingService.postSettlementEntry).not.toHaveBeenCalled();
      expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith(
        "Settlements",
      );
    });

    it("throws if payment method does not require settlement", async () => {
      paymentMethodRepository.findOne.mockResolvedValue({
        ...mockPaymentMethod,
        requiresSettlement: false,
      } as PaymentMethodEntity);

      await expect(
        service.create({
          paymentMethodId: "pm-1",
          settlementDate: "2026-02-14",
          paymentIds: ["p-1"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws if a payment is already settled", async () => {
      paymentMethodRepository.findOne.mockResolvedValue(mockPaymentMethod);
      paymentRepository.find.mockResolvedValue([
        { ...mockPayment, settlementStatus: SettlementStatusEnum.SETTLED },
      ] as Payment[]);

      await expect(
        service.create({
          paymentMethodId: "pm-1",
          settlementDate: "2026-02-14",
          paymentIds: ["p-1"],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("post", () => {
    it("posts a draft settlement, settles reserved payments and calls postSettlementEntry", async () => {
      settlementRepository.findOne
        .mockResolvedValueOnce(mockDraftSettlement)
        .mockResolvedValueOnce(mockPostedSettlement);
      paymentRepository.find.mockResolvedValue([mockPayment]);
      settlementRepository.save.mockResolvedValue(mockPostedSettlement);
      paymentRepository.count.mockResolvedValue(1);

      const result = await service.post("s-1", "user-1");

      expect(paymentRepository.find).toHaveBeenCalledWith({
        where: {
          settlementId: "s-1",
          settlementStatus: SettlementStatusEnum.PENDING,
        },
      });
      expect(paymentRepository.update).toHaveBeenCalledWith(
        { id: In(["p-1"]) },
        { settlementStatus: SettlementStatusEnum.SETTLED },
      );
      expect(accountingService.postSettlementEntry).toHaveBeenCalled();
      expect(result.status).toBe(SettlementStatus.POSTED);
    });

    it("throws if settlement is already posted", async () => {
      settlementRepository.findOne.mockResolvedValue(mockPostedSettlement);

      await expect(service.post("s-1")).rejects.toThrow(BadRequestException);
    });

    it("throws if settlement not found", async () => {
      settlementRepository.findOne.mockResolvedValue(null);

      await expect(service.post("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("reverse", () => {
    it("reverses a posted settlement, keeps settlementId, returns payments to pending and reverses journal entries", async () => {
      settlementRepository.findOne.mockResolvedValue(mockPostedSettlement);
      settlementRepository.save.mockResolvedValue({
        ...mockPostedSettlement,
        status: SettlementStatus.REVERSED,
      } as Settlement);
      paymentRepository.count.mockResolvedValue(0);

      const result = await service.reverse("s-1", "user-1");

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        "settlement",
        "s-1",
        "user-1",
      );
      expect(paymentRepository.update).toHaveBeenCalledWith(
        { settlementId: "s-1" },
        { settlementStatus: SettlementStatusEnum.PENDING },
      );
      expect(result.status).toBe(SettlementStatus.REVERSED);
    });

    it("throws if settlement is not posted", async () => {
      settlementRepository.findOne.mockResolvedValue(mockDraftSettlement);

      await expect(service.reverse("s-1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("update", () => {
    it("updates metadata on a draft settlement", async () => {
      settlementRepository.findOne
        .mockResolvedValueOnce(mockDraftSettlement)
        .mockResolvedValueOnce({
          ...mockDraftSettlement,
          reference: "NEW-REF",
        } as Settlement);
      settlementRepository.save.mockResolvedValue({
        ...mockDraftSettlement,
        reference: "NEW-REF",
      } as Settlement);
      paymentRepository.count.mockResolvedValue(1);

      const result = await service.update("s-1", { reference: "NEW-REF" });

      expect(settlementRepository.save).toHaveBeenCalled();
      expect(result.reference).toBe("NEW-REF");
    });

    it("throws if settlement is posted", async () => {
      settlementRepository.findOne.mockResolvedValue(mockPostedSettlement);

      await expect(service.update("s-1", { reference: "X" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("remove", () => {
    it("soft deletes a draft settlement and unreserves its payments", async () => {
      settlementRepository.findOne.mockResolvedValue(mockDraftSettlement);
      settlementRepository.softDelete.mockResolvedValue({} as any);

      await service.remove("s-1", "user-1");

      expect(paymentRepository.update).toHaveBeenCalledWith(
        { settlementId: "s-1" },
        { settlementId: null },
      );
      expect(settlementRepository.softDelete).toHaveBeenCalledWith("s-1");
    });

    it("throws if settlement is posted", async () => {
      settlementRepository.findOne.mockResolvedValue(mockPostedSettlement);

      await expect(service.remove("s-1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("getPendingPayments", () => {
    it("returns only unreserved pending payments for the payment method", async () => {
      paymentRepository.find.mockResolvedValue([mockPayment]);

      await service.getPendingPayments("pm-1");

      expect(paymentRepository.find).toHaveBeenCalledWith({
        where: {
          paymentMethodId: "pm-1",
          settlementStatus: SettlementStatusEnum.PENDING,
          settlementId: IsNull(),
        },
        relations: { customer: true, paymentMethodEntity: true },
        order: { paymentDate: "ASC" },
      });
    });
  });

  describe("restore", () => {
    it("restores a soft-deleted settlement", async () => {
      const deleted = {
        ...mockDraftSettlement,
        deletedAt: new Date(),
      } as Settlement;
      settlementRepository.findOne
        .mockResolvedValueOnce(deleted)
        .mockResolvedValueOnce(mockDraftSettlement);
      settlementRepository.restore.mockResolvedValue({} as any);
      paymentRepository.count.mockResolvedValue(0);

      const result = await service.restore("s-1", "user-1");

      expect(settlementRepository.restore).toHaveBeenCalledWith("s-1");
      expect(result.id).toBe("s-1");
    });

    it("throws if settlement is not deleted", async () => {
      settlementRepository.findOne.mockResolvedValue(mockDraftSettlement);

      await expect(service.restore("s-1")).rejects.toThrow(BadRequestException);
    });
  });
});
