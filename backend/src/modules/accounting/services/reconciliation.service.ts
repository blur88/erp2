import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, IsNull } from "typeorm";
import {
  BankReconciliation,
  BankReconciliationStatus,
} from "../../../database/entities/bank-reconciliation.entity";
import { ReconciledTransaction } from "../../../database/entities/reconciled-transaction.entity";
import { JournalEntryLine } from "../../../database/entities/journal-entry-line.entity";
import { JournalEntryStatus } from "../../../database/entities/journal-entry.entity";
import { ChartOfAccount } from "../../../database/entities/chart-of-account.entity";
import {
  FiscalPeriod,
  FiscalPeriodStatus,
} from "../../../database/entities/fiscal-period.entity";
import {
  CreateBankReconciliationDto,
  UpdateBankReconciliationDto,
  QueryBankReconciliationsDto,
  ToggleClearedDto,
  BankReconciliationResponseDto,
  BankReconciliationListResponseDto,
  ReconciledTransactionResponseDto,
} from "../dto/reconciliation.dto";
import { AuditLogService } from "../../audit-logs/services";

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(BankReconciliation)
    private readonly reconciliationRepository: Repository<BankReconciliation>,
    @InjectRepository(ReconciledTransaction)
    private readonly reconciledTransactionRepository: Repository<ReconciledTransaction>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
    @InjectRepository(ChartOfAccount)
    private readonly chartOfAccountRepository: Repository<ChartOfAccount>,
    @InjectRepository(FiscalPeriod)
    private readonly fiscalPeriodRepository: Repository<FiscalPeriod>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new bank reconciliation
   */
  async create(
    createDto: CreateBankReconciliationDto,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    this.logger.log(
      `Creating bank reconciliation for account: ${createDto.accountId}`,
    );

    // Validate account exists and is a bank/cash account (Asset type)
    const account = await this.chartOfAccountRepository.findOne({
      where: { id: createDto.accountId, isActive: true },
    });
    if (!account) {
      throw new NotFoundException(
        `Account with ID '${createDto.accountId}' not found or inactive`,
      );
    }

    // Validate fiscal period exists and is open
    const period = await this.fiscalPeriodRepository.findOne({
      where: { id: createDto.fiscalPeriodId },
    });
    if (!period) {
      throw new NotFoundException(
        `Fiscal period with ID '${createDto.fiscalPeriodId}' not found`,
      );
    }
    if (period.status === FiscalPeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Cannot create reconciliation for closed period '${period.name}'`,
      );
    }

    // Check for existing in-progress reconciliation for same account+period
    const existing = await this.reconciliationRepository.findOne({
      where: {
        accountId: createDto.accountId,
        fiscalPeriodId: createDto.fiscalPeriodId,
        status: BankReconciliationStatus.IN_PROGRESS,
      },
    });
    if (existing) {
      throw new BadRequestException(
        "An in-progress reconciliation already exists for this account and period. Complete or delete it first.",
      );
    }

    // Calculate book balance from posted journal entry lines for this account
    const bookBalance = await this.calculateBookBalance(createDto.accountId);

    // Create reconciliation
    const reconciliation = this.reconciliationRepository.create({
      accountId: createDto.accountId,
      fiscalPeriodId: createDto.fiscalPeriodId,
      reconciliationDate: createDto.reconciliationDate,
      statementBalance: createDto.statementBalance,
      bookBalance,
      difference: Number(createDto.statementBalance) - bookBalance,
      status: BankReconciliationStatus.IN_PROGRESS,
    });

    const saved = await this.reconciliationRepository.save(reconciliation);

    // Load unreconciled journal entry lines for this account and create transaction records
    await this.loadUnreconciledTransactions(saved.id, createDto.accountId);

    await this.auditLogService.log(
      "CREATE",
      "BankReconciliation",
      `Created bank reconciliation for account: ${saved.accountId}`,
      { entityId: saved.id, userId: userId ?? "system", username },
    );

    this.logger.log(`Bank reconciliation created: ${saved.id}`);
    return this.findOne(saved.id);
  }

  /**
   * Find all reconciliations with filtering and pagination
   */
  async findAll(
    query: QueryBankReconciliationsDto,
  ): Promise<BankReconciliationListResponseDto> {
    const {
      page = 1,
      limit = 20,
      accountId,
      fiscalPeriodId,
      status,
      sortBy = "reconciliationDate",
      sortOrder = "DESC",
      search,
      startDate,
      endDate,
      isBalanced,
    } = query;

    const queryBuilder = this.reconciliationRepository
      .createQueryBuilder("recon")
      .leftJoinAndSelect("recon.account", "account")
      .leftJoinAndSelect("recon.fiscalPeriod", "fiscalPeriod")
      .where("recon.deletedAt IS NULL");

    if (accountId) {
      queryBuilder.andWhere("recon.accountId = :accountId", { accountId });
    }
    if (fiscalPeriodId) {
      queryBuilder.andWhere("recon.fiscalPeriodId = :fiscalPeriodId", {
        fiscalPeriodId,
      });
    }
    if (status) {
      queryBuilder.andWhere("recon.status = :status", { status });
    }
    if (search) {
      queryBuilder.andWhere(
        "(account.name ILIKE :search OR account.code ILIKE :search OR fiscalPeriod.name ILIKE :search)",
        { search: `%${search}%` },
      );
    }
    if (startDate) {
      queryBuilder.andWhere("recon.reconciliationDate >= :startDate", {
        startDate,
      });
    }
    if (endDate) {
      queryBuilder.andWhere("recon.reconciliationDate <= :endDate", {
        endDate,
      });
    }
    if (isBalanced !== undefined) {
      if (isBalanced) {
        queryBuilder.andWhere("ABS(recon.difference) < 0.01");
      } else {
        queryBuilder.andWhere("ABS(recon.difference) >= 0.01");
      }
    }

    const validSortFields = ["reconciliationDate", "createdAt"];
    const sortField = validSortFields.includes(sortBy)
      ? sortBy
      : "reconciliationDate";
    const safeSortOrder = sortOrder?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    queryBuilder.orderBy(`recon.${sortField}`, safeSortOrder);
    // Hardcoded tiebreaker; account.name intentionally excluded from validSortFields to avoid sort-direction conflict
    queryBuilder.addOrderBy("account.name", "ASC");

    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [reconciliations, total] = await queryBuilder.getManyAndCount();

    return {
      data: reconciliations.map((r) => this.toResponseDto(r)),
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
   * Find one reconciliation by ID with all transactions
   */
  async findOne(id: string): Promise<BankReconciliationResponseDto> {
    const withTransactions = {
      account: true,
      fiscalPeriod: true,
      reconciledTransactions: {
        journalEntryLine: { account: true, journalEntry: true },
      },
    };
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
      relations: withTransactions,
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    return this.toResponseDto(reconciliation);
  }

  async getDeleted(): Promise<BankReconciliationResponseDto[]> {
    const records = await this.reconciliationRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      relations: { account: true, fiscalPeriod: true },
      order: { deletedAt: "DESC" },
    });
    return records.map((r) => this.toResponseDto(r));
  }

  async restore(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id } as any,
      withDeleted: true,
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (!reconciliation.deletedAt) {
      throw new BadRequestException("Bank reconciliation is not deleted");
    }

    const duplicate = await this.reconciliationRepository.findOne({
      where: {
        accountId: reconciliation.accountId,
        fiscalPeriodId: reconciliation.fiscalPeriodId,
        status: BankReconciliationStatus.IN_PROGRESS,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        "Cannot restore: an in-progress reconciliation already exists for this account and period.",
      );
    }

    await this.reconciliationRepository.restore(id);

    await this.reconciliationRepository.save({
      ...reconciliation,
      isActive: true,
      deletedAt: null,
    } as any);

    await this.auditLogService.log(
      "RESTORE",
      "BankReconciliation",
      "Restored bank reconciliation",
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Bank reconciliation restored: ${id}`);
    return this.findOne(id);
  }

  async permanentDelete(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<void> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id } as any,
      withDeleted: true,
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (!reconciliation.deletedAt) {
      throw new BadRequestException(
        "Bank reconciliation must be soft-deleted before permanent deletion",
      );
    }

    await this.reconciliationRepository.delete(id);

    await this.auditLogService.log(
      "DELETE",
      "BankReconciliation",
      "Permanently deleted bank reconciliation",
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Bank reconciliation permanently deleted: ${id}`);
  }

  async bulkRestore(
    ids: string[],
    userId?: string,
    username?: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    if (ids.length === 0) return { restoredCount: 0, failedIds: [] };

    let restoredCount = 0;
    const failedIds: string[] = [];

    for (const id of ids) {
      try {
        await this.restore(id, userId, username);
        restoredCount += 1;
      } catch (error: any) {
        this.logger.warn(
          `Failed to restore bank reconciliation '${id}': ${error.message}`,
        );
        failedIds.push(id);
      }
    }

    return { restoredCount, failedIds };
  }

  async bulkPermanentDelete(
    ids: string[],
    userId?: string,
    username?: string,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    if (ids.length === 0) return { deletedCount: 0, failedIds: [] };

    let deletedCount = 0;
    const failedIds: string[] = [];

    for (const id of ids) {
      try {
        await this.permanentDelete(id, userId, username);
        deletedCount += 1;
      } catch (error: any) {
        this.logger.warn(
          `Failed to permanently delete bank reconciliation '${id}': ${error.message}`,
        );
        failedIds.push(id);
      }
    }

    return { deletedCount, failedIds };
  }

  /**
   * Update reconciliation
   */
  async update(
    id: string,
    updateDto: UpdateBankReconciliationDto,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException("Cannot update a completed reconciliation");
    }

    const accountChanged =
      updateDto.accountId !== undefined &&
      updateDto.accountId !== reconciliation.accountId;

    if (accountChanged) {
      const newAccount = await this.chartOfAccountRepository.findOne({
        where: { id: updateDto.accountId, isActive: true },
      });
      if (!newAccount) {
        throw new NotFoundException(
          `Account with ID '${updateDto.accountId}' not found or inactive`,
        );
      }

      const duplicate = await this.reconciliationRepository.findOne({
        where: {
          accountId: updateDto.accountId,
          fiscalPeriodId:
            updateDto.fiscalPeriodId ?? reconciliation.fiscalPeriodId,
          status: BankReconciliationStatus.IN_PROGRESS,
        },
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(
          "An in-progress reconciliation already exists for this account and period. Complete or delete it first.",
        );
      }

      await this.reconciledTransactionRepository.delete({
        reconciliationId: id,
      });

      const newBookBalance = await this.calculateBookBalance(
        updateDto.accountId!,
      );
      reconciliation.accountId = updateDto.accountId!;
      reconciliation.bookBalance = newBookBalance;
      reconciliation.statementBalance = 0;
      reconciliation.calculateDifference();
    }

    if (
      updateDto.fiscalPeriodId !== undefined &&
      updateDto.fiscalPeriodId !== reconciliation.fiscalPeriodId
    ) {
      const newPeriod = await this.fiscalPeriodRepository.findOne({
        where: { id: updateDto.fiscalPeriodId },
      });
      if (!newPeriod) {
        throw new NotFoundException(
          `Fiscal period with ID '${updateDto.fiscalPeriodId}' not found`,
        );
      }
      if (newPeriod.status === FiscalPeriodStatus.CLOSED) {
        throw new BadRequestException(
          `Cannot set reconciliation to closed period '${newPeriod.name}'`,
        );
      }

      const duplicate = await this.reconciliationRepository.findOne({
        where: {
          accountId: reconciliation.accountId,
          fiscalPeriodId: updateDto.fiscalPeriodId,
          status: BankReconciliationStatus.IN_PROGRESS,
        },
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(
          "An in-progress reconciliation already exists for this account and period. Complete or delete it first.",
        );
      }

      reconciliation.fiscalPeriodId = updateDto.fiscalPeriodId;
    }

    if (updateDto.reconciliationDate !== undefined) {
      reconciliation.reconciliationDate = updateDto.reconciliationDate;
    }
    // Skip statementBalance if account is changing — account change resets it to 0
    if (updateDto.statementBalance !== undefined && !accountChanged) {
      reconciliation.statementBalance = updateDto.statementBalance;
    }

    // Recalculate difference
    reconciliation.calculateDifference();

    await this.reconciliationRepository.save(reconciliation);

    // Reload transactions after save so FK is committed before inserts
    if (accountChanged) {
      await this.loadUnreconciledTransactions(id, updateDto.accountId!);
    }

    await this.auditLogService.log(
      "UPDATE",
      "BankReconciliation",
      "Updated bank reconciliation",
      { entityId: id, userId: userId ?? "system", username },
    );

    return this.findOne(id);
  }

  /**
   * Soft delete a reconciliation (only if IN_PROGRESS)
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException(
        "Cannot delete a completed reconciliation. Please reopen it first.",
      );
    }

    await this.reconciliationRepository.softDelete(id);
    await this.auditLogService.log(
      "DELETE",
      "BankReconciliation",
      "Deleted bank reconciliation",
      { entityId: id, userId: userId ?? "system", username },
    );
    this.logger.log(`Bank reconciliation soft-deleted: ${id}`);
  }

  /**
   * Mark journal entry lines as cleared
   */
  async markCleared(
    id: string,
    dto: ToggleClearedDto,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException("Cannot modify a completed reconciliation");
    }

    // Update cleared status
    for (const lineId of dto.journalEntryLineIds) {
      const txn = await this.reconciledTransactionRepository.findOne({
        where: { reconciliationId: id, journalEntryLineId: lineId },
      });

      if (txn) {
        txn.cleared = true;
        await this.reconciledTransactionRepository.save(txn);
      }
    }

    // Recalculate book balance from cleared transactions
    await this.recalculateBalances(id);

    return this.findOne(id);
  }

  /**
   * Unmark journal entry lines (set cleared = false)
   */
  async unmarkCleared(
    id: string,
    dto: ToggleClearedDto,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException("Cannot modify a completed reconciliation");
    }

    for (const lineId of dto.journalEntryLineIds) {
      const txn = await this.reconciledTransactionRepository.findOne({
        where: { reconciliationId: id, journalEntryLineId: lineId },
      });

      if (txn) {
        txn.cleared = false;
        await this.reconciledTransactionRepository.save(txn);
      }
    }

    await this.recalculateBalances(id);

    return this.findOne(id);
  }

  /**
   * Complete reconciliation (only if balanced)
   */
  async complete(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
      relations: { reconciledTransactions: true },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException("Reconciliation is already completed");
    }

    // Recalculate to ensure latest data
    await this.recalculateBalances(id);

    // Re-fetch after recalculation
    const updated = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!updated) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (!updated.isBalanced) {
      throw new BadRequestException(
        `Cannot complete reconciliation. Difference: ${Number(updated.difference).toFixed(2)}. ` +
          `Statement balance: ${Number(updated.statementBalance).toFixed(2)}, ` +
          `Cleared balance: ${Number(updated.bookBalance).toFixed(2)}`,
      );
    }

    const previousStatus = updated.status;
    updated.status = BankReconciliationStatus.COMPLETED;
    await this.reconciliationRepository.save(updated);

    await this.auditLogService.log(
      "UPDATE",
      "BankReconciliation",
      "Completed bank reconciliation",
      {
        entityId: id,
        userId: userId ?? "system",
        username,
        oldValues: { status: previousStatus },
        newValues: { status: updated.status },
      },
    );

    this.logger.log(`Bank reconciliation completed: ${id}`);

    return this.findOne(id);
  }

  /**
   * Reopen a completed reconciliation
   */
  async reopen(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `Bank reconciliation with ID '${id}' not found`,
      );
    }

    if (reconciliation.status !== BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException(
        "Can only reopen completed reconciliations",
      );
    }

    const previousStatus = reconciliation.status;
    reconciliation.status = BankReconciliationStatus.IN_PROGRESS;
    await this.reconciliationRepository.save(reconciliation);

    await this.auditLogService.log(
      "UPDATE",
      "BankReconciliation",
      "Reopened bank reconciliation",
      {
        entityId: id,
        userId: userId ?? "system",
        username,
        oldValues: { status: previousStatus },
        newValues: { status: reconciliation.status },
      },
    );

    this.logger.log(`Bank reconciliation reopened: ${id}`);

    return this.findOne(id);
  }

  // -- Private helpers -------------------------------------------------------

  /**
   * Calculate book balance: sum of all posted debit - credit for this account
   */
  private async calculateBookBalance(accountId: string): Promise<number> {
    const result = await this.journalEntryLineRepository
      .createQueryBuilder("line")
      .innerJoin("line.journalEntry", "entry")
      .select("COALESCE(SUM(line.debitAmount), 0)", "totalDebit")
      .addSelect("COALESCE(SUM(line.creditAmount), 0)", "totalCredit")
      .where("line.accountId = :accountId", { accountId })
      .andWhere("entry.status = :status", { status: JournalEntryStatus.POSTED })
      .andWhere("entry.deletedAt IS NULL")
      .getRawOne();

    return Number(result.totalDebit) - Number(result.totalCredit);
  }

  /**
   * Load unreconciled posted journal entry lines for an account and
   * create ReconciledTransaction records for the reconciliation
   */
  private async loadUnreconciledTransactions(
    reconciliationId: string,
    accountId: string,
  ): Promise<void> {
    // Find all posted journal entry lines for this account that are NOT already
    // cleared in a completed reconciliation
    const lines = await this.journalEntryLineRepository
      .createQueryBuilder("line")
      .innerJoin("line.journalEntry", "entry")
      .leftJoin(
        "reconciled_transactions",
        "rt",
        "rt.journalEntryLineId = line.id AND rt.cleared = true",
      )
      .leftJoin(
        "bank_reconciliations",
        "br",
        "br.id = rt.reconciliationId AND br.status = :completedStatus",
        { completedStatus: BankReconciliationStatus.COMPLETED },
      )
      .where("line.accountId = :accountId", { accountId })
      .andWhere("entry.status = :status", { status: JournalEntryStatus.POSTED })
      .andWhere("entry.deletedAt IS NULL")
      .andWhere("br.id IS NULL")
      .getMany();

    const transactions = lines.map((line) =>
      this.reconciledTransactionRepository.create({
        reconciliationId,
        journalEntryLineId: line.id,
        cleared: false,
      }),
    );

    if (transactions.length > 0) {
      await this.reconciledTransactionRepository.save(transactions);
    }

    this.logger.log(
      `Loaded ${transactions.length} unreconciled transactions for reconciliation ${reconciliationId}`,
    );
  }

  /**
   * Recalculate book balance based on cleared transactions
   */
  private async recalculateBalances(reconciliationId: string): Promise<void> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id: reconciliationId },
    });

    if (!reconciliation) {
      return;
    }

    // Sum cleared transactions
    const result = await this.reconciledTransactionRepository
      .createQueryBuilder("rt")
      .innerJoin("rt.journalEntryLine", "line")
      .select("COALESCE(SUM(line.debitAmount), 0)", "totalDebit")
      .addSelect("COALESCE(SUM(line.creditAmount), 0)", "totalCredit")
      .where("rt.reconciliationId = :reconciliationId", { reconciliationId })
      .andWhere("rt.cleared = true")
      .getRawOne();

    const clearedBalance =
      Number(result.totalDebit) - Number(result.totalCredit);
    reconciliation.bookBalance = clearedBalance;
    reconciliation.calculateDifference();

    await this.reconciliationRepository.save(reconciliation);
  }

  /**
   * Convert entity to response DTO
   */
  private toResponseDto(
    recon: BankReconciliation,
  ): BankReconciliationResponseDto {
    return {
      id: recon.id,
      accountId: recon.accountId,
      fiscalPeriodId: recon.fiscalPeriodId,
      reconciliationDate: recon.reconciliationDate,
      statementBalance: Number(recon.statementBalance),
      bookBalance: Number(recon.bookBalance),
      difference: Number(recon.difference),
      status: recon.status,
      isCompleted: recon.isCompleted,
      isInProgress: recon.isInProgress,
      isBalanced: recon.isBalanced,
      account: recon.account
        ? {
            id: recon.account.id,
            code: recon.account.code,
            name: recon.account.name,
            type: recon.account.type,
          }
        : undefined,
      fiscalPeriod: recon.fiscalPeriod
        ? {
            id: recon.fiscalPeriod.id,
            code: recon.fiscalPeriod.code,
            name: recon.fiscalPeriod.name,
            status: recon.fiscalPeriod.status,
          }
        : undefined,
      reconciledTransactions: recon.reconciledTransactions
        ? recon.reconciledTransactions.map((t) =>
            this.toTransactionResponseDto(t),
          )
        : undefined,
      createdAt: recon.createdAt,
      updatedAt: recon.updatedAt,
    };
  }

  private toTransactionResponseDto(
    txn: ReconciledTransaction,
  ): ReconciledTransactionResponseDto {
    return {
      id: txn.id,
      reconciliationId: txn.reconciliationId,
      journalEntryLineId: txn.journalEntryLineId,
      cleared: txn.cleared,
      journalEntryLine: txn.journalEntryLine
        ? {
            id: txn.journalEntryLine.id,
            journalEntryId: txn.journalEntryLine.journalEntryId,
            accountId: txn.journalEntryLine.accountId,
            debitAmount: Number(txn.journalEntryLine.debitAmount),
            creditAmount: Number(txn.journalEntryLine.creditAmount),
            memo: txn.journalEntryLine.memo,
            account: txn.journalEntryLine.account
              ? {
                  id: txn.journalEntryLine.account.id,
                  code: txn.journalEntryLine.account.code,
                  name: txn.journalEntryLine.account.name,
                  type: txn.journalEntryLine.account.type,
                }
              : undefined,
            journalEntry: (txn.journalEntryLine as any).journalEntry
              ? {
                  id: (txn.journalEntryLine as any).journalEntry.id,
                  referenceNumber: (txn.journalEntryLine as any).journalEntry
                    .referenceNumber,
                  entryDate: (txn.journalEntryLine as any).journalEntry
                    .entryDate,
                  description: (txn.journalEntryLine as any).journalEntry
                    .description,
                }
              : undefined,
          }
        : undefined,
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
    };
  }
}
