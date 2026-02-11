# Phase 4: Bank Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full bank reconciliation workflow — backend service, controller, DTOs, frontend pages, Redux state, and tests — so users can reconcile bank/cash accounts against statements.

**Architecture:** NestJS service + controller following the existing accounting module patterns (journal-entry.service.ts as reference). Frontend uses React + MUI + Redux Toolkit following FiscalPeriodsPage.tsx pattern. Entities and migration already exist.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 18.3.1, Material-UI v7, Redux Toolkit, Jest (backend), Vitest (frontend)

---

## Pre-Implementation Notes

**Already done (no work needed):**
- `BankReconciliation` entity at `backend/src/database/entities/bank-reconciliation.entity.ts`
- `ReconciledTransaction` entity at `backend/src/database/entities/reconciled-transaction.entity.ts`
- Database migration at `backend/src/database/migrations/1770109818000-AccountingEntities.ts`
- Relationships wired on `ChartOfAccount.bankReconciliations`, `FiscalPeriod.bankReconciliations`, `JournalEntryLine.reconciledTransactions`

**Key patterns to follow:**
- Service: `backend/src/modules/accounting/services/journal-entry.service.ts` (QueryBuilder, pagination, response DTOs)
- Controller: `backend/src/modules/accounting/controllers/journal-entry.controller.ts` (Swagger decorators, standard verbs)
- DTO: `backend/src/modules/accounting/dto/journal-entry.dto.ts` (class-validator, ApiProperty)
- Redux slice: `frontend/src/store/slices/journalEntriesSlice.ts` (createAsyncThunk, extraReducers)
- API service: `frontend/src/services/accountingApi.ts` (ApiService wrapper)
- Page: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx` (MUI table, TYPOGRAPHY_STYLES, TABLE_STYLES)

---

### Task 1: Create Reconciliation DTOs

**Files:**
- Create: `backend/src/modules/accounting/dto/reconciliation.dto.ts`

**Step 1: Write the DTO file**

```typescript
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsNumber,
  IsUUID,
  IsArray,
  IsBoolean,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BankReconciliationStatus } from '../../../database/entities/bank-reconciliation.entity';

