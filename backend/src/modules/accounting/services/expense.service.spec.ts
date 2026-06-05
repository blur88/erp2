import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { ExpenseService } from "./expense.service";
import {
  Expense,
  ExpenseStatus,
} from "../../../database/entities/expense.entity";
import {
  ChartOfAccount,
  AccountType,
} from "../../../database/entities/chart-of-account.entity";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import { AccountingService } from "./accounting.service";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";

describe("ExpenseService", () => {
  let service: ExpenseService;
  let expenseRepository: jest.Mocked<Repository<Expense>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let chartOfAccountRepository: jest.Mocked<Repository<ChartOfAccount>>;
  let accountingService: jest.Mocked<AccountingService>;
  let settingsService: jest.Mocked<SettingsService>;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: getRepositoryToken(Expense),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AccountingService,
          useValue: {
            postExpenseEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
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
      ],
    }).compile();

    service = module.get<ExpenseService>(ExpenseService);
    expenseRepository = module.get(getRepositoryToken(Expense));
    paymentMethodRepository = module.get(
      getRepositoryToken(PaymentMethodEntity),
    );
    chartOfAccountRepository = module.get(getRepositoryToken(ChartOfAccount));
    accountingService = module.get(AccountingService);
    settingsService = module.get(SettingsService);
    settingsService.generateDocumentNumber.mockResolvedValue("EXP-26-001");

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("findAll returns paginated results with filters", async () => {
    const row = {
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 10,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    mockQueryBuilder.getManyAndCount.mockResolvedValue([[row], 1]);

    const result = await service.findAll({
      page: 1,
      limit: 20,
      search: "util",
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
  });

  describe("findAll with includeDeleted", () => {
    const row = {
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 10,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    beforeEach(() => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[row], 1]);
    });

    it("does not call withDeleted when includeDeleted is false", async () => {
      await service.findAll({ includeDeleted: false });
      expect(mockQueryBuilder.withDeleted).not.toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        "e.deletedAt IS NULL",
      );
    });

    it("calls withDeleted when includeDeleted is true", async () => {
      await service.findAll({ includeDeleted: true });
      expect(mockQueryBuilder.withDeleted).toHaveBeenCalled();
    });
  });

  it("findOne returns a single expense with relations", async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 10,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.findOne("ex-1");
    expect(result.id).toBe("ex-1");
  });

  it("findOne throws NotFoundException for missing id", async () => {
    expenseRepository.findOne.mockResolvedValue(null);
    await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("create creates a draft expense", async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: "pm-1",
      isActive: true,
    } as any);

    chartOfAccountRepository.findOne.mockResolvedValue({
      id: "coa-1",
      code: "6000",
      name: "Utilities",
      type: AccountType.EXPENSE,
      accountType: AccountType.EXPENSE,
      isActive: true,
    } as any);

    expenseRepository.create.mockReturnValue({
      id: "ex-1",
      status: ExpenseStatus.DRAFT,
      expenseAccountId: "coa-1",
      paymentMethodId: "pm-1",
    } as any);

    expenseRepository.save.mockResolvedValue({ id: "ex-1" } as any);
    expenseRepository.findOne.mockResolvedValue({
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 50,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.create({
      expenseDate: "2026-02-01",
      expenseAccountId: "coa-1",
      amount: 50,
      paymentMethodId: "pm-1",
    });

    expect(result.status).toBe(ExpenseStatus.DRAFT);
  });

  it("create throws NotFoundException for invalid payment method", async () => {
    paymentMethodRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        expenseDate: "2026-02-01",
        expenseAccountId: "coa-1",
        amount: 50,
        paymentMethodId: "pm-x",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("create throws BadRequestException for non-expense account type", async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: "pm-1",
      isActive: true,
    } as any);

    chartOfAccountRepository.findOne.mockResolvedValue({
      id: "coa-1",
      code: "1000",
      name: "Cash",
      type: AccountType.ASSET,
      accountType: AccountType.ASSET,
      isActive: true,
    } as any);

    await expect(
      service.create({
        expenseDate: "2026-02-01",
        expenseAccountId: "coa-1",
        amount: 50,
        paymentMethodId: "pm-1",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("update updates a draft expense", async () => {
    expenseRepository.findOne.mockResolvedValueOnce({
      id: "ex-1",
      status: ExpenseStatus.DRAFT,
    } as any);

    expenseRepository.save.mockResolvedValue({} as any);
    expenseRepository.findOne.mockResolvedValueOnce({
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-02"),
      expenseAccountId: "coa-1",
      amount: 75,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.update("ex-1", {
      amount: 75,
      expenseDate: "2026-02-02",
    });

    expect(result.amount).toBe(75);
  });

  it("update throws BadRequestException for posted expense", async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: "ex-1",
      status: ExpenseStatus.POSTED,
    } as any);

    await expect(service.update("ex-1", { amount: 75 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("remove soft-deletes a draft expense", async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: "ex-1",
      status: ExpenseStatus.DRAFT,
    } as any);

    await service.remove("ex-1");
    expect(expenseRepository.softDelete).toHaveBeenCalledWith("ex-1");
  });

  it("remove throws BadRequestException for posted expense", async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: "ex-1",
      status: ExpenseStatus.POSTED,
    } as any);

    await expect(service.remove("ex-1")).rejects.toThrow(BadRequestException);
  });

  it("post calls accountingService.postExpenseEntry and updates status to POSTED", async () => {
    expenseRepository.findOne.mockResolvedValueOnce({
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 50,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      paymentMethod: { code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
    } as any);

    accountingService.postExpenseEntry.mockResolvedValue({ id: "je-1" } as any);
    expenseRepository.save.mockResolvedValue({} as any);

    expenseRepository.findOne.mockResolvedValueOnce({
      id: "ex-1",
      referenceNumber: "EXP-1",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 50,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.POSTED,
      journalEntryId: "je-1",
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.post("ex-1");

    expect(accountingService.postExpenseEntry).toHaveBeenCalled();
    expect(result.status).toBe(ExpenseStatus.POSTED);
    expect(result.journalEntryId).toBe("je-1");
  });

  it("post throws BadRequestException if already posted", async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: "ex-1",
      status: ExpenseStatus.POSTED,
    } as any);

    await expect(service.post("ex-1")).rejects.toThrow(BadRequestException);
  });

  it("bulkPost and bulkDelete work correctly", async () => {
    const postSpy = jest.spyOn(service, "post").mockResolvedValue({} as any);
    const removeSpy = jest.spyOn(service, "remove").mockResolvedValue();

    const postResult = await service.bulkPost({ ids: ["ex-1", "ex-2"] });
    const deleteResult = await service.bulkDelete({ ids: ["ex-1", "ex-2"] });

    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(removeSpy).toHaveBeenCalledTimes(2);
    expect(postResult).toEqual({ posted: 2, failed: 0 });
    expect(deleteResult).toEqual({ deleted: 2, failed: 0 });
  });

  describe("restore", () => {
    const deletedExpense = {
      id: "ex-del",
      referenceNumber: "EXP-DEL",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 10,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.DRAFT,
      deletedAt: new Date("2026-03-01"),
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    it("restores a soft-deleted expense", async () => {
      expenseRepository.findOne
        .mockResolvedValueOnce(deletedExpense)
        .mockResolvedValueOnce({ ...deletedExpense, deletedAt: null });
      expenseRepository.restore.mockResolvedValue(undefined as any);

      const result = await service.restore("ex-del", "user-1", "admin");

      expect(expenseRepository.restore).toHaveBeenCalledWith("ex-del");
      expect(result.id).toBe("ex-del");
    });

    it("throws NotFoundException for non-existent id", async () => {
      expenseRepository.findOne.mockResolvedValue(null);
      await expect(service.restore("bad-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws BadRequestException if expense is not deleted", async () => {
      expenseRepository.findOne.mockResolvedValue({
        ...deletedExpense,
        deletedAt: null,
      });
      await expect(service.restore("ex-del")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("unpost", () => {
    const postedExpense = {
      id: "ex-posted",
      referenceNumber: "EXP-POST",
      expenseDate: new Date("2026-02-01"),
      expenseAccountId: "coa-1",
      amount: 100,
      paymentMethodId: "pm-1",
      status: ExpenseStatus.POSTED,
      deletedAt: null,
      paymentMethod: { id: "pm-1", code: "CASH", name: "Cash" },
      expenseAccount: { id: "coa-1", code: "6000", name: "Utilities" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    it("reverses journal entry and sets status to REVERSED", async () => {
      expenseRepository.findOne
        .mockResolvedValueOnce(postedExpense)
        .mockResolvedValueOnce({
          ...postedExpense,
          status: ExpenseStatus.REVERSED,
        });
      accountingService.reverseSourceEntries.mockResolvedValue(
        undefined as any,
      );
      expenseRepository.save.mockResolvedValue({
        ...postedExpense,
        status: ExpenseStatus.REVERSED,
      } as any);

      const result = await service.unpost("ex-posted", "user-1", "admin");

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        "expense",
        "ex-posted",
        "user-1",
      );
      expect(expenseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ExpenseStatus.REVERSED }),
      );
      expect(result.status).toBe("reversed");
    });

    it("throws NotFoundException for non-existent id", async () => {
      expenseRepository.findOne.mockResolvedValue(null);
      await expect(service.unpost("bad-id")).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException if status is not POSTED", async () => {
      expenseRepository.findOne.mockResolvedValue({
        ...postedExpense,
        status: ExpenseStatus.DRAFT,
      });
      await expect(service.unpost("ex-posted")).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
