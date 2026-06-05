import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, IsNull } from "typeorm";
import {
  Expense,
  ExpenseStatus,
} from "../../../database/entities/expense.entity";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import {
  ChartOfAccount,
  AccountType,
} from "../../../database/entities/chart-of-account.entity";
import { AccountingService } from "./accounting.service";
import { SettingsService } from "../../settings/settings.service";
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  QueryExpenseDto,
  BulkExpenseDto,
  ExpenseResponseDto,
  ExpenseListResponseDto,
} from "../dto/expense.dto";
import { AuditLogService } from "../../audit-logs/services";

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(ChartOfAccount)
    private readonly chartOfAccountRepository: Repository<ChartOfAccount>,
    private readonly accountingService: AccountingService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryExpenseDto): Promise<ExpenseListResponseDto> {
    const {
      page = 1,
      limit = 20,
      expenseAccountId,
      paymentMethodId,
      status,
      startDate,
      endDate,
      search,
      sortBy = "referenceNumber",
      sortOrder = "DESC",
      includeDeleted,
    } = query;

    const qb = this.expenseRepository
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.paymentMethod", "paymentMethod")
      .leftJoinAndSelect("e.expenseAccount", "expenseAccount");

    if (!includeDeleted) {
      qb.where("e.deletedAt IS NULL");
    } else {
      qb.withDeleted();
    }

    if (expenseAccountId) {
      qb.andWhere("e.expenseAccountId = :expenseAccountId", {
        expenseAccountId,
      });
    }

    if (paymentMethodId) {
      qb.andWhere("e.paymentMethodId = :paymentMethodId", { paymentMethodId });
    }

    if (status) {
      qb.andWhere("e.status = :status", { status });
    }

    if (startDate) {
      qb.andWhere("e.expenseDate >= :startDate", { startDate });
    }

    if (endDate) {
      qb.andWhere("e.expenseDate <= :endDate", { endDate });
    }

    if (search) {
      qb.andWhere(
        "(e.description ILIKE :search OR e.vendor ILIKE :search OR e.referenceNumber ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    const allowedSortFields = [
      "referenceNumber",
      "expenseDate",
      "createdAt",
      "amount",
      "vendor",
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : "referenceNumber";
    const safeSortOrder = sortOrder === "ASC" ? "ASC" : "DESC";

    qb.orderBy(`e.${safeSortBy}`, safeSortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponseDto(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: { paymentMethod: true, expenseAccount: true },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    return this.toResponseDto(expense);
  }

  async create(
    dto: CreateExpenseDto,
    userId?: string,
    username?: string,
  ): Promise<ExpenseResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });

    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException(
        `Payment method ${dto.paymentMethodId} not found`,
      );
    }

    const account = await this.chartOfAccountRepository.findOne({
      where: { id: dto.expenseAccountId, isActive: true },
    });

    if (!account || account.deletedAt) {
      throw new NotFoundException(`Account ${dto.expenseAccountId} not found`);
    }

    if (account.type !== AccountType.EXPENSE) {
      throw new BadRequestException(
        `Account ${account.code} (${account.name}) is not an expense account`,
      );
    }

    const referenceNumber =
      await this.settingsService.generateDocumentNumber("Expenses");

    const expense = this.expenseRepository.create({
      referenceNumber,
      expenseDate: new Date(dto.expenseDate),
      expenseAccountId: dto.expenseAccountId,
      amount: dto.amount,
      paymentMethodId: dto.paymentMethodId,
      description: dto.description,
      vendor: dto.vendor,
      status: ExpenseStatus.DRAFT,
    });

    const saved = await this.expenseRepository.save(expense);
    await this.auditLogService.log(
      "CREATE",
      "Expense",
      `Created expense: ${saved.referenceNumber}`,
      { entityId: saved.id, userId: userId ?? "system", username },
    );
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    userId?: string,
    username?: string,
  ): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException("Cannot update a posted expense");
    }

    if (dto.paymentMethodId) {
      const paymentMethod = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!paymentMethod || paymentMethod.deletedAt) {
        throw new NotFoundException(
          `Payment method ${dto.paymentMethodId} not found`,
        );
      }
    }

    if (dto.expenseAccountId) {
      const account = await this.chartOfAccountRepository.findOne({
        where: { id: dto.expenseAccountId, isActive: true },
      });
      if (!account || account.deletedAt) {
        throw new NotFoundException(
          `Account ${dto.expenseAccountId} not found`,
        );
      }
      if (account.type !== AccountType.EXPENSE) {
        throw new BadRequestException(
          `Account ${account.code} (${account.name}) is not an expense account`,
        );
      }
    }

    if (dto.expenseDate) expense.expenseDate = new Date(dto.expenseDate);
    if (dto.expenseAccountId) expense.expenseAccountId = dto.expenseAccountId;
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.paymentMethodId) expense.paymentMethodId = dto.paymentMethodId;
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.vendor !== undefined) expense.vendor = dto.vendor;

    await this.expenseRepository.save(expense);
    await this.auditLogService.log(
      "UPDATE",
      "Expense",
      `Updated expense: ${expense.referenceNumber}`,
      { entityId: id, userId: userId ?? "system", username },
    );
    return this.findOne(id);
  }

  async remove(id: string, userId?: string, username?: string): Promise<void> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException("Cannot delete a posted expense");
    }

    await this.expenseRepository.softDelete(id);
    await this.auditLogService.log(
      "DELETE",
      "Expense",
      `Deleted expense: ${expense.referenceNumber}`,
      { entityId: id, userId: userId ?? "system", username },
    );
  }

  async post(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: { paymentMethod: true, expenseAccount: true },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException("Expense is already posted");
    }

    try {
      const journalEntry = await this.accountingService.postExpenseEntry(
        expense,
        userId ?? "system",
        username,
      );
      expense.status = ExpenseStatus.POSTED;
      expense.journalEntryId = journalEntry.id;
      await this.expenseRepository.save(expense);
      await this.auditLogService.log(
        "POST",
        "Expense",
        `Posted expense: ${expense.referenceNumber}`,
        { entityId: id, userId: userId ?? "system", username },
      );
    } catch (error) {
      this.logger.error(
        `Failed to post expense entry for ${expense.referenceNumber}: ${error.message}`,
      );
      throw error;
    }

    return this.findOne(id);
  }

  async bulkPost(
    dto: BulkExpenseDto,
    userId?: string,
    username?: string,
  ): Promise<{ posted: number; failed: number }> {
    let posted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.post(id, userId, username);
        posted++;
      } catch (error) {
        this.logger.error(`Failed to post expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { posted, failed };
  }

  async bulkDelete(
    dto: BulkExpenseDto,
    userId?: string,
    username?: string,
  ): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.remove(id, userId, username);
        deleted++;
      } catch (error) {
        this.logger.error(`Failed to delete expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { deleted, failed };
  }

  async bulkRestore(
    dto: BulkExpenseDto,
    userId?: string,
    username?: string,
  ): Promise<{ restored: number; failed: number }> {
    let restored = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.restore(id, userId, username);
        restored++;
      } catch (error) {
        this.logger.error(`Failed to restore expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { restored, failed };
  }

  async restore(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!expense) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (!expense.deletedAt) {
      throw new BadRequestException("Expense is not deleted");
    }

    await this.expenseRepository.restore(id);
    await this.auditLogService.log(
      "RESTORE",
      "Expense",
      `Restored expense: ${expense.referenceNumber}`,
      { entityId: id, userId: userId ?? "system", username },
    );
    return this.findOne(id);
  }

  async unpost(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status !== ExpenseStatus.POSTED) {
      throw new BadRequestException("Only posted expenses can be unposted");
    }

    await this.accountingService.reverseSourceEntries(
      "expense",
      id,
      userId ?? "system",
    );

    expense.status = ExpenseStatus.REVERSED;
    await this.expenseRepository.save(expense);

    await this.auditLogService.log(
      "UNPOST",
      "Expense",
      `Unposted expense: ${expense.referenceNumber}`,
      { entityId: id, userId: userId ?? "system", username },
    );
    return this.findOne(id);
  }

  async getDeleted(): Promise<ExpenseResponseDto[]> {
    const records = await this.expenseRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      relations: { paymentMethod: true, expenseAccount: true },
      order: { deletedAt: "DESC" },
    });
    return records.map((r) => this.toResponseDto(r));
  }

  async permanentDelete(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<void> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!expense) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (!expense.deletedAt) {
      throw new BadRequestException(
        "Expense must be soft-deleted before permanent deletion",
      );
    }

    await this.expenseRepository.delete(id);
    await this.auditLogService.log(
      "DELETE",
      "Expense",
      `Permanently deleted expense: ${expense.referenceNumber}`,
      { entityId: id, userId: userId ?? "system", username },
    );
  }

  async bulkPermanentDelete(
    dto: BulkExpenseDto,
    userId?: string,
    username?: string,
  ): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.permanentDelete(id, userId, username);
        deleted++;
      } catch (error) {
        this.logger.error(
          `Failed to permanently delete expense ${id}: ${error.message}`,
        );
        failed++;
      }
    }

    return { deleted, failed };
  }

  private toResponseDto(expense: Expense): ExpenseResponseDto {
    return {
      id: expense.id,
      referenceNumber: expense.referenceNumber,
      expenseDate: expense.expenseDate,
      expenseAccountId: expense.expenseAccountId,
      expenseAccount: expense.expenseAccount
        ? {
            id: expense.expenseAccount.id,
            code: expense.expenseAccount.code,
            name: expense.expenseAccount.name,
          }
        : undefined,
      amount: Number(expense.amount),
      paymentMethodId: expense.paymentMethodId,
      paymentMethod: expense.paymentMethod
        ? {
            id: expense.paymentMethod.id,
            code: expense.paymentMethod.code,
            name: expense.paymentMethod.name,
          }
        : undefined,
      description: expense.description,
      vendor: expense.vendor,
      status: expense.status,
      journalEntryId: expense.journalEntryId,
      deletedAt: expense.deletedAt ?? null,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
