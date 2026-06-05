import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { FiscalPeriodService } from "./fiscal-period.service";
import {
  FiscalPeriod,
  FiscalPeriodStatus,
} from "../../../database/entities/fiscal-period.entity";
import {
  JournalEntry,
  JournalEntryStatus,
} from "../../../database/entities/journal-entry.entity";
import { AuditLogService } from "../../audit-logs/services";
import {
  CreateFiscalPeriodDto,
  UpdateFiscalPeriodDto,
  QueryFiscalPeriodsDto,
  GenerateFiscalPeriodsDto,
  ValidatePeriodDto,
} from "../dto/fiscal-period.dto";

describe("FiscalPeriodService", () => {
  let service: FiscalPeriodService;
  let fiscalPeriodRepository: jest.Mocked<Repository<FiscalPeriod>>;
  let journalEntryRepository: jest.Mocked<Repository<JournalEntry>>;

  const mockFiscalPeriod: Partial<FiscalPeriod> = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    code: "2026-01",
    name: "January 2026",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-31"),
    status: FiscalPeriodStatus.OPEN,
    isOpen: true,
    isClosed: false,
    durationDays: 31,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockQueryBuilder = (result: any = [], count: number = 0) => {
    return {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([
          Array.isArray(result) ? result : [result],
          count || (Array.isArray(result) ? result.length : 1),
        ]),
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalPeriodService,
        {
          provide: getRepositoryToken(FiscalPeriod),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(JournalEntry),
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

    service = module.get<FiscalPeriodService>(FiscalPeriodService);
    fiscalPeriodRepository = module.get(getRepositoryToken(FiscalPeriod));
    journalEntryRepository = module.get(getRepositoryToken(JournalEntry));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    const createDto: CreateFiscalPeriodDto = {
      code: "2026-01",
      name: "January 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-31"),
    };

    it("should create a new fiscal period successfully", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);
      fiscalPeriodRepository.create.mockReturnValue(
        mockFiscalPeriod as FiscalPeriod,
      );
      fiscalPeriodRepository.save.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      const queryBuilder = createMockQueryBuilder(null, 0);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.create(createDto);

      expect(result).toMatchObject({
        code: createDto.code,
        name: createDto.name,
      });
      expect(fiscalPeriodRepository.create).toHaveBeenCalledWith({
        ...createDto,
        status: FiscalPeriodStatus.OPEN,
      });
      expect(fiscalPeriodRepository.save).toHaveBeenCalled();
    });

    it("should throw ConflictException if period code already exists", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(fiscalPeriodRepository.save).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException if start date is after end date", async () => {
      const invalidDto = {
        ...createDto,
        startDate: new Date("2026-01-31"),
        endDate: new Date("2026-01-01"),
      };

      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.create(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw ConflictException if period dates overlap", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      const overlappingPeriod = { ...mockFiscalPeriod };
      const queryBuilder = createMockQueryBuilder(overlappingPeriod, 1);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should handle soft-deleted period with same code", async () => {
      const deletedPeriod = { ...mockFiscalPeriod, deletedAt: new Date() };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        deletedPeriod as FiscalPeriod,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(fiscalPeriodRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return paginated fiscal periods", async () => {
      const periods = [mockFiscalPeriod];
      const queryBuilder = createMockQueryBuilder(periods, periods.length);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const query: QueryFiscalPeriodsDto = { page: 1, limit: 20 };
      const result = await service.findAll(query);

      expect(result.data).toHaveLength(periods.length);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: periods.length,
      });
    });

    it("should apply search filter", async () => {
      const queryBuilder = createMockQueryBuilder([mockFiscalPeriod], 1);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      await service.findAll({ search: "January" });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("ILIKE"),
        expect.objectContaining({ search: "%January%" }),
      );
    });

    it("should apply status filter", async () => {
      const queryBuilder = createMockQueryBuilder([mockFiscalPeriod], 1);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      await service.findAll({ status: FiscalPeriodStatus.OPEN });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "period.status = :status",
        { status: FiscalPeriodStatus.OPEN },
      );
    });

    it("should apply year filter", async () => {
      const queryBuilder = createMockQueryBuilder([mockFiscalPeriod], 1);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      await service.findAll({ year: 2026 });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("period.startDate"),
        expect.objectContaining({
          yearStart: expect.any(Date),
          yearEnd: expect.any(Date),
        }),
      );
    });
  });

  describe("findOne", () => {
    it("should return a single fiscal period", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      const result = await service.findOne(mockFiscalPeriod.id!);

      expect(result).toMatchObject({
        id: mockFiscalPeriod.id,
        code: mockFiscalPeriod.code,
      });
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    const updateDto: UpdateFiscalPeriodDto = {
      name: "Updated January 2026",
    };

    it("should update a fiscal period successfully", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );
      fiscalPeriodRepository.save.mockResolvedValue({
        ...mockFiscalPeriod,
        ...updateDto,
      } as FiscalPeriod);

      const result = await service.update(mockFiscalPeriod.id!, updateDto);

      expect(result.name).toBe(updateDto.name);
      expect(fiscalPeriodRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update("non-existent-id", updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should validate date range when updating dates", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      const invalidUpdate = {
        startDate: new Date("2026-01-31"),
        endDate: new Date("2026-01-01"),
      };

      await expect(
        service.update(mockFiscalPeriod.id!, invalidUpdate),
      ).rejects.toThrow(BadRequestException);
    });

    it("should check for code conflicts when updating code", async () => {
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(mockFiscalPeriod as FiscalPeriod)
        .mockResolvedValueOnce({
          ...mockFiscalPeriod,
          id: "different-id",
        } as FiscalPeriod);

      await expect(
        service.update(mockFiscalPeriod.id!, { code: "2026-02" }),
      ).rejects.toThrow(ConflictException);
    });

    it("should check for overlapping periods when updating dates", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      const overlappingPeriod = { ...mockFiscalPeriod, id: "different-id" };
      const queryBuilder = createMockQueryBuilder(overlappingPeriod, 1);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      await expect(
        service.update(mockFiscalPeriod.id!, {
          startDate: new Date("2026-01-15"),
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("remove", () => {
    it("should soft delete a fiscal period successfully", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );
      journalEntryRepository.count.mockResolvedValue(0);
      fiscalPeriodRepository.softDelete.mockResolvedValue(undefined as any);

      await service.remove(mockFiscalPeriod.id!);

      expect(fiscalPeriodRepository.softDelete).toHaveBeenCalledWith(
        mockFiscalPeriod.id,
      );
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if period has journal entries", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );
      journalEntryRepository.count.mockResolvedValue(5);

      await expect(service.remove(mockFiscalPeriod.id!)).rejects.toThrow(
        BadRequestException,
      );
      expect(fiscalPeriodRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe("restore", () => {
    it("should restore a soft-deleted fiscal period", async () => {
      const deletedPeriod = { ...mockFiscalPeriod, deletedAt: new Date() };
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(deletedPeriod as FiscalPeriod)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockFiscalPeriod as FiscalPeriod);
      fiscalPeriodRepository.restore.mockResolvedValue(undefined as any);

      const result = await service.restore(mockFiscalPeriod.id!);

      expect(result).toMatchObject({ code: mockFiscalPeriod.code });
      expect(fiscalPeriodRepository.restore).toHaveBeenCalledWith(
        mockFiscalPeriod.id,
      );
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.restore("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if period is not deleted", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      await expect(service.restore(mockFiscalPeriod.id!)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw ConflictException if code is now used by another period", async () => {
      const deletedPeriod = { ...mockFiscalPeriod, deletedAt: new Date() };
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(deletedPeriod as FiscalPeriod)
        .mockResolvedValueOnce({
          ...mockFiscalPeriod,
          id: "different-id",
        } as FiscalPeriod);

      await expect(service.restore(mockFiscalPeriod.id!)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("generateFiscalPeriods", () => {
    it("should generate 12 monthly periods for a year", async () => {
      const dto: GenerateFiscalPeriodsDto = { year: 2026 };

      fiscalPeriodRepository.findOne.mockResolvedValue(null);
      fiscalPeriodRepository.create.mockImplementation(
        (data) => data as FiscalPeriod,
      );
      fiscalPeriodRepository.save.mockImplementation((data) =>
        Promise.resolve(data as FiscalPeriod),
      );

      const queryBuilder = createMockQueryBuilder(null, 0);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.generateFiscalPeriods(dto);

      expect(result).toHaveLength(12);
      expect(result[0].code).toBe("2026-01");
      expect(result[0].name).toBe("January 2026");
      expect(result[11].code).toBe("2026-12");
      expect(result[11].name).toBe("December 2026");
    });

    it("should generate periods starting from a specific month", async () => {
      const dto: GenerateFiscalPeriodsDto = { year: 2026, startMonth: 7 };

      fiscalPeriodRepository.findOne.mockResolvedValue(null);
      fiscalPeriodRepository.create.mockImplementation(
        (data) => data as FiscalPeriod,
      );
      fiscalPeriodRepository.save.mockImplementation((data) =>
        Promise.resolve(data as FiscalPeriod),
      );

      const queryBuilder = createMockQueryBuilder(null, 0);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.generateFiscalPeriods(dto);

      expect(result).toHaveLength(12);
      expect(result[0].code).toBe("2026-07");
      expect(result[0].name).toBe("July 2026");
    });

    it("should skip already existing periods", async () => {
      const dto: GenerateFiscalPeriodsDto = { year: 2026 };

      // Mock that first period already exists
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(mockFiscalPeriod as FiscalPeriod)
        .mockResolvedValue(null);

      fiscalPeriodRepository.create.mockImplementation(
        (data) => data as FiscalPeriod,
      );
      fiscalPeriodRepository.save.mockImplementation((data) =>
        Promise.resolve(data as FiscalPeriod),
      );

      const queryBuilder = createMockQueryBuilder(null, 0);
      fiscalPeriodRepository.createQueryBuilder.mockReturnValue(
        queryBuilder as any,
      );

      const result = await service.generateFiscalPeriods(dto);

      expect(result.length).toBeLessThan(12);
    });
  });

  describe("closePeriod", () => {
    it("should close an open fiscal period", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );
      journalEntryRepository.count.mockResolvedValue(0);
      fiscalPeriodRepository.save.mockResolvedValue({
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
      } as FiscalPeriod);

      const result = await service.closePeriod(mockFiscalPeriod.id!);

      expect(result.status).toBe(FiscalPeriodStatus.CLOSED);
      expect(fiscalPeriodRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.closePeriod("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if period is already closed", async () => {
      const closedPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
      };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        closedPeriod as FiscalPeriod,
      );

      await expect(service.closePeriod(mockFiscalPeriod.id!)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if period has draft entries", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );
      journalEntryRepository.count.mockResolvedValue(2);

      await expect(service.closePeriod(mockFiscalPeriod.id!)).rejects.toThrow(
        BadRequestException,
      );
      expect(fiscalPeriodRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("reopenPeriod", () => {
    it("should reopen the most recently closed period", async () => {
      const closedPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
      };
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(closedPeriod as FiscalPeriod)
        .mockResolvedValueOnce(closedPeriod as FiscalPeriod);
      fiscalPeriodRepository.save.mockResolvedValue({
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.OPEN,
      } as FiscalPeriod);

      const result = await service.reopenPeriod(mockFiscalPeriod.id!);

      expect(result.status).toBe(FiscalPeriodStatus.OPEN);
      expect(fiscalPeriodRepository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.reopenPeriod("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException if period is already open", async () => {
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(mockFiscalPeriod as FiscalPeriod)
        .mockResolvedValueOnce(null); // No closed periods found

      await expect(service.reopenPeriod(mockFiscalPeriod.id!)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if trying to reopen non-recent period", async () => {
      const closedPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
      };
      const recentClosedPeriod = {
        ...mockFiscalPeriod,
        id: "different-id",
        code: "2026-02",
        status: FiscalPeriodStatus.CLOSED,
      };
      fiscalPeriodRepository.findOne
        .mockResolvedValueOnce(closedPeriod as FiscalPeriod)
        .mockResolvedValueOnce(recentClosedPeriod as FiscalPeriod);

      await expect(service.reopenPeriod(mockFiscalPeriod.id!)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getCurrentPeriod", () => {
    it("should return the current open period", async () => {
      const openPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.OPEN,
        isOpen: true,
        isClosed: false,
      };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        openPeriod as FiscalPeriod,
      );

      const result = await service.getCurrentPeriod();

      expect(result).toMatchObject({
        code: mockFiscalPeriod.code,
        status: FiscalPeriodStatus.OPEN,
      });
    });

    it("should return null if no current open period found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      const result = await service.getCurrentPeriod();

      expect(result).toBeNull();
    });
  });

  describe("validatePeriod", () => {
    it("should validate a date within an open period", async () => {
      const dto: ValidatePeriodDto = { date: new Date("2026-01-15") };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      const result = await service.validatePeriod(dto);

      expect(result.isValid).toBe(true);
      expect(result.period).toBeDefined();
    });

    it("should return invalid for date not in any open period", async () => {
      const dto: ValidatePeriodDto = { date: new Date("2025-12-31") };
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      const result = await service.validatePeriod(dto);

      expect(result.isValid).toBe(false);
      expect(result.period).toBeUndefined();
    });
  });

  describe("checkPeriodOpen", () => {
    it("should return true for an open period", async () => {
      const openPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.OPEN,
        isOpen: true,
        isClosed: false,
      };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        openPeriod as FiscalPeriod,
      );

      const result = await service.checkPeriodOpen(mockFiscalPeriod.id!);

      expect(result).toBe(true);
    });

    it("should return false for a closed period", async () => {
      const closedPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
        isOpen: false,
        isClosed: true,
      };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        closedPeriod as FiscalPeriod,
      );

      const result = await service.checkPeriodOpen(mockFiscalPeriod.id!);

      expect(result).toBe(false);
    });

    it("should throw NotFoundException if period not found", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.checkPeriodOpen("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getPeriodByDate", () => {
    it("should return period for a given date", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(
        mockFiscalPeriod as FiscalPeriod,
      );

      const result = await service.getPeriodByDate(new Date("2026-01-15"));

      expect(result).toBeDefined();
      expect(result?.id).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect(result?.code).toBe("2026-01");
    });

    it("should return null if no period found for date", async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      const result = await service.getPeriodByDate(new Date("2025-12-15"));

      expect(result).toBeNull();
    });

    it("should return period regardless of status", async () => {
      const closedPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
      };
      fiscalPeriodRepository.findOne.mockResolvedValue(
        closedPeriod as FiscalPeriod,
      );

      const result = await service.getPeriodByDate(new Date("2026-01-15"));

      expect(result).toBeDefined();
      expect(result?.status).toBe(FiscalPeriodStatus.CLOSED);
    });
  });
});