// Create DTO
export class CreateBankReconciliationDto {
  @ApiProperty({ description: 'Bank/Cash account ID (Chart of Account)' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Fiscal period ID' })
  @IsUUID()
  fiscalPeriodId: string;

  @ApiProperty({ description: 'Reconciliation date', type: Date })
  @Type(() => Date)
  @IsDate()
  reconciliationDate: Date;

  @ApiProperty({ description: 'Balance per bank statement' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  statementBalance: number;
}

// Update DTO
export class UpdateBankReconciliationDto {
  @ApiPropertyOptional({ description: 'Reconciliation date', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reconciliationDate?: Date;

  @ApiPropertyOptional({ description: 'Balance per bank statement' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  statementBalance?: number;
}

// Query DTO
export class QueryBankReconciliationsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by account ID' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Filter by fiscal period ID' })
  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: BankReconciliationStatus })
  @IsOptional()
  @IsEnum(BankReconciliationStatus)
  status?: BankReconciliationStatus;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['reconciliationDate', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

// Mark/unmark cleared DTO
export class ToggleClearedDto {
  @ApiProperty({ description: 'Journal entry line IDs to toggle', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  journalEntryLineIds: string[];
}

// Response DTOs
export class ReconciledTransactionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() reconciliationId: string;
  @ApiProperty() journalEntryLineId: string;
  @ApiProperty() cleared: boolean;
  @ApiPropertyOptional() journalEntryLine?: {
    id: string;
    journalEntryId: string;
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    memo: string;
    account?: { id: string; code: string; name: string; type: string };
    journalEntry?: { id: string; referenceNumber: string; entryDate: Date; description: string };
  };
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class BankReconciliationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() accountId: string;
  @ApiProperty() fiscalPeriodId: string;
  @ApiProperty() reconciliationDate: Date;
  @ApiProperty() statementBalance: number;
  @ApiProperty() bookBalance: number;
  @ApiProperty() difference: number;
  @ApiProperty({ enum: BankReconciliationStatus }) status: BankReconciliationStatus;
  @ApiProperty() isCompleted: boolean;
  @ApiProperty() isInProgress: boolean;
  @ApiProperty() isBalanced: boolean;
  @ApiPropertyOptional() account?: { id: string; code: string; name: string; type: string };
  @ApiPropertyOptional() fiscalPeriod?: { id: string; code: string; name: string; status: string };
  @ApiPropertyOptional({ type: [ReconciledTransactionResponseDto] })
  reconciledTransactions?: ReconciledTransactionResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class BankReconciliationListResponseDto {
  @ApiProperty({ type: [BankReconciliationResponseDto] })
  data: BankReconciliationResponseDto[];
  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
```

**Step 2: Verify file compiles**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to reconciliation.dto.ts

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/dto/reconciliation.dto.ts
git commit -m "feat(accounting): add bank reconciliation DTOs"
```

---

### Task 2: Create ReconciliationService

**Files:**
- Create: `backend/src/modules/accounting/services/reconciliation.service.ts`

**Step 1: Write the service**

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BankReconciliation,
  BankReconciliationStatus,
} from '../../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../../database/entities/reconciled-transaction.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { FiscalPeriod, FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';
import {
  CreateBankReconciliationDto,
  UpdateBankReconciliationDto,
  QueryBankReconciliationsDto,
  ToggleClearedDto,
  BankReconciliationResponseDto,
  BankReconciliationListResponseDto,
  ReconciledTransactionResponseDto,
} from '../dto/reconciliation.dto';

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
  ) {}

  /**
   * Create a new bank reconciliation
   */
  async create(
    createDto: CreateBankReconciliationDto,
    userId: string = 'system',
  ): Promise<BankReconciliationResponseDto> {
    this.logger.log(`Creating bank reconciliation for account: ${createDto.accountId}`);

    // Validate account exists and is a bank/cash account (Asset type)
    const account = await this.chartOfAccountRepository.findOne({
      where: { id: createDto.accountId, isActive: true },
    });
    if (!account) {
      throw new NotFoundException(`Account with ID '${createDto.accountId}' not found or inactive`);
    }

    // Validate fiscal period exists and is open
    const period = await this.fiscalPeriodRepository.findOne({
      where: { id: createDto.fiscalPeriodId },
    });
    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${createDto.fiscalPeriodId}' not found`);
    }
    if (period.status === FiscalPeriodStatus.CLOSED) {
      throw new BadRequestException(`Cannot create reconciliation for closed period '${period.name}'`);
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
        `An in-progress reconciliation already exists for this account and period. Complete or delete it first.`,
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
      sortBy = 'reconciliationDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.reconciliationRepository
      .createQueryBuilder('recon')
      .leftJoinAndSelect('recon.account', 'account')
      .leftJoinAndSelect('recon.fiscalPeriod', 'fiscalPeriod')
      .where('recon.deletedAt IS NULL');

    if (accountId) {
      queryBuilder.andWhere('recon.accountId = :accountId', { accountId });
    }
    if (fiscalPeriodId) {
      queryBuilder.andWhere('recon.fiscalPeriodId = :fiscalPeriodId', { fiscalPeriodId });
    }
    if (status) {
      queryBuilder.andWhere('recon.status = :status', { status });
    }

    const validSortFields = ['reconciliationDate', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'reconciliationDate';
    const safeSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryBuilder.orderBy(`recon.${sortField}`, safeSortOrder);

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
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
      relations: [
        'account',
        'fiscalPeriod',
        'reconciledTransactions',
        'reconciledTransactions.journalEntryLine',
        'reconciledTransactions.journalEntryLine.account',
        'reconciledTransactions.journalEntryLine.journalEntry',
      ],
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    return this.toResponseDto(reconciliation);
  }

  /**
   * Update reconciliation (statement balance, date)
   */
  async update(
    id: string,
    updateDto: UpdateBankReconciliationDto,
    userId: string = 'system',
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Cannot update a completed reconciliation');
    }

    if (updateDto.reconciliationDate !== undefined) {
      reconciliation.reconciliationDate = updateDto.reconciliationDate;
    }
    if (updateDto.statementBalance !== undefined) {
      reconciliation.statementBalance = updateDto.statementBalance;
    }

    // Recalculate difference
    reconciliation.calculateDifference();

    await this.reconciliationRepository.save(reconciliation);

    return this.findOne(id);
  }

  /**
   * Soft delete a reconciliation (only if IN_PROGRESS)
   */
  async remove(id: string, userId: string = 'system'): Promise<void> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Cannot delete a completed reconciliation');
    }

    await this.reconciliationRepository.softDelete(id);
    this.logger.log(`Bank reconciliation soft-deleted: ${id}`);
  }

  /**
   * Mark journal entry lines as cleared
   */
  async markCleared(
    id: string,
    dto: ToggleClearedDto,
    userId: string = 'system',
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify a completed reconciliation');
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
    userId: string = 'system',
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify a completed reconciliation');
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
    userId: string = 'system',
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
      relations: ['reconciledTransactions'],
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    if (reconciliation.status === BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Reconciliation is already completed');
    }

    // Recalculate to ensure latest data
    await this.recalculateBalances(id);

    // Re-fetch after recalculation
    const updated = await this.reconciliationRepository.findOne({ where: { id } });

    if (!updated.isBalanced) {
      throw new BadRequestException(
        `Cannot complete reconciliation. Difference: ${Number(updated.difference).toFixed(2)}. ` +
        `Statement balance: ${Number(updated.statementBalance).toFixed(2)}, ` +
        `Cleared balance: ${Number(updated.bookBalance).toFixed(2)}`,
      );
    }

    updated.status = BankReconciliationStatus.COMPLETED;
    await this.reconciliationRepository.save(updated);

    this.logger.log(`Bank reconciliation completed: ${id}`);
    return this.findOne(id);
  }

  /**
   * Reopen a completed reconciliation
   */
  async reopen(
    id: string,
    userId: string = 'system',
  ): Promise<BankReconciliationResponseDto> {
    const reconciliation = await this.reconciliationRepository.findOne({
      where: { id },
    });

    if (!reconciliation) {
      throw new NotFoundException(`Bank reconciliation with ID '${id}' not found`);
    }

    if (reconciliation.status !== BankReconciliationStatus.COMPLETED) {
      throw new BadRequestException('Can only reopen completed reconciliations');
    }

    reconciliation.status = BankReconciliationStatus.IN_PROGRESS;
    await this.reconciliationRepository.save(reconciliation);

    this.logger.log(`Bank reconciliation reopened: ${id}`);
    return this.findOne(id);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Calculate book balance: sum of all posted debit - credit for this account
   */
  private async calculateBookBalance(accountId: string): Promise<number> {
    const result = await this.journalEntryLineRepository
      .createQueryBuilder('line')
      .innerJoin('line.journalEntry', 'entry')
      .select('COALESCE(SUM(line.debitAmount), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(line.creditAmount), 0)', 'totalCredit')
      .where('line.accountId = :accountId', { accountId })
      .andWhere('entry.status = :status', { status: JournalEntryStatus.POSTED })
      .andWhere('entry.deletedAt IS NULL')
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
      .createQueryBuilder('line')
      .innerJoin('line.journalEntry', 'entry')
      .leftJoin(
        'reconciled_transactions',
        'rt',
        'rt.journalEntryLineId = line.id AND rt.cleared = true',
      )
      .leftJoin(
        'bank_reconciliations',
        'br',
        'br.id = rt.reconciliationId AND br.status = :completedStatus',
        { completedStatus: BankReconciliationStatus.COMPLETED },
      )
      .where('line.accountId = :accountId', { accountId })
      .andWhere('entry.status = :status', { status: JournalEntryStatus.POSTED })
      .andWhere('entry.deletedAt IS NULL')
      .andWhere('br.id IS NULL') // Not already cleared in a completed reconciliation
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

    if (!reconciliation) return;

    // Sum cleared transactions
    const result = await this.reconciledTransactionRepository
      .createQueryBuilder('rt')
      .innerJoin('rt.journalEntryLine', 'line')
      .select('COALESCE(SUM(line.debitAmount), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(line.creditAmount), 0)', 'totalCredit')
      .where('rt.reconciliationId = :reconciliationId', { reconciliationId })
      .andWhere('rt.cleared = true')
      .getRawOne();

    const clearedBalance = Number(result.totalDebit) - Number(result.totalCredit);
    reconciliation.bookBalance = clearedBalance;
    reconciliation.calculateDifference();

    await this.reconciliationRepository.save(reconciliation);
  }

  /**
   * Convert entity to response DTO
   */
  private toResponseDto(recon: BankReconciliation): BankReconciliationResponseDto {
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
        ? recon.reconciledTransactions.map((t) => this.toTransactionResponseDto(t))
        : undefined,
      createdAt: recon.createdAt,
      updatedAt: recon.updatedAt,
    };
  }

  private toTransactionResponseDto(txn: ReconciledTransaction): ReconciledTransactionResponseDto {
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
                  referenceNumber: (txn.journalEntryLine as any).journalEntry.referenceNumber,
                  entryDate: (txn.journalEntryLine as any).journalEntry.entryDate,
                  description: (txn.journalEntryLine as any).journalEntry.description,
                }
              : undefined,
          }
        : undefined,
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
    };
  }
}
```

**Step 2: Verify file compiles**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from reconciliation.service.ts

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/reconciliation.service.ts
git commit -m "feat(accounting): add ReconciliationService with CRUD, clearing, and completion"
```

