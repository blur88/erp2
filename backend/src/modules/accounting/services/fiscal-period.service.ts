import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from "typeorm";
import {
  FiscalPeriod,
  FiscalPeriodStatus,
} from "../../../database/entities/fiscal-period.entity";
import {
  JournalEntry,
  JournalEntryStatus,
} from "../../../database/entities/journal-entry.entity";
import {
  CreateFiscalPeriodDto,
  UpdateFiscalPeriodDto,
  QueryFiscalPeriodsDto,
  GenerateFiscalPeriodsDto,
  ValidatePeriodDto,
  FiscalPeriodResponseDto,
  FiscalPeriodListResponseDto,
  FiscalPeriodValidationResponseDto,
} from "../dto/fiscal-period.dto";
import { AuditLogService } from "../../audit-logs/services";

@Injectable()
export class FiscalPeriodService {
  private readonly logger = new Logger(FiscalPeriodService.name);

  constructor(
    @InjectRepository(FiscalPeriod)
    private readonly fiscalPeriodRepository: Repository<FiscalPeriod>,
    @InjectRepository(JournalEntry)
    private readonly journalEntryRepository: Repository<JournalEntry>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new fiscal period
   */
  async create(
    createDto: CreateFiscalPeriodDto,
    userId?: string,
    username?: string,
  ): Promise<FiscalPeriodResponseDto> {
    this.logger.log(`Creating fiscal period with code: ${createDto.code}`);

    // Check if period code already exists
    const existingPeriod = await this.fiscalPeriodRepository.findOne({
      where: { code: createDto.code },
      withDeleted: true,
    });

    if (existingPeriod) {
      if (existingPeriod.deletedAt) {
        throw new ConflictException(
          `Fiscal period with code '${createDto.code}' was previously deleted. ` +
            `Please restore it or use a different code.`,
        );
      }
      throw new ConflictException(
        `Fiscal period with code '${createDto.code}' already exists`,
      );
    }

    // Validate date range
    if (createDto.startDate >= createDto.endDate) {
      throw new BadRequestException("Start date must be before end date");
    }

    // Check for overlapping periods
    const overlappingPeriod = await this.fiscalPeriodRepository
      .createQueryBuilder("period")
      .where("period.deletedAt IS NULL")
      .andWhere(
        "(period.startDate <= :endDate AND period.endDate >= :startDate)",
        {
          startDate: createDto.startDate,
          endDate: createDto.endDate,
        },
      )
      .getOne();

    if (overlappingPeriod) {
      throw new ConflictException(
        `Period dates overlap with existing period '${overlappingPeriod.code}' ` +
          `(${overlappingPeriod.startDate} to ${overlappingPeriod.endDate})`,
      );
    }

    // Create the fiscal period
    const fiscalPeriod = this.fiscalPeriodRepository.create({
      ...createDto,
      status: createDto.status ?? FiscalPeriodStatus.OPEN,
    });

    const savedPeriod = await this.fiscalPeriodRepository.save(fiscalPeriod);

    await this.auditLogService.log(
      "CREATE",
      "FiscalPeriod",
      `Created fiscal period: ${savedPeriod.code} - ${savedPeriod.name}`,
      { entityId: savedPeriod.id, userId: userId ?? "system", username },
    );

    this.logger.log(
      `Fiscal period created successfully with ID: ${savedPeriod.id}`,
    );
    return this.toResponseDto(savedPeriod);
  }

  /**
   * Find all fiscal periods with filtering, sorting, and pagination
   */
  async findAll(
    query: QueryFiscalPeriodsDto,
  ): Promise<FiscalPeriodListResponseDto> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      year,
      sortBy = "startDate",
      sortOrder = "DESC",
    } = query;

