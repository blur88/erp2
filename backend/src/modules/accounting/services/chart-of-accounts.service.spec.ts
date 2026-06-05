import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ChartOfAccountsService } from "./chart-of-accounts.service";
import {
  ChartOfAccount,
  AccountType,
} from "../../../database/entities/chart-of-account.entity";
import { JournalEntryLine } from "../../../database/entities/journal-entry-line.entity";
import { AccountMapping } from "../../../database/entities/account-mapping.entity";
import { BankReconciliation } from "../../../database/entities/bank-reconciliation.entity";
import { AuditLogService } from "../../audit-logs/services";
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
  QueryChartOfAccountsDto,
} from "../dto/chart-of-account.dto";

describe("ChartOfAccountsService", () => {
  let service: ChartOfAccountsService;
  let accountRepository: jest.Mocked<Repository<ChartOfAccount>>;
  let journalEntryLineRepository: jest.Mocked<Repository<JournalEntryLine>>;
  let accountMappingRepository: jest.Mocked<Repository<AccountMapping>>;
  let bankReconciliationRepository: jest.Mocked<Repository<BankReconciliation>>;

  const mockAccount: Partial<ChartOfAccount> = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    code: "1000",
    name: "Cash",
    type: AccountType.ASSET,
    isActive: true,
    parentId: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    fullCode: "1000",
    isParent: false,
  };

  const mockQueryBuilder: any = {
    createQueryBuilder: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChartOfAccountsService,
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            remove: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(JournalEntryLine),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AccountMapping),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BankReconciliation),
          useValue: {
            count: jest.fn(),
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

    service = module.get<ChartOfAccountsService>(ChartOfAccountsService);
    accountRepository = module.get(getRepositoryToken(ChartOfAccount));
    journalEntryLineRepository = module.get(
      getRepositoryToken(JournalEntryLine),
    );
    accountMappingRepository = module.get(getRepositoryToken(AccountMapping));
    bankReconciliationRepository = module.get(
      getRepositoryToken(BankReconciliation),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    const createDto: CreateChartOfAccountDto = {
      code: "1000",
      name: "Cash",
      type: AccountType.ASSET,
    };

    it("should create a new account successfully", async () => {
      accountRepository.findOne.mockResolvedValue(null);
      accountRepository.create.mockReturnValue(mockAccount as ChartOfAccount);
      accountRepository.save.mockResolvedValue(mockAccount as ChartOfAccount);

      const result = await service.create(createDto);

      expect(result).toMatchObject({
        code: "1000",
        name: "Cash",
        type: AccountType.ASSET,
      });
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { code: "1000" },
        withDeleted: true,
      });
      expect(accountRepository.save).toHaveBeenCalled();
    });

    it("should throw ConflictException if account code already exists", async () => {
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(accountRepository.save).not.toHaveBeenCalled();
    });

    it("should throw ConflictException if code was previously deleted", async () => {
      const deletedAccount = { ...mockAccount, deletedAt: new Date() };
      accountRepository.findOne.mockResolvedValue(
        deletedAccount as ChartOfAccount,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(accountRepository.save).not.toHaveBeenCalled();
    });

    it("should validate parent account exists when parentId is provided", async () => {
      const createDtoWithParent = {
        ...createDto,
        code: "1010",
        name: "Petty Cash",
        parentId: mockAccount.id,
      };

      accountRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing code
        .mockResolvedValueOnce(mockAccount as ChartOfAccount); // Find parent

      accountRepository.create.mockReturnValue({
        ...mockAccount,
        code: "1010",
        name: "Petty Cash",
      } as ChartOfAccount);
      accountRepository.save.mockResolvedValue({
        ...mockAccount,
        code: "1010",
        name: "Petty Cash",
      } as ChartOfAccount);

      const result = await service.create(createDtoWithParent);

      expect(result.code).toBe("1010");
      expect(accountRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it("should throw NotFoundException if parent account does not exist", async () => {
      const createDtoWithParent = {
        ...createDto,
        parentId: "non-existent-id",
      };

      accountRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing code
        .mockResolvedValueOnce(null); // Parent not found

      await expect(service.create(createDtoWithParent)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if parent account has different type", async () => {
      const liabilityAccount = {
        ...mockAccount,
        type: AccountType.LIABILITY,
      };
      const createDtoWithParent = {
        ...createDto,
        parentId: mockAccount.id,
        type: AccountType.ASSET,
      };

      accountRepository.findOne
        .mockResolvedValueOnce(null) // Check for existing code
        .mockResolvedValueOnce(liabilityAccount as ChartOfAccount); // Parent is LIABILITY

      await expect(service.create(createDtoWithParent)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("findAll", () => {
    const queryDto: QueryChartOfAccountsDto = {
      page: 1,
      limit: 20,
    };

    it("should return paginated accounts", async () => {
      const accounts = [
        mockAccount,
        { ...mockAccount, id: "456", code: "1100", name: "Bank Account" },
      ];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([accounts, 2]);

      const result = await service.findAll(queryDto);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        "account.deletedAt IS NULL",
      );
    });

    it("should filter by search term", async () => {
      const queryWithSearch = { ...queryDto, search: "cash" };
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockAccount], 1]);

      await service.findAll(queryWithSearch);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "(account.code ILIKE :search OR account.name ILIKE :search)",
        { search: "%cash%" },
      );
    });

    it("should filter by account type", async () => {
      const queryWithType = { ...queryDto, type: AccountType.ASSET };
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockAccount], 1]);

      await service.findAll(queryWithType);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "account.type = :type",
        { type: AccountType.ASSET },
      );
    });

    it("should filter by isActive status", async () => {
      const queryWithActive = { ...queryDto, isActive: true };
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockAccount], 1]);

      await service.findAll(queryWithActive);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "account.isActive = :isActive",
        { isActive: true },
      );
    });

    it("should sort by specified field", async () => {
      const queryWithSort = {
        ...queryDto,
        sortBy: "name",
        sortOrder: "DESC" as const,
      };
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockAccount], 1]);

      await service.findAll(queryWithSort);

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        "account.name",
        "DESC",
      );
    });
  });

  describe("findOne", () => {
    it("should return account by id", async () => {
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );

      const result = await service.findOne(mockAccount.id!);

      expect(result).toMatchObject({
        code: "1000",
        name: "Cash",
      });
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAccount.id },
        relations: { parent: true, children: true },
      });
    });

    it("should throw NotFoundException if account not found", async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    const updateDto: UpdateChartOfAccountDto = {
      name: "Updated Cash Account",
    };

    it("should update account successfully", async () => {
      const updatedAccount = { ...mockAccount, name: "Updated Cash Account" };
      accountRepository.findOne
        .mockResolvedValueOnce(mockAccount as ChartOfAccount)
        .mockResolvedValueOnce(updatedAccount as ChartOfAccount);
      accountRepository.save.mockResolvedValue(
        updatedAccount as ChartOfAccount,
      );

      const result = await service.update(mockAccount.id!, updateDto);

      expect(result.name).toBe("Updated Cash Account");
      expect(accountRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if account not found", async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update("non-existent-id", updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when updating to existing code", async () => {
      const existingAccount = {
        ...mockAccount,
        id: "different-id",
        code: "2000",
      };
      const updateDtoWithCode = { code: "2000" };

      accountRepository.findOne
        .mockResolvedValueOnce(mockAccount as ChartOfAccount)
        .mockResolvedValueOnce(existingAccount as ChartOfAccount);

      await expect(
        service.update(mockAccount.id!, updateDtoWithCode),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw BadRequestException for circular reference (self as parent)", async () => {
      const updateDtoWithSelfParent = { parentId: mockAccount.id };

      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );

      await expect(
        service.update(mockAccount.id!, updateDtoWithSelfParent),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("remove", () => {
    it("should soft delete account successfully", async () => {
      const accountWithoutChildren = { ...mockAccount, children: [] };
      accountRepository.findOne.mockResolvedValue(
        accountWithoutChildren as ChartOfAccount,
      );
      journalEntryLineRepository.count.mockResolvedValue(0);
      accountRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      await service.remove(mockAccount.id!);

      expect(accountRepository.softDelete).toHaveBeenCalledWith(mockAccount.id);
    });

    it("should throw NotFoundException if account not found", async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if account has children", async () => {
      const accountWithChildren = {
        ...mockAccount,
        children: [{ id: "child-1" }] as ChartOfAccount[],
      };
      accountRepository.findOne.mockResolvedValue(
        accountWithChildren as ChartOfAccount,
      );

      await expect(service.remove(mockAccount.id!)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if account has journal entries", async () => {
      const accountWithoutChildren = { ...mockAccount, children: [] };
      accountRepository.findOne.mockResolvedValue(
        accountWithoutChildren as ChartOfAccount,
      );
      journalEntryLineRepository.count.mockResolvedValue(5);

      await expect(service.remove(mockAccount.id!)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("restore", () => {
    it("should restore soft-deleted account", async () => {
      const deletedAccount = { ...mockAccount, deletedAt: new Date() };
      accountRepository.findOne
        .mockResolvedValueOnce(deletedAccount as ChartOfAccount)
        .mockResolvedValueOnce(null) // Check code uniqueness
        .mockResolvedValueOnce(mockAccount as ChartOfAccount); // Return restored
      accountRepository.restore.mockResolvedValue({ affected: 1 } as any);

      const result = await service.restore(mockAccount.id!);

      expect(result.code).toBe("1000");
      expect(accountRepository.restore).toHaveBeenCalledWith(mockAccount.id);
    });

    it("should throw NotFoundException if account not found", async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.restore("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if account is not deleted", async () => {
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );

      await expect(service.restore(mockAccount.id!)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw ConflictException if code is now used by another account", async () => {
      const deletedAccount = { ...mockAccount, deletedAt: new Date() };
      const existingAccount = { ...mockAccount, id: "different-id" };
      accountRepository.findOne
        .mockResolvedValueOnce(deletedAccount as ChartOfAccount)
        .mockResolvedValueOnce(existingAccount as ChartOfAccount);

      await expect(service.restore(mockAccount.id!)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("bulkRestore", () => {
    it("should restore valid accounts and return failed IDs", async () => {
      const restoreSpy = jest
        .spyOn(service, "restore")
        .mockResolvedValue(mockAccount as any)
        .mockRejectedValueOnce(new NotFoundException("not found"));

      const result = await service.bulkRestore(["missing-id", "valid-id"]);

      expect(restoreSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        restoredCount: 1,
        failedIds: ["missing-id"],
      });
    });
  });

  describe("bulkPermanentDelete", () => {
    it("should permanently delete valid accounts and return failed IDs", async () => {
      const deleteSpy = jest
        .spyOn(service, "permanentDelete")
        .mockResolvedValue(undefined)
        .mockRejectedValueOnce(new BadRequestException("invalid"));

      const result = await service.bulkPermanentDelete(["bad-id", "valid-id"]);

      expect(deleteSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        deletedCount: 1,
        failedIds: ["bad-id"],
        failedItems: [
          {
            id: "bad-id",
            reason: "invalid",
          },
        ],
      });
    });
  });

  describe("permanentDelete", () => {
    it("should remove cleared (soft-deleted) mappings before permanent account delete", async () => {
      const deletedAccount = {
        ...mockAccount,
        deletedAt: new Date(),
        children: [],
      };

      accountRepository.findOne.mockResolvedValue(
        deletedAccount as ChartOfAccount,
      );
      journalEntryLineRepository.count.mockResolvedValue(0);
      accountMappingRepository.count.mockResolvedValue(0);
      accountMappingRepository.delete.mockResolvedValue({ affected: 1 } as any);
      bankReconciliationRepository.count.mockResolvedValue(0);
      accountRepository.remove.mockResolvedValue(
        deletedAccount as ChartOfAccount,
      );

      await service.permanentDelete(mockAccount.id!);

      expect(accountMappingRepository.delete).toHaveBeenCalledWith({
        accountId: mockAccount.id,
      });
      expect(accountRepository.remove).toHaveBeenCalledWith(deletedAccount);
    });

    it("should throw clear error when account is used by active mappings", async () => {
      const deletedAccount = {
        ...mockAccount,
        deletedAt: new Date(),
        children: [],
      };

      accountRepository.findOne.mockResolvedValue(
        deletedAccount as ChartOfAccount,
      );
      journalEntryLineRepository.count.mockResolvedValue(0);
      accountMappingRepository.count.mockResolvedValue(2);
      accountMappingRepository.find.mockResolvedValue([
        { mappingType: "sales_revenue" },
        { mappingType: "payment_cash" },
      ] as AccountMapping[]);

      await expect(service.permanentDelete(mockAccount.id!)).rejects.toThrow(
        "used in account mapping(s): payment_cash, sales_revenue. Clear those mappings first.",
      );
      expect(accountRepository.remove).not.toHaveBeenCalled();
    });

    it("should throw clear error when account is used by bank reconciliations", async () => {
      const deletedAccount = {
        ...mockAccount,
        deletedAt: new Date(),
        children: [],
      };

      accountRepository.findOne.mockResolvedValue(
        deletedAccount as ChartOfAccount,
      );
      journalEntryLineRepository.count.mockResolvedValue(0);
      accountMappingRepository.count.mockResolvedValue(0);
      bankReconciliationRepository.count.mockResolvedValue(3);

      await expect(service.permanentDelete(mockAccount.id!)).rejects.toThrow(
        "it has 3 bank reconciliation(s).",
      );
      expect(accountRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe("getAccountHierarchy", () => {
    it("should return hierarchical account tree", async () => {
      const parentAccount = { ...mockAccount, id: "parent-1" };
      const childAccount = {
        ...mockAccount,
        id: "child-1",
        code: "1010",
        name: "Petty Cash",
        parentId: "parent-1",
      };
      const accounts = [parentAccount, childAccount];

      accountRepository.find.mockResolvedValue(accounts as ChartOfAccount[]);

      const result = await service.getAccountHierarchy();

      expect(result.data).toBeDefined();
      expect(result.meta.totalAccounts).toBe(2);
      expect(result.meta.accountsByType).toHaveProperty(AccountType.ASSET);
    });
  });

  describe("getChildren", () => {
    it("should return direct children of an account", async () => {
      const childAccounts = [
        { ...mockAccount, id: "child-1", parentId: mockAccount.id },
        { ...mockAccount, id: "child-2", parentId: mockAccount.id },
      ];

      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      accountRepository.find.mockResolvedValue(
        childAccounts as ChartOfAccount[],
      );

      const result = await service.getChildren(mockAccount.id!);

      expect(result).toHaveLength(2);
    });

    it("should throw NotFoundException if parent account not found", async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.getChildren("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getRecentActivity", () => {
    const accountId = "123e4567-e89b-12d3-a456-426614174000";

    it("should throw NotFoundException when account does not exist", async () => {
      accountRepository.findOne.mockResolvedValue(null);
      await expect(service.getRecentActivity(accountId, 10)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should return empty array when no journal entry lines exist", async () => {
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      journalEntryLineRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQb);
      const result = await service.getRecentActivity(accountId, 10);
      expect(result).toEqual([]);
    });

    it("should return mapped activity items", async () => {
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      const mockQb = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            date: "2026-01-15",
            reference: "JE-2026-001",
            description: "Test entry",
            debit: "100.0000",
            credit: "0.0000",
          },
        ]),
      };
      journalEntryLineRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQb);
      const result = await service.getRecentActivity(accountId, 10);
      expect(result).toHaveLength(1);
      expect(result[0].reference).toBe("JE-2026-001");
      expect(result[0].debit).toBe(100);
      expect(result[0].credit).toBeNull();
    });
  });

  describe("seedDefaultChartOfAccounts", () => {
    it("should seed default accounts when none exist", async () => {
      accountRepository.count.mockResolvedValue(0);
      accountRepository.findOne.mockResolvedValue(null);
      accountRepository.create.mockImplementation(
        (dto: any) => dto as ChartOfAccount,
      );
      accountRepository.save.mockImplementation((account: any) =>
        Promise.resolve(account as ChartOfAccount),
      );

      await service.seedDefaultChartOfAccounts();

      expect(accountRepository.save).toHaveBeenCalled();
    });

    it("should skip seeding if accounts already exist", async () => {
      accountRepository.count.mockResolvedValue(10);

      await service.seedDefaultChartOfAccounts();

      expect(accountRepository.save).not.toHaveBeenCalled();
    });
  });
});
