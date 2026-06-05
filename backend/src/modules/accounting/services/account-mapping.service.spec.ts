import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { AccountMappingService } from "./account-mapping.service";
import {
  AccountMapping,
  MappingType,
} from "../../../database/entities/account-mapping.entity";
import { ChartOfAccount } from "../../../database/entities/chart-of-account.entity";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import { AuditLogService } from "../../audit-logs/services";
import {
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
} from "../dto/account-mapping.dto";

describe("AccountMappingService", () => {
  let service: AccountMappingService;
  let mappingRepository: jest.Mocked<Repository<AccountMapping>>;
  let accountRepository: jest.Mocked<Repository<ChartOfAccount>>;

  const mockAccountId = "123e4567-e89b-12d3-a456-426614174000";
  const mockMappingId = "223e4567-e89b-12d3-a456-426614174001";

  const mockAccount: Partial<ChartOfAccount> = {
    id: mockAccountId,
    code: "4000",
    name: "Sales Revenue",
    type: "REVENUE" as any,
    isActive: true,
  };

  const mockMapping: Partial<AccountMapping> = {
    id: mockMappingId,
    mappingType: MappingType.SALES_REVENUE,
    accountId: mockAccountId,
    description: "Sales revenue account",
    isActive: true,
    account: mockAccount as ChartOfAccount,
    createdAt: new Date(),
    updatedAt: new Date(),
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountMappingService,
        {
          provide: getRepositoryToken(AccountMapping),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            recover: jest.fn(),
            softDelete: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
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

    service = module.get<AccountMappingService>(AccountMappingService);
    mappingRepository = module.get(getRepositoryToken(AccountMapping));
    accountRepository = module.get(getRepositoryToken(ChartOfAccount));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getMappings", () => {
    it("should return mappings as object keyed by MappingType", async () => {
      const mockMappings = [
        { ...mockMapping, mappingType: MappingType.SALES_REVENUE },
        {
          ...mockMapping,
          mappingType: MappingType.SALES_AR,
          accountId: "another-id",
        },
      ];

      mappingRepository.find.mockResolvedValue(
        mockMappings as AccountMapping[],
      );

      const result = await service.getMappings();

      expect(result).toEqual({
        [MappingType.SALES_REVENUE]: mockAccountId,
        [MappingType.SALES_AR]: "another-id",
      });
      expect(mappingRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    it("should only include active mappings", async () => {
      const mockMappings = [
        {
          ...mockMapping,
          mappingType: MappingType.SALES_REVENUE,
          isActive: true,
        },
        { ...mockMapping, mappingType: MappingType.SALES_AR, isActive: false },
      ];

      mappingRepository.find.mockResolvedValue([
        mockMappings[0],
      ] as AccountMapping[]);

      const result = await service.getMappings();

      expect(result).toEqual({
        [MappingType.SALES_REVENUE]: mockAccountId,
      });
      expect(result[MappingType.SALES_AR]).toBeUndefined();
    });

    it("should return empty object when no mappings exist", async () => {
      mappingRepository.find.mockResolvedValue([]);

      const result = await service.getMappings();

      expect(result).toEqual({});
    });
  });

  describe("validateMappings", () => {
    it("should return validation result with all required mapping types", async () => {
      const allMappingTypes = Object.values(MappingType);
      const mockMappings = allMappingTypes.map((type, idx) => ({
        ...mockMapping,
        mappingType: type,
        accountId: `account-${idx}`,
      }));

      mappingRepository.find.mockResolvedValue(
        mockMappings as AccountMapping[],
      );

      const result = await service.validateMappings();

      expect(result.isValid).toBe(true);
      expect(result.missingMappings).toEqual([]);
      expect(result.configuredMappings).toHaveLength(allMappingTypes.length);
    });

    it("should identify missing mapping types", async () => {
      const mockMappings = [
        { ...mockMapping, mappingType: MappingType.SALES_REVENUE },
        { ...mockMapping, mappingType: MappingType.SALES_AR },
      ];

      mappingRepository.find.mockResolvedValue(
        mockMappings as AccountMapping[],
      );

      const result = await service.validateMappings();

      expect(result.isValid).toBe(false);
      expect(result.missingMappings.length).toBeGreaterThan(0);
      expect(result.missingMappings).toContain(MappingType.SALES_COGS);
      expect(result.missingMappings).toContain(MappingType.SALES_INVENTORY);
    });

    it("should return false when no mappings configured", async () => {
      mappingRepository.find.mockResolvedValue([]);

      const result = await service.validateMappings();

      expect(result.isValid).toBe(false);
      expect(result.missingMappings).toHaveLength(
        Object.values(MappingType).length,
      );
    });
  });

  describe("create", () => {
    const createDto: CreateAccountMappingDto = {
      mappingType: MappingType.SALES_REVENUE,
      accountId: mockAccountId,
      description: "Sales revenue account",
    };

    it("should create a new mapping successfully", async () => {
      // First findOne check for existing mapping
      mappingRepository.findOne.mockResolvedValueOnce(null);
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      mappingRepository.create.mockReturnValue(mockMapping as AccountMapping);
      mappingRepository.save.mockResolvedValue(mockMapping as AccountMapping);
      // Second findOne to reload with relations
      mappingRepository.findOne.mockResolvedValueOnce(
        mockMapping as AccountMapping,
      );

      const result = await service.create(createDto, "test-user");

      expect(result.id).toBe(mockMapping.id);
      expect(result.mappingType).toBe(mockMapping.mappingType);
      expect(mappingRepository.save).toHaveBeenCalled();
    });

    it("should throw ConflictException if mappingType already exists", async () => {
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      mappingRepository.findOne.mockResolvedValue(
        mockMapping as AccountMapping,
      );

      await expect(service.create(createDto, "test-user")).rejects.toThrow(
        ConflictException,
      );
    });

    it("should restore soft-deleted mapping type and update account", async () => {
      const deletedMapping = {
        ...mockMapping,
        deletedAt: new Date("2026-02-10T00:00:00.000Z"),
      };
      const restoredMapping = {
        ...deletedMapping,
        accountId: createDto.accountId,
        description: createDto.description,
        isActive: true,
        deletedAt: null,
      };

      mappingRepository.findOne.mockResolvedValueOnce(
        deletedMapping as AccountMapping,
      );
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      mappingRepository.recover.mockResolvedValue(
        restoredMapping as AccountMapping,
      );
      mappingRepository.save.mockResolvedValue(
        restoredMapping as AccountMapping,
      );
      mappingRepository.findOne.mockResolvedValueOnce(
        restoredMapping as AccountMapping,
      );

      const result = await service.create(createDto, "test-user");

      expect(mappingRepository.recover).toHaveBeenCalled();
      expect(mappingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: createDto.accountId,
          description: createDto.description,
          isActive: true,
          deletedAt: null,
        }),
      );
      expect(result.mappingType).toBe(createDto.mappingType);
    });

    it("should reactivate inactive mapping type and update account", async () => {
      const inactiveMapping = {
        ...mockMapping,
        isActive: false,
        deletedAt: null,
      };
      const reactivatedMapping = {
        ...inactiveMapping,
        accountId: createDto.accountId,
        description: createDto.description,
        isActive: true,
      };

      mappingRepository.findOne.mockResolvedValueOnce(
        inactiveMapping as AccountMapping,
      );
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      mappingRepository.save.mockResolvedValue(
        reactivatedMapping as AccountMapping,
      );
      mappingRepository.findOne.mockResolvedValueOnce(
        reactivatedMapping as AccountMapping,
      );

      const result = await service.create(createDto, "test-user");

      expect(mappingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: createDto.accountId,
          description: createDto.description,
          isActive: true,
          deletedAt: null,
        }),
      );
      expect(result.mappingType).toBe(createDto.mappingType);
    });

    it("should throw NotFoundException if account does not exist", async () => {
      mappingRepository.findOne.mockResolvedValue(null);
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createDto, "test-user")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException if account is inactive", async () => {
      mappingRepository.findOne.mockResolvedValue(null);
      // When account is inactive, findOne with isActive: true returns null
      accountRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createDto, "test-user")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findAll", () => {
    it("should return paginated mappings", async () => {
      const mockMappings = [mockMapping];
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockMappings, 1]);

      const result = await service.findAll({});

      expect(result.data[0].id).toBe(mockMapping.id);
      expect(result.data[0].mappingType).toBe(mockMapping.mappingType);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it("should filter by isActive", async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ isActive: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "mapping.isActive = :isActive",
        { isActive: true },
      );
    });

    it("should filter by mappingType", async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ mappingType: MappingType.SALES_REVENUE });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "mapping.mappingType = :mappingType",
        { mappingType: MappingType.SALES_REVENUE },
      );
    });
  });

  describe("findOne", () => {
    it("should return a mapping by id", async () => {
      mappingRepository.findOne.mockResolvedValue(
        mockMapping as AccountMapping,
      );

      const result = await service.findOne(mockMappingId);

      expect(result.id).toBe(mockMapping.id);
      expect(result.mappingType).toBe(mockMapping.mappingType);
      expect(result.accountId).toBe(mockMapping.accountId);
      expect(mappingRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockMappingId },
        relations: { account: true },
      });
    });

    it("should throw NotFoundException if mapping not found", async () => {
      mappingRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(mockMappingId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    const updateDto: UpdateAccountMappingDto = {
      accountId: "new-account-id",
      description: "Updated description",
    };

    it("should update a mapping successfully", async () => {
      const updatedMapping = { ...mockMapping, ...updateDto };
      // First findOne for getting the mapping
      mappingRepository.findOne.mockResolvedValueOnce(
        mockMapping as AccountMapping,
      );
      accountRepository.findOne.mockResolvedValue(
        mockAccount as ChartOfAccount,
      );
      mappingRepository.save.mockResolvedValue(
        updatedMapping as AccountMapping,
      );
      // Second findOne for reloading with relations
      mappingRepository.findOne.mockResolvedValueOnce(
        updatedMapping as AccountMapping,
      );

      const result = await service.update(
        mockMappingId,
        updateDto,
        "test-user",
      );

      expect(result.accountId).toBe(updateDto.accountId);
      expect(result.description).toBe(updateDto.description);
    });

    it("should throw NotFoundException if mapping not found", async () => {
      mappingRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(mockMappingId, updateDto, "test-user"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should validate account exists when updating accountId", async () => {
      const mapping = { ...mockMapping, accountId: mockAccountId };
      const newAccountDto = { accountId: "different-account-id" };

      mappingRepository.findOne.mockResolvedValueOnce(
        mapping as AccountMapping,
      );
      accountRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update(mockMappingId, newAccountDto, "test-user"),
      ).rejects.toThrow(NotFoundException);

      // Verify account validation was called
      expect(accountRepository.findOne).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should soft delete a mapping", async () => {
      mappingRepository.findOne.mockResolvedValue(
        mockMapping as AccountMapping,
      );
      mappingRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      await service.remove(mockMappingId, "test-user");

      expect(mappingRepository.softDelete).toHaveBeenCalledWith(mockMappingId);
    });

    it("should throw NotFoundException if mapping not found", async () => {
      mappingRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(mockMappingId, "test-user")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