    const queryBuilder = this.fiscalPeriodRepository
      .createQueryBuilder("period")
      .where("period.deletedAt IS NULL");

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        "(period.code ILIKE :search OR period.name ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere("period.status = :status", { status });
    }

    if (year) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      queryBuilder.andWhere(
        "period.startDate >= :yearStart AND period.startDate <= :yearEnd",
        { yearStart, yearEnd },
      );
    }

    // Apply sorting
    const validSortFields = ["code", "name", "startDate", "createdAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "startDate";
    const safeSortOrder = sortOrder?.toUpperCase() === "DESC" ? "DESC" : "ASC";

    queryBuilder.orderBy(`period.${sortField}`, safeSortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [periods, total] = await queryBuilder.getManyAndCount();

    const data = periods.map((period) => this.toResponseDto(period));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find one fiscal period by ID
   */
  async findOne(id: string): Promise<FiscalPeriodResponseDto> {
    const period = await this.fiscalPeriodRepository.findOne({
      where: { id },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${id}' not found`);
    }

    return this.toResponseDto(period);
  }

  /**
   * Update a fiscal period
   */
  async update(
    id: string,
    updateDto: UpdateFiscalPeriodDto,
    userId?: string,
    username?: string,
  ): Promise<FiscalPeriodResponseDto> {
    this.logger.log(`Updating fiscal period with ID: ${id}`);

    const period = await this.fiscalPeriodRepository.findOne({
      where: { id },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${id}' not found`);
    }

    // Check for code conflicts if code is being changed
    if (updateDto.code && updateDto.code !== period.code) {
      const existingPeriod = await this.fiscalPeriodRepository.findOne({
        where: { code: updateDto.code },
        withDeleted: true,
      });

      if (existingPeriod && existingPeriod.id !== id) {
        if (existingPeriod.deletedAt) {
          throw new ConflictException(
            `Fiscal period with code '${updateDto.code}' was previously deleted. ` +
              `Please restore it or use a different code.`,
          );
        }
        throw new ConflictException(
          `Fiscal period with code '${updateDto.code}' already exists`,
        );
      }
    }

    // Validate date range if dates are being changed
    const newStartDate = updateDto.startDate ?? period.startDate;
    const newEndDate = updateDto.endDate ?? period.endDate;

    if (newStartDate >= newEndDate) {
      throw new BadRequestException("Start date must be before end date");
    }

    // Check for overlapping periods if dates are being changed
    if (updateDto.startDate || updateDto.endDate) {
      const overlappingPeriod = await this.fiscalPeriodRepository
        .createQueryBuilder("period")
        .where("period.id != :id", { id })
        .andWhere("period.deletedAt IS NULL")
        .andWhere(
          "(period.startDate <= :endDate AND period.endDate >= :startDate)",
          {
            startDate: newStartDate,
            endDate: newEndDate,
          },
        )
        .getOne();

      if (overlappingPeriod) {
        throw new ConflictException(
          `Period dates overlap with existing period '${overlappingPeriod.code}' ` +
            `(${overlappingPeriod.startDate} to ${overlappingPeriod.endDate})`,
        );
      }
    }

    // Update the period
    Object.assign(period, updateDto);

    const updatedPeriod = await this.fiscalPeriodRepository.save(period);

    await this.auditLogService.log(
      "UPDATE",
      "FiscalPeriod",
      `Updated fiscal period: ${updatedPeriod.code} - ${updatedPeriod.name}`,
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Fiscal period updated successfully: ${id}`);
    return this.toResponseDto(updatedPeriod);
  }

  /**
   * Soft delete a fiscal period
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Deleting fiscal period with ID: ${id}`);

    const period = await this.fiscalPeriodRepository.findOne({
      where: { id },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${id}' not found`);
    }

    // Check if period has journal entries
    const journalEntryCount = await this.journalEntryRepository.count({
      where: { fiscalPeriodId: id },
    });

    if (journalEntryCount > 0) {
      throw new BadRequestException(
        `Cannot delete fiscal period '${period.name}' - it has ${journalEntryCount} journal entry(s). ` +
          `Periods with journal entries cannot be deleted.`,
      );
    }

    // Soft delete the period
    await this.fiscalPeriodRepository.softDelete(id);

    await this.auditLogService.log(
      "DELETE",
      "FiscalPeriod",
      `Deleted fiscal period: ${period.code} - ${period.name}`,
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Fiscal period soft-deleted successfully: ${id}`);
  }

  /**
   * Restore a soft-deleted fiscal period
   */
  async restore(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<FiscalPeriodResponseDto> {
    this.logger.log(`Restoring fiscal period with ID: ${id}`);

    const period = await this.fiscalPeriodRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${id}' not found`);
    }

    if (!period.deletedAt) {
      throw new BadRequestException(
        `Fiscal period '${period.name}' is not deleted`,
      );
    }

    // Check if code is still unique
    const existingPeriod = await this.fiscalPeriodRepository.findOne({
      where: { code: period.code },
    });

    if (existingPeriod) {
      throw new ConflictException(
        `Cannot restore fiscal period - code '${period.code}' is now used by another period`,
      );
    }

    // Restore the period
    await this.fiscalPeriodRepository.restore(id);

    // Fetch the restored period
    const restoredPeriod = await this.fiscalPeriodRepository.findOne({
      where: { id },
    });

    await this.auditLogService.log(
      "RESTORE",
      "FiscalPeriod",
      `Restored fiscal period: ${period.code} - ${period.name}`,
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Fiscal period restored successfully: ${id}`);
    return this.toResponseDto(restoredPeriod!);
  }

  /**
   * Generate fiscal periods for a year
   * Creates 12 monthly periods with code format "YYYY-MM"
   */
  async generateFiscalPeriods(
    dto: GenerateFiscalPeriodsDto,
    userId?: string,
    username?: string,
  ): Promise<FiscalPeriodResponseDto[]> {
    const { year, startMonth = 1 } = dto;

    this.logger.log(
      `Generating fiscal periods for year ${year}, starting from month ${startMonth}`,
    );

    const createdPeriods: FiscalPeriodResponseDto[] = [];
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    for (let i = 0; i < 12; i++) {
      const monthIndex = (startMonth - 1 + i) % 12;
      const periodYear = startMonth + i > 12 ? year + 1 : year;
      const month = monthIndex + 1;

      // Create period code in "YYYY-MM" format
      const code = `${periodYear}-${String(month).padStart(2, "0")}`;
      const name = `${monthNames[monthIndex]} ${periodYear}`;

      // Calculate start and end dates
      const startDate = new Date(periodYear, monthIndex, 1);
      const endDate = new Date(periodYear, monthIndex + 1, 0); // Last day of month

      try {
        const period = await this.create(
          {
            code,
            name,
            startDate,
            endDate,
            status: FiscalPeriodStatus.OPEN,
          },
          userId,
          username,
        );

        createdPeriods.push(period);
        this.logger.log(`Created period: ${code} - ${name}`);
      } catch (error) {
        if (error instanceof ConflictException) {
          this.logger.warn(`Period ${code} already exists, skipping`);
        } else {
          this.logger.error(
            `Failed to create period ${code}: ${error.message}`,
          );
          throw error;
        }
      }
    }

    this.logger.log(
      `Generated ${createdPeriods.length} fiscal periods for year ${year}`,
    );
    return createdPeriods;
  }

  /**
   * Close a fiscal period
   * Prevents new journal entries from being posted to this period
   */
  async closePeriod(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<FiscalPeriodResponseDto> {
    this.logger.log(`Closing fiscal period with ID: ${id}`);

    const period = await this.fiscalPeriodRepository.findOne({
      where: { id },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${id}' not found`);
    }

    if (period.status === FiscalPeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Fiscal period '${period.name}' is already closed`,
      );
    }

    // Check for unposted (draft) journal entries
    const draftEntriesCount = await this.journalEntryRepository.count({
      where: {
        fiscalPeriodId: id,
        status: JournalEntryStatus.DRAFT,
      },
    });

    if (draftEntriesCount > 0) {
      throw new BadRequestException(
        `Cannot close fiscal period '${period.name}' - it has ${draftEntriesCount} unposted (draft) journal entry(s). ` +
          `Please post or delete all draft entries before closing the period.`,
      );
    }

    // Close the period
    const previousStatus = period.status;
    period.status = FiscalPeriodStatus.CLOSED;
    const closedPeriod = await this.fiscalPeriodRepository.save(period);

    await this.auditLogService.log(
      "UPDATE",
      "FiscalPeriod",
      `Closed fiscal period: ${closedPeriod.code} - ${closedPeriod.name}`,
      {
        entityId: id,
        userId: userId ?? "system",
        username,
        oldValues: { status: previousStatus },
        newValues: { status: closedPeriod.status },
      },
    );

    this.logger.log(`Fiscal period closed successfully: ${id}`);
    return this.toResponseDto(closedPeriod);
  }

  /**
   * Reopen a closed fiscal period
   * Only allows reopening the most recently closed period
   */
  async reopenPeriod(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<FiscalPeriodResponseDto> {
    this.logger.log(`Reopening fiscal period with ID: ${id}`);

    const period = await this.fiscalPeriodRepository.findOne({
      where: { id },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${id}' not found`);
    }

    if (period.status === FiscalPeriodStatus.OPEN) {
      throw new BadRequestException(
        `Fiscal period '${period.name}' is already open`,
      );
    }

    // Find the most recently closed period
    const mostRecentClosedPeriod = await this.fiscalPeriodRepository.findOne({
      where: { status: FiscalPeriodStatus.CLOSED },
      order: { endDate: "DESC" },
    });

    if (!mostRecentClosedPeriod) {
      throw new BadRequestException("No closed periods found");
    }

    // Only allow reopening the most recently closed period
    if (mostRecentClosedPeriod.id !== id) {
      throw new BadRequestException(
        `Can only reopen the most recently closed period. ` +
          `The most recent closed period is '${mostRecentClosedPeriod.name}' (${mostRecentClosedPeriod.code})`,
      );
    }

    // Reopen the period
    const previousStatus = period.status;
    period.status = FiscalPeriodStatus.OPEN;
    const reopenedPeriod = await this.fiscalPeriodRepository.save(period);

    await this.auditLogService.log(
      "UPDATE",
      "FiscalPeriod",
      `Reopened fiscal period: ${reopenedPeriod.code} - ${reopenedPeriod.name}`,
      {
        entityId: id,
        userId: userId ?? "system",
        username,
        oldValues: { status: previousStatus },
        newValues: { status: reopenedPeriod.status },
      },
    );

    this.logger.log(`Fiscal period reopened successfully: ${id}`);
    return this.toResponseDto(reopenedPeriod);
  }

  /**
   * Get the current open period based on today's date
   */
  async getCurrentPeriod(): Promise<FiscalPeriodResponseDto | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day

    const period = await this.fiscalPeriodRepository.findOne({
      where: {
        status: FiscalPeriodStatus.OPEN,
        startDate: LessThanOrEqual(today),
        endDate: MoreThanOrEqual(today),
      },
      order: { startDate: "DESC" },
    });

    if (!period) {
      this.logger.warn(
        `No current open period found for date: ${today.toISOString()}`,
      );
      return null;
    }

    return this.toResponseDto(period);
  }

  /**
   * Validate if a date falls within an open period
   */
  async validatePeriod(
    dto: ValidatePeriodDto,
  ): Promise<FiscalPeriodValidationResponseDto> {
    const { date } = dto;
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0); // Reset time to start of day

    const period = await this.fiscalPeriodRepository.findOne({
      where: {
        status: FiscalPeriodStatus.OPEN,
        startDate: LessThanOrEqual(checkDate),
        endDate: MoreThanOrEqual(checkDate),
      },
    });

    if (!period) {
      return {
        isValid: false,
        message: `No open fiscal period found for date: ${checkDate.toISOString().split("T")[0]}`,
      };
    }

    return {
      isValid: true,
      message: `Date falls within open period '${period.name}' (${period.code})`,
      period: this.toResponseDto(period),
    };
  }

  /**
   * Check if a period is open for posting
   */
  async checkPeriodOpen(periodId: string): Promise<boolean> {
    const period = await this.fiscalPeriodRepository.findOne({
      where: { id: periodId },
    });

    if (!period) {
      throw new NotFoundException(
        `Fiscal period with ID '${periodId}' not found`,
      );
    }

    return period.status === FiscalPeriodStatus.OPEN;
  }

  /**
   * Get fiscal period by date
   * Returns the period that contains the given date, regardless of status
   */
  async getPeriodByDate(date: Date): Promise<FiscalPeriod | null> {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0); // Reset time to start of day

    const period = await this.fiscalPeriodRepository.findOne({
      where: {
        startDate: LessThanOrEqual(checkDate),
        endDate: MoreThanOrEqual(checkDate),
      },
      order: { startDate: "DESC" },
    });

    return period;
  }

  /**
   * Convert fiscal period entity to response DTO
   */
  private toResponseDto(period: FiscalPeriod): FiscalPeriodResponseDto {
    return {
      id: period.id,
      code: period.code,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      isOpen: period.isOpen,
      isClosed: period.isClosed,
      durationDays: period.durationDays,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      deletedAt: period.deletedAt,
    };
  }
}