---

### Task 3: Create ReconciliationController

**Files:**
- Create: `backend/src/modules/accounting/controllers/reconciliation.controller.ts`

**Step 1: Write the controller**

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ReconciliationService } from '../services/reconciliation.service';
import {
  CreateBankReconciliationDto,
  UpdateBankReconciliationDto,
  QueryBankReconciliationsDto,
  ToggleClearedDto,
  BankReconciliationResponseDto,
  BankReconciliationListResponseDto,
} from '../dto/reconciliation.dto';

@ApiTags('Bank Reconciliation')
@Controller('accounting/bank-reconciliations')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all bank reconciliations' })
  @ApiResponse({ status: 200, description: 'Returns paginated bank reconciliations', type: BankReconciliationListResponseDto })
  async findAll(
    @Query() query: QueryBankReconciliationsDto,
  ): Promise<BankReconciliationListResponseDto> {
    return this.reconciliationService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bank reconciliation by ID with transactions' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 200, description: 'Returns bank reconciliation with transaction details', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 404, description: 'Bank reconciliation not found' })
  async findOne(@Param('id') id: string): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Start a new bank reconciliation' })
  @ApiResponse({ status: 201, description: 'Bank reconciliation created with unreconciled transactions loaded', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate in-progress reconciliation' })
  @ApiResponse({ status: 404, description: 'Account or fiscal period not found' })
  async create(
    @Body() createDto: CreateBankReconciliationDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.create(createDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bank reconciliation (statement balance, date)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 200, description: 'Bank reconciliation updated', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot update completed reconciliation' })
  @ApiResponse({ status: 404, description: 'Bank reconciliation not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBankReconciliationDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete bank reconciliation (only in-progress)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 204, description: 'Bank reconciliation deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete completed reconciliation' })
  @ApiResponse({ status: 404, description: 'Bank reconciliation not found' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.reconciliationService.remove(id);
  }

  @Post(':id/mark-cleared')
  @ApiOperation({ summary: 'Mark journal entry lines as cleared' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 200, description: 'Transactions marked as cleared', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot modify completed reconciliation' })
  async markCleared(
    @Param('id') id: string,
    @Body() dto: ToggleClearedDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.markCleared(id, dto);
  }

  @Post(':id/unmark-cleared')
  @ApiOperation({ summary: 'Unmark journal entry lines (set cleared = false)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 200, description: 'Transactions unmarked', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot modify completed reconciliation' })
  async unmarkCleared(
    @Param('id') id: string,
    @Body() dto: ToggleClearedDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.unmarkCleared(id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete bank reconciliation (must be balanced)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 200, description: 'Reconciliation completed', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 400, description: 'Reconciliation is not balanced or already completed' })
  async complete(@Param('id') id: string): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.complete(id);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reopen a completed bank reconciliation' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 200, description: 'Reconciliation reopened', type: BankReconciliationResponseDto })
  @ApiResponse({ status: 400, description: 'Not a completed reconciliation' })
  async reopen(@Param('id') id: string): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.reopen(id);
  }
}
```

**Step 2: Verify file compiles**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from reconciliation.controller.ts

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/controllers/reconciliation.controller.ts
git commit -m "feat(accounting): add ReconciliationController with full REST endpoints"
```

---

### Task 4: Register in AccountingModule

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`

**Step 1: Update accounting.module.ts**

Add to imports section (entities):
```typescript
import { BankReconciliation } from '../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../database/entities/reconciled-transaction.entity';
```

Add to imports section (service + controller):
```typescript
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationController } from './controllers/reconciliation.controller';
```

Add `BankReconciliation` and `ReconciledTransaction` to `TypeOrmModule.forFeature([...])`.

Add `ReconciliationController` to `controllers: [...]`.

Add `ReconciliationService` to `providers: [...]` and `exports: [...]`.

The final module should look like:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { FiscalPeriod } from '../../database/entities/fiscal-period.entity';
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../database/entities/journal-entry-line.entity';
import { AccountMapping } from '../../database/entities/account-mapping.entity';
import { BankReconciliation } from '../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../database/entities/reconciled-transaction.entity';

// Services
import { AccountingService } from './services/accounting.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { JournalEntryService } from './services/journal-entry.service';
import { AccountMappingService } from './services/account-mapping.service';
import { AccountingReportsService } from './services/accounting-reports.service';
import { ReconciliationService } from './services/reconciliation.service';

// Controllers
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';
import { AccountMappingController } from './controllers/account-mapping.controller';
import { AccountingReportsController } from './controllers/accounting-reports.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartOfAccount,
      FiscalPeriod,
      JournalEntry,
      JournalEntryLine,
      AccountMapping,
      BankReconciliation,
      ReconciledTransaction,
    ]),
  ],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalEntryController,
    AccountMappingController,
    AccountingReportsController,
    ReconciliationController,
  ],
  providers: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    ReconciliationService,
  ],
  exports: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    ReconciliationService,
  ],
})
export class AccountingModule {}
```

**Step 2: Verify backend compiles**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean compilation

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/accounting.module.ts
git commit -m "feat(accounting): register ReconciliationService and Controller in module"
```

---

### Task 5: Write ReconciliationService Unit Tests

**Files:**
- Create: `backend/src/modules/accounting/services/reconciliation.service.spec.ts`

**Step 1: Write the test file**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import {
  BankReconciliation,
  BankReconciliationStatus,
} from '../../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../../database/entities/reconciled-transaction.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { FiscalPeriod, FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let reconciliationRepo: jest.Mocked<Repository<BankReconciliation>>;
  let reconciledTxnRepo: jest.Mocked<Repository<ReconciledTransaction>>;
  let journalEntryLineRepo: jest.Mocked<Repository<JournalEntryLine>>;
  let chartOfAccountRepo: jest.Mocked<Repository<ChartOfAccount>>;
  let fiscalPeriodRepo: jest.Mocked<Repository<FiscalPeriod>>;

  const mockAccount = {
    id: 'acct-001',
    code: '1000',
    name: 'Cash in Hand',
    type: 'ASSET',
    isActive: true,
  };

  const mockPeriod = {
    id: 'period-001',
    code: '2026-01',
    name: 'January 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    status: FiscalPeriodStatus.OPEN,
  };

  const mockReconciliation = {
    id: 'recon-001',
    accountId: 'acct-001',
    fiscalPeriodId: 'period-001',
    reconciliationDate: new Date('2026-01-31'),
    statementBalance: 50000,
    bookBalance: 50000,
    difference: 0,
    status: BankReconciliationStatus.IN_PROGRESS,
    isCompleted: false,
    isInProgress: true,
    isBalanced: true,
    calculateDifference: jest.fn(),
    account: mockAccount,
    fiscalPeriod: mockPeriod,
    reconciledTransactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockQueryBuilder = (result: any = [], count: number = 0) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    getManyAndCount: jest.fn().mockResolvedValue([
      Array.isArray(result) ? result : [result],
      count || (Array.isArray(result) ? result.length : 1),
    ]),
    getRawOne: jest.fn().mockResolvedValue({ totalDebit: '50000', totalCredit: '0' }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        {
          provide: getRepositoryToken(BankReconciliation),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ReconciledTransaction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(JournalEntryLine),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FiscalPeriod),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
    reconciliationRepo = module.get(getRepositoryToken(BankReconciliation));
    reconciledTxnRepo = module.get(getRepositoryToken(ReconciledTransaction));
    journalEntryLineRepo = module.get(getRepositoryToken(JournalEntryLine));
    chartOfAccountRepo = module.get(getRepositoryToken(ChartOfAccount));
    fiscalPeriodRepo = module.get(getRepositoryToken(FiscalPeriod));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      accountId: 'acct-001',
      fiscalPeriodId: 'period-001',
      reconciliationDate: new Date('2026-01-31'),
      statementBalance: 50000,
    };

    it('should create a bank reconciliation', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue(mockPeriod as any);
      reconciliationRepo.findOne
        .mockResolvedValueOnce(null) // No existing in-progress
        .mockResolvedValueOnce(mockReconciliation as any); // findOne after create
      reconciliationRepo.create.mockReturnValue(mockReconciliation as any);
      reconciliationRepo.save.mockResolvedValue(mockReconciliation as any);
      journalEntryLineRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([], 0) as any);
      reconciledTxnRepo.create.mockReturnValue({} as any);
      reconciledTxnRepo.save.mockResolvedValue([] as any);

      const result = await service.create(createDto);
      expect(result).toBeDefined();
      expect(result.id).toBe('recon-001');
    });

    it('should throw NotFoundException if account not found', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if fiscal period not found', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if period is closed', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue({
        ...mockPeriod,
        status: FiscalPeriodStatus.CLOSED,
      } as any);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if in-progress reconciliation exists', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue(mockPeriod as any);
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any); // Existing found

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a reconciliation by ID', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      const result = await service.findOne('recon-001');
      expect(result).toBeDefined();
      expect(result.id).toBe('recon-001');
    });

    it('should throw NotFoundException if not found', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated reconciliations', async () => {
      reconciliationRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([mockReconciliation], 1) as any,
      );

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('update', () => {
    it('should update statement balance', async () => {
      const updatedRecon = { ...mockReconciliation, statementBalance: 51000 };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(mockReconciliation as any) // Initial find
        .mockResolvedValueOnce(updatedRecon as any); // findOne after save
      reconciliationRepo.save.mockResolvedValue(updatedRecon as any);

      const result = await service.update('recon-001', { statementBalance: 51000 });
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if reconciliation is completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(
        service.update('recon-001', { statementBalance: 51000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if not found', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { statementBalance: 51000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete an in-progress reconciliation', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);
      reconciliationRepo.softDelete.mockResolvedValue({ affected: 1 } as any);

      await service.remove('recon-001');
      expect(reconciliationRepo.softDelete).toHaveBeenCalledWith('recon-001');
    });

    it('should throw BadRequestException if reconciliation is completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(service.remove('recon-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('markCleared', () => {
    it('should mark transactions as cleared', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);
      const mockTxn = { reconciliationId: 'recon-001', journalEntryLineId: 'line-001', cleared: false };
      reconciledTxnRepo.findOne.mockResolvedValue(mockTxn as any);
      reconciledTxnRepo.save.mockResolvedValue({ ...mockTxn, cleared: true } as any);
      reconciledTxnRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder() as any);
      reconciliationRepo.save.mockResolvedValue(mockReconciliation as any);

      // For the findOne call at the end
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      const result = await service.markCleared('recon-001', {
        journalEntryLineIds: ['line-001'],
      });
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if reconciliation is completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(
        service.markCleared('recon-001', { journalEntryLineIds: ['line-001'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('complete', () => {
    it('should complete a balanced reconciliation', async () => {
      const balancedRecon = { ...mockReconciliation, isBalanced: true };
      reconciliationRepo.findOne.mockResolvedValue(balancedRecon as any);
      reconciledTxnRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder() as any);
      reconciliationRepo.save.mockResolvedValue({
        ...balancedRecon,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      const result = await service.complete('recon-001');
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if already completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(service.complete('recon-001')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not balanced', async () => {
      const unbalancedRecon = {
        ...mockReconciliation,
        isBalanced: false,
        difference: 250,
        statementBalance: 50250,
        bookBalance: 50000,
      };
      reconciliationRepo.findOne.mockResolvedValue(unbalancedRecon as any);
      reconciledTxnRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder() as any);
      reconciliationRepo.save.mockResolvedValue(unbalancedRecon as any);

      await expect(service.complete('recon-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reopen', () => {
    it('should reopen a completed reconciliation', async () => {
      const completedRecon = {
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      };
      reconciliationRepo.findOne.mockResolvedValue(completedRecon as any);
      reconciliationRepo.save.mockResolvedValue({
        ...completedRecon,
        status: BankReconciliationStatus.IN_PROGRESS,
      } as any);

      const result = await service.reopen('recon-001');
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if not completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      await expect(service.reopen('recon-001')).rejects.toThrow(BadRequestException);
    });
  });
});
```

**Step 2: Run tests**

Run: `cd /home/blur/erp2/backend && npx jest --testPathPattern="reconciliation.service.spec" --verbose 2>&1 | tail -40`
Expected: All tests pass (15 tests)

**Step 3: Fix any failures, then commit**

```bash
git add backend/src/modules/accounting/services/reconciliation.service.spec.ts
git commit -m "test(accounting): add ReconciliationService unit tests (15 tests)"
```

---

### Task 6: Add Frontend Types and API Service

**Files:**
- Modify: `frontend/src/types/index.ts` (add BankReconciliation types)
- Modify: `frontend/src/services/accountingApi.ts` (add bankReconciliationsApi)

**Step 1: Add types to `frontend/src/types/index.ts`**

Add at the end of the file, after the existing FiscalPeriod interface:

```typescript
// Bank Reconciliation types
export enum BankReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface ReconciledTransaction {
  id: string;
  reconciliationId: string;
  journalEntryLineId: string;
  cleared: boolean;
  journalEntryLine?: {
    id: string;
    journalEntryId: string;
    accountId: string;
    debitAmount: number;
    creditAmount: number;
    memo: string;
    account?: { id: string; code: string; name: string; type: string };
    journalEntry?: { id: string; referenceNumber: string; entryDate: Date | string; description: string };
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BankReconciliation {
  id: string;
  accountId: string;
  fiscalPeriodId: string;
  reconciliationDate: Date | string;
  statementBalance: number;
  bookBalance: number;
  difference: number;
  status: BankReconciliationStatus;
  isCompleted: boolean;
  isInProgress: boolean;
  isBalanced: boolean;
  account?: { id: string; code: string; name: string; type: string };
  fiscalPeriod?: { id: string; code: string; name: string; status: string };
  reconciledTransactions?: ReconciledTransaction[];
  createdAt: Date | string;
  updatedAt: Date | string;
}
```

**Step 2: Add API methods to `frontend/src/services/accountingApi.ts`**

Add before the final `export const accountingApi` block:

```typescript
// Bank Reconciliations API
export const bankReconciliationsApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    accountId?: string;
    fiscalPeriodId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<BankReconciliation>> => {
    return ApiService.get(`${BASE_URL}/bank-reconciliations`, { params });
  },

  getById: (id: string): Promise<BankReconciliation> => {
    return ApiService.get(`${BASE_URL}/bank-reconciliations/${id}`);
  },

  create: (data: {
    accountId: string;
    fiscalPeriodId: string;
    reconciliationDate: string;
    statementBalance: number;
  }): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations`, data);
  },

  update: (id: string, data: {
    reconciliationDate?: string;
    statementBalance?: number;
  }): Promise<BankReconciliation> => {
    return ApiService.patch(`${BASE_URL}/bank-reconciliations/${id}`, data);
  },

  delete: (id: string): Promise<void> => {
    return ApiService.delete(`${BASE_URL}/bank-reconciliations/${id}`);
  },

  markCleared: (id: string, journalEntryLineIds: string[]): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/mark-cleared`, {
      journalEntryLineIds,
    });
  },

  unmarkCleared: (id: string, journalEntryLineIds: string[]): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/unmark-cleared`, {
      journalEntryLineIds,
    });
  },

  complete: (id: string): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/complete`);
  },

  reopen: (id: string): Promise<BankReconciliation> => {
    return ApiService.post(`${BASE_URL}/bank-reconciliations/${id}/reopen`);
  },
};
```

Also add `BankReconciliation` to the imports at the top and add `bankReconciliations: bankReconciliationsApi` to the final `accountingApi` export.

**Step 3: Verify frontend compiles**

Run: `cd /home/blur/erp2/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/accountingApi.ts
git commit -m "feat(accounting): add BankReconciliation frontend types and API service"
```

---

### Task 7: Create bankReconciliationsSlice

**Files:**
- Create: `frontend/src/store/slices/bankReconciliationsSlice.ts`
- Modify: `frontend/src/store/index.ts` (register reducer)

**Step 1: Write the Redux slice**

```typescript
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { BankReconciliation, BankReconciliationStatus, PaginatedResponse } from '@/types';
import { bankReconciliationsApi } from '@/services/accountingApi';

interface BankReconciliationsState {
  data: BankReconciliation[];
  selectedReconciliation: BankReconciliation | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: BankReconciliationsState = {
  data: [],
  selectedReconciliation: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

export const fetchBankReconciliations = createAsyncThunk(
  'bankReconciliations/fetchAll',
  async (params: {
    page?: number;
    limit?: number;
    accountId?: string;
    fiscalPeriodId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }, { rejectWithValue }) => {
    try {
      const response = await bankReconciliationsApi.getAll(params);
      return response || { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch reconciliations');
    }
  },
);

export const fetchBankReconciliationById = createAsyncThunk(
  'bankReconciliations/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.getById(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch reconciliation');
    }
  },
);

export const createBankReconciliation = createAsyncThunk(
  'bankReconciliations/create',
  async (data: {
    accountId: string;
    fiscalPeriodId: string;
    reconciliationDate: string;
    statementBalance: number;
  }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.create(data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create reconciliation');
    }
  },
);

export const updateBankReconciliation = createAsyncThunk(
  'bankReconciliations/update',
  async ({ id, data }: { id: string; data: { reconciliationDate?: string; statementBalance?: number } }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.update(id, data);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update reconciliation');
    }
  },
);

export const deleteBankReconciliation = createAsyncThunk(
  'bankReconciliations/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await bankReconciliationsApi.delete(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete reconciliation');
    }
  },
);

export const markTransactionsCleared = createAsyncThunk(
  'bankReconciliations/markCleared',
  async ({ id, journalEntryLineIds }: { id: string; journalEntryLineIds: string[] }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.markCleared(id, journalEntryLineIds);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to mark transactions cleared');
    }
  },
);

export const unmarkTransactionsCleared = createAsyncThunk(
  'bankReconciliations/unmarkCleared',
  async ({ id, journalEntryLineIds }: { id: string; journalEntryLineIds: string[] }, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.unmarkCleared(id, journalEntryLineIds);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to unmark transactions');
    }
  },
);

export const completeBankReconciliation = createAsyncThunk(
  'bankReconciliations/complete',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.complete(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to complete reconciliation');
    }
  },
);

export const reopenBankReconciliation = createAsyncThunk(
  'bankReconciliations/reopen',
  async (id: string, { rejectWithValue }) => {
    try {
      return await bankReconciliationsApi.reopen(id);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reopen reconciliation');
    }
  },
);

const bankReconciliationsSlice = createSlice({
  name: 'bankReconciliations',
  initialState,
  reducers: {
    setSelectedReconciliation: (state, action: PayloadAction<BankReconciliation | null>) => {
      state.selectedReconciliation = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch all
    builder
      .addCase(fetchBankReconciliations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBankReconciliations.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          const payload = action.payload as any;
          state.data = payload.data || [];
          state.pagination = payload.meta || { page: 1, limit: 20, total: 0, totalPages: 0 };
        }
      })
      .addCase(fetchBankReconciliations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch by ID
    builder
      .addCase(fetchBankReconciliationById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBankReconciliationById.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload) {
          state.selectedReconciliation = action.payload;
          const index = state.data.findIndex((r) => r.id === action.payload.id);
          if (index >= 0) state.data[index] = action.payload;
        }
      })
      .addCase(fetchBankReconciliationById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create
    builder
      .addCase(createBankReconciliation.fulfilled, (state, action) => {
        if (action.payload) state.data.unshift(action.payload);
      })
      .addCase(createBankReconciliation.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Update
    builder
      .addCase(updateBankReconciliation.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.data.findIndex((r) => r.id === action.payload.id);
          if (index >= 0) state.data[index] = action.payload;
          if (state.selectedReconciliation?.id === action.payload.id) {
            state.selectedReconciliation = action.payload;
          }
        }
      })
      .addCase(updateBankReconciliation.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Delete
    builder
      .addCase(deleteBankReconciliation.fulfilled, (state, action) => {
        if (action.payload) {
          state.data = state.data.filter((r) => r.id !== action.payload);
          if (state.selectedReconciliation?.id === action.payload) {
            state.selectedReconciliation = null;
          }
        }
      })
      .addCase(deleteBankReconciliation.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Mark cleared / unmark cleared / complete / reopen all update the selected reconciliation
    const updateSelected = (state: BankReconciliationsState, action: any) => {
      state.loading = false;
      if (action.payload) {
        const index = state.data.findIndex((r) => r.id === action.payload.id);
        if (index >= 0) state.data[index] = action.payload;
        if (state.selectedReconciliation?.id === action.payload.id) {
          state.selectedReconciliation = action.payload;
        }
      }
    };

    builder
      .addCase(markTransactionsCleared.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(markTransactionsCleared.fulfilled, updateSelected)
      .addCase(markTransactionsCleared.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(unmarkTransactionsCleared.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(unmarkTransactionsCleared.fulfilled, updateSelected)
      .addCase(unmarkTransactionsCleared.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(completeBankReconciliation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(completeBankReconciliation.fulfilled, updateSelected)
      .addCase(completeBankReconciliation.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });

    builder
      .addCase(reopenBankReconciliation.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(reopenBankReconciliation.fulfilled, updateSelected)
      .addCase(reopenBankReconciliation.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });
  },
});

export const { setSelectedReconciliation, clearError } = bankReconciliationsSlice.actions;

export const selectBankReconciliations = (state: any) => state.bankReconciliations?.data;
export const selectSelectedReconciliation = (state: any) => state.bankReconciliations?.selectedReconciliation;
export const selectBankReconciliationsLoading = (state: any) => state.bankReconciliations?.loading;
export const selectBankReconciliationsError = (state: any) => state.bankReconciliations?.error;
export const selectBankReconciliationsPagination = (state: any) => state.bankReconciliations?.pagination;

export default bankReconciliationsSlice.reducer;
```

**Step 2: Register in store**

In `frontend/src/store/index.ts`, add:
- Import: `import bankReconciliationsSlice from './slices/bankReconciliationsSlice'`
- Add to rootReducer: `bankReconciliations: bankReconciliationsSlice,`

**Step 3: Verify frontend compiles**

Run: `cd /home/blur/erp2/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add frontend/src/store/slices/bankReconciliationsSlice.ts frontend/src/store/index.ts
git commit -m "feat(accounting): add bankReconciliationsSlice Redux state management"
```

---

### Task 8: Create BankReconciliationsPage (List View)

**Files:**
- Create: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`

**Step 1: Write the list page**

Create a page following the `FiscalPeriodsPage.tsx` pattern exactly. The page should:
- Show a table of reconciliations with columns: Account, Period, Reconciliation Date, Statement Balance, Book Balance, Difference, Status, Actions
- Filter by account (dropdown from chartOfAccounts), period (dropdown from fiscalPeriods), status (All/In Progress/Completed)
- "New Reconciliation" button that navigates to `/accounting/bank-reconciliations/new`
- Click row to navigate to `/accounting/bank-reconciliations/:id`
- Delete button (only for IN_PROGRESS)
- Status chips: IN_PROGRESS = warning, COMPLETED = success
- Difference column highlighted red when != 0
- Use TYPOGRAPHY_STYLES and TABLE_STYLES constants
- Use useNotification hook for success/error messages
- Fetch data on mount and filter change

**Important patterns to follow from FiscalPeriodsPage.tsx:**
- `const dispatch = useDispatch() as any`
- `useSelector(selectBankReconciliations) || []`
- `useEffect` for fetching on filter change
- `ConfirmationDialog` for delete confirmation
- Mobile responsive with `useMediaQuery(theme.breakpoints.down('md'))`

**Step 2: Verify frontend compiles**

Run: `cd /home/blur/erp2/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationsPage.tsx
git commit -m "feat(accounting): add BankReconciliationsPage list view"
```

---

### Task 9: Create BankReconciliationFormDialog (Create/Edit)

**Files:**
- Create: `frontend/src/components/accounting/BankReconciliationFormDialog.tsx`

**Step 1: Write the form dialog**

Follow the pattern from `FiscalPeriodFormDialog.tsx` or `GeneratePeriodsDialog.tsx`. The dialog should:
- Account selector (dropdown from chartOfAccounts, filtered to Asset type accounts only)
- Fiscal period selector (dropdown from fiscalPeriods, filtered to OPEN periods)
- Reconciliation date (date picker)
- Statement balance (number input)
- On submit: dispatch `createBankReconciliation` or `updateBankReconciliation`
- Close dialog on success
- Show error via useNotification

**Step 2: Verify compiles and commit**

```bash
git add frontend/src/components/accounting/BankReconciliationFormDialog.tsx
git commit -m "feat(accounting): add BankReconciliationFormDialog component"
```

---

### Task 10: Create BankReconciliationDetailsPage

**Files:**
- Create: `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx`

**Step 1: Write the details/workflow page**

This is the main reconciliation workflow page. It should:

**Header section:**
- Account name and code
- Fiscal period name
- Reconciliation date (editable if IN_PROGRESS)
- Statement balance (editable if IN_PROGRESS) with save button
- Book balance (calculated, read-only)
- Difference display (highlighted red when != 0, green when balanced)
- Status chip
- Action buttons: Complete (when balanced), Reopen (when completed), Delete (when in progress)

**Transactions table:**
- Checkbox column for cleared status
- Entry date (from journalEntry.entryDate)
- Reference # (from journalEntry.referenceNumber)
- Description (from journalEntry.description + line memo)
- Debit amount
- Credit amount
- Cleared status indicator

**Behavior:**
- Fetch reconciliation on mount via `fetchBankReconciliationById(id)` from URL param
- Toggle cleared: when checkbox clicked, dispatch `markTransactionsCleared` or `unmarkTransactionsCleared`
- Complete button: dispatch `completeBankReconciliation`
- Reopen button: dispatch `reopenBankReconciliation`
- Real-time balance summary: Cleared total, Uncleared total
- Back button to `/accounting/bank-reconciliations`

**Step 2: Verify compiles and commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx
git commit -m "feat(accounting): add BankReconciliationDetailsPage with transaction matching"
```

---

### Task 11: Add Routes and Navigation

**Files:**
- Modify: `frontend/src/App.tsx` (add routes + lazy imports)
- Modify: `frontend/src/components/common/Sidebar.tsx` (add nav item)

**Step 1: Add lazy imports to App.tsx**

Add after the existing accounting lazy imports (around line 79):
```typescript
const BankReconciliationsPage = React.lazy(() => import('./pages/accounting/BankReconciliationsPage'))
const BankReconciliationDetailsPage = React.lazy(() => import('./pages/accounting/BankReconciliationDetailsPage'))
```

**Step 2: Add routes to App.tsx**

Add after the existing accounting routes (after line 283, before the reports routes):
```typescript
<Route path="/accounting/bank-reconciliations" element={<BankReconciliationsPage />} />
<Route path="/accounting/bank-reconciliations/:id" element={<BankReconciliationDetailsPage />} />
```

**Step 3: Add sidebar navigation**

In `Sidebar.tsx`, add a new item in the accounting children array, after `account-mappings` and before `accounting-reports`:
```typescript
{
  id: 'bank-reconciliation',
  title: 'Bank Reconciliation',
  icon: <AccountBalanceIcon />,
  path: '/accounting/bank-reconciliations',
},
```

Note: `AccountBalanceIcon` is already imported. If a more specific icon is needed, use `CompareArrowsIcon` from `@mui/icons-material` instead.

**Step 4: Verify frontend compiles**

Run: `cd /home/blur/erp2/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/common/Sidebar.tsx
git commit -m "feat(accounting): add bank reconciliation routes and sidebar navigation"
```

---

### Task 12: Run Full Backend Tests

**Files:** None (verification only)

**Step 1: Run all backend tests**

Run: `cd /home/blur/erp2/backend && npm run test 2>&1 | tail -30`
Expected: All existing tests pass + new reconciliation tests pass

**Step 2: Run reconciliation tests specifically**

Run: `cd /home/blur/erp2/backend && npx jest --testPathPattern="reconciliation" --verbose 2>&1 | tail -30`
Expected: 15+ tests passing

**Step 3: Fix any failures and recommit if needed**

---

### Task 13: Run Full Frontend Build Check

**Files:** None (verification only)

**Step 1: TypeScript check**

Run: `cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20`
Expected: No errors

**Step 2: Build check**

Run: `cd /home/blur/erp2/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Fix any issues and recommit if needed**

---

### Task 14: Update CLAUDE.md

**Files:**
- Modify: `/home/blur/erp2/CLAUDE.md`

**Step 1: Add bank reconciliation section**

Add a new section under the existing accounting-related content in CLAUDE.md documenting:

- Bank Reconciliation feature overview
- API endpoints: `GET/POST /api/accounting/bank-reconciliations`, `GET/PATCH/DELETE :id`, `POST :id/mark-cleared`, `POST :id/unmark-cleared`, `POST :id/complete`, `POST :id/reopen`
- Frontend routes: `/accounting/bank-reconciliations`, `/accounting/bank-reconciliations/:id`
- Key files created

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add bank reconciliation module documentation to CLAUDE.md"
```

---

## Summary

| Task | Description | Files | Est. Size |
|------|-------------|-------|-----------|
| 1 | Reconciliation DTOs | 1 new | ~130 lines |
| 2 | ReconciliationService | 1 new | ~350 lines |
| 3 | ReconciliationController | 1 new | ~100 lines |
| 4 | Register in AccountingModule | 1 modified | ~10 line changes |
| 5 | Service unit tests | 1 new | ~300 lines |
| 6 | Frontend types + API service | 2 modified | ~100 lines |
| 7 | Redux slice + store registration | 2 files (1 new, 1 mod) | ~250 lines |
| 8 | BankReconciliationsPage (list) | 1 new | ~400 lines |
| 9 | BankReconciliationFormDialog | 1 new | ~200 lines |
| 10 | BankReconciliationDetailsPage | 1 new | ~500 lines |
| 11 | Routes + navigation | 2 modified | ~15 line changes |
| 12 | Backend test verification | 0 | verification |
| 13 | Frontend build verification | 0 | verification |
| 14 | Update CLAUDE.md | 1 modified | ~30 lines |

**Total: 8 new files, 6 modified files, ~2,385 lines of code**
