import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { PaymentMethodService } from "./payment-method.service";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import { AccountMapping } from "../../../database/entities/account-mapping.entity";
import {
  ChartOfAccount,
  AccountType,
} from "../../../database/entities/chart-of-account.entity";
import { Payment } from "../../../database/entities/payment.entity";
import { Settlement } from "../../../database/entities/settlement.entity";

describe("PaymentMethodService", () => {
  let service: PaymentMethodService;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let accountMappingRepository: jest.Mocked<Repository<AccountMapping>>;
  let accountRepository: jest.Mocked<Repository<ChartOfAccount>>;
  let paymentRepository: jest.Mocked<Repository<Payment>>;
  let settlementRepository: jest.Mocked<Repository<Settlement>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodService,
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AccountMapping),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              delete: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({}),
            }),
          },
        },
        {
          provide: getRepositoryToken(Settlement),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              delete: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({}),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentMethodService>(PaymentMethodService);
    paymentMethodRepository = module.get(
      getRepositoryToken(PaymentMethodEntity),
    );
    accountMappingRepository = module.get(getRepositoryToken(AccountMapping));
    accountRepository = module.get(getRepositoryToken(ChartOfAccount));
    paymentRepository = module.get(getRepositoryToken(Payment));
    settlementRepository = module.get(getRepositoryToken(Settlement));
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("findOne should throw NotFoundException when item is missing", async () => {
    paymentMethodRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne("missing-id")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("create should reject duplicate code", async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: "1",
      code: "TNG",
      deletedAt: null,
    } as any);

    await expect(
      service.create({
        code: "TNG",
        name: "Touch n Go",
        requiresSettlement: true,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("getActiveList should return active methods sorted by repository order", async () => {
    paymentMethodRepository.find.mockResolvedValue([
      {
        id: "1",
        code: "CASH",
        name: "Cash",
        requiresSettlement: false,
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ] as any);

    const result = await service.getActiveList();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("CASH");
  });

  it("remove should throw NotFoundException when method is missing", async () => {
    paymentMethodRepository.findOne.mockResolvedValue(null);

    await expect(service.remove("missing-id")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("create should create account mappings when matching account exists", async () => {
    paymentMethodRepository.findOne.mockResolvedValueOnce(null);
    paymentMethodRepository.create.mockReturnValue({
      code: "CASH",
      name: "Cash",
      requiresSettlement: false,
      sortOrder: 1,
      isActive: true,
    } as PaymentMethodEntity);
    paymentMethodRepository.save.mockResolvedValue({
      id: "pm-1",
      code: "CASH",
      name: "Cash",
      requiresSettlement: false,
      sortOrder: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    accountMappingRepository.findOne.mockResolvedValue(null);
    accountRepository.findOne.mockResolvedValue({
      id: "acct-1",
      code: "1000",
      name: "Cash",
      type: AccountType.ASSET,
    } as any);
    accountMappingRepository.create.mockImplementation(
      (data: any) => data as any,
    );
    accountMappingRepository.save.mockResolvedValue({} as any);

    await service.create({
      code: "cash",
      name: "Cash",
      requiresSettlement: false,
    });

    expect(accountMappingRepository.save).toHaveBeenCalled();
  });

  it("should NOT create vendor_payment mapping when useForPurchases is false", async () => {
    const dto = {
      code: "TESTPM",
      name: "Test PM",
      requiresSettlement: false,
      useForPurchases: false,
    };
    const savedPm = {
      id: "pm-1",
      ...dto,
      sortOrder: 0,
      isActive: true,
      deletedAt: null,
    };

    paymentMethodRepository.findOne.mockResolvedValueOnce(null);
    paymentMethodRepository.create.mockReturnValue(savedPm as any);
    paymentMethodRepository.save.mockResolvedValue(savedPm as any);
    accountMappingRepository.findOne.mockResolvedValue(null);
    accountRepository.findOne.mockResolvedValue(null);
    accountMappingRepository.create.mockReturnValue({} as any);
    accountMappingRepository.save.mockResolvedValue({} as any);

    await service.create(dto as any);

    expect(accountMappingRepository.findOne).not.toHaveBeenCalledWith({
      where: { mappingType: "vendor_payment_testpm" },
    });
  });

  it("getDeletedList should return soft-deleted payment methods", async () => {
    paymentMethodRepository.find.mockResolvedValue([
      {
        id: "pm-deleted",
        code: "TNG",
        name: "Touch n Go",
        requiresSettlement: true,
        sortOrder: 3,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      },
    ] as any);

    const result = await service.getDeletedList();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("TNG");
  });

  it("restore should restore a soft-deleted payment method", async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: "pm-deleted",
      code: "TNG",
      name: "Touch n Go",
      requiresSettlement: true,
      sortOrder: 3,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as any);

    paymentMethodRepository.restore.mockResolvedValue({} as any);

    await service.restore("pm-deleted");

    expect(paymentMethodRepository.restore).toHaveBeenCalledWith("pm-deleted");
  });

  it("permanentDelete should throw ConflictException when payment method has payments", async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: "pm-1",
      code: "SHOPEE",
      name: "Shopee",
      requiresSettlement: true,
      deletedAt: new Date(),
    } as any);
    paymentRepository.count.mockResolvedValue(2);
    settlementRepository.count.mockResolvedValue(0);

    await expect(service.permanentDelete("pm-1")).rejects.toThrow(
      ConflictException,
    );
    expect(paymentMethodRepository.delete).not.toHaveBeenCalled();
  });

  it("permanentDelete should delete soft-deleted method when no references exist", async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: "pm-1",
      code: "SHOPEE",
      name: "Shopee",
      requiresSettlement: true,
      deletedAt: new Date(),
    } as any);
    paymentRepository.count.mockResolvedValue(0);
    settlementRepository.count.mockResolvedValue(0);
    accountMappingRepository.delete.mockResolvedValue({} as any);
    paymentMethodRepository.delete.mockResolvedValue({} as any);

    await service.permanentDelete("pm-1");

    expect(accountMappingRepository.delete).toHaveBeenCalled();
    expect(paymentMethodRepository.delete).toHaveBeenCalledWith("pm-1");
  });

  it("should deactivate vendor_payment mapping when useForPurchases toggled OFF", async () => {
    const id = "pm-1";
    const oldPm: any = {
      id,
      code: "BANK",
      name: "Bank",
      requiresSettlement: false,
      useForPurchases: true,
      deletedAt: null,
      sortOrder: 0,
      isActive: true,
    };
    const dto = { useForPurchases: false };

    paymentMethodRepository.findOne.mockResolvedValue(oldPm);
    paymentMethodRepository.save.mockResolvedValue({
      ...oldPm,
      useForPurchases: false,
    });

    const existingVendorMapping = {
      mappingType: "vendor_payment_bank",
      isActive: true,
    };
    accountMappingRepository.findOne.mockResolvedValue(
      existingVendorMapping as any,
    );
    accountMappingRepository.save.mockResolvedValue({
      ...existingVendorMapping,
      isActive: false,
    } as any);

    await service.update(id, dto as any);

    const savedCalls = accountMappingRepository.save.mock.calls;
    const deactivated = savedCalls.some(
      ([arg]: any) =>
        arg.mappingType === "vendor_payment_bank" && arg.isActive === false,
    );
    expect(deactivated).toBe(true);
  });

  it("should reactivate vendor_payment mapping when useForPurchases toggled ON", async () => {
    const id = "pm-1";
    const oldPm: any = {
      id,
      code: "BANK",
      name: "Bank",
      requiresSettlement: false,
      useForPurchases: false,
      deletedAt: null,
      sortOrder: 0,
      isActive: true,
    };
    const dto = { useForPurchases: true };

    paymentMethodRepository.findOne.mockResolvedValue(oldPm);
    paymentMethodRepository.save.mockResolvedValue({
      ...oldPm,
      useForPurchases: true,
    });

    const existingVendorMapping = {
      mappingType: "vendor_payment_bank",
      isActive: false,
    };
    accountMappingRepository.findOne.mockResolvedValue(
      existingVendorMapping as any,
    );
    accountMappingRepository.save.mockResolvedValue({
      ...existingVendorMapping,
      isActive: true,
    } as any);

    await service.update(id, dto as any);

    const savedCalls = accountMappingRepository.save.mock.calls;
    const reactivated = savedCalls.some(
      ([arg]: any) =>
        arg.mappingType === "vendor_payment_bank" && arg.isActive === true,
    );
    expect(reactivated).toBe(true);
  });
});
