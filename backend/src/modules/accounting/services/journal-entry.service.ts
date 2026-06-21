import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull, In } from 'typeorm';
import { applyPagination } from '../../../common/pagination/apply-pagination';
import { JournalEntry, JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { FiscalPeriod, FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { Expense } from '../../../database/entities/expense.entity';
import { OwnerEquityTransaction } from '../../../database/entities/owner-equity-transaction.entity';
import { FundTransfer } from '../../../database/entities/fund-transfer.entity';
import { Settlement } from '../../../database/entities/settlement.entity';
import { StockAdjustment } from '../../../database/entities/stock-adjustment.entity';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  QueryJournalEntriesDto,
  JournalEntryResponseDto,
  JournalEntryListResponseDto,
  JournalEntryLineResponseDto,
} from '../dto/journal-entry.dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchJournalEntries } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_JOURNAL,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class JournalEntryService {
  private readonly logger = new Logger(JournalEntryService.name);

  constructor(
    @InjectRepository(JournalEntry)
    private readonly journalEntryRepository: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
    @InjectRepository(FiscalPeriod)
    private readonly fiscalPeriodRepository: Repository<FiscalPeriod>,
    @InjectRepository(ChartOfAccount)
    private readonly chartOfAccountRepository: Repository<ChartOfAccount>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(OwnerEquityTransaction)
    private readonly ownerEquityTransactionRepository: Repository<OwnerEquityTransaction>,
    @InjectRepository(FundTransfer)
    private readonly fundTransferRepository: Repository<FundTransfer>,
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: Repository<StockAdjustment>,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly fiscalPeriodService: FiscalPeriodService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new journal entry (status: DRAFT)
   */
  async create(
    createDto: CreateJournalEntryDto,
    userId?: string,
    username?: string,
  ): Promise<JournalEntryResponseDto> {
    this.logger.log(`Creating journal entry with date: ${createDto.entryDate}`);

    // Validate fiscal period exists and is open
    await this.validateFiscalPeriod(createDto.fiscalPeriodId, createDto.entryDate);

    // Validate all accounts exist and are active
    await this.validateAccounts(createDto.lines.map((line) => line.accountId));

    // Validate entry lines
    this.validateEntryLines(createDto.lines);

    // Generate reference number if not provided
    const referenceNumber =
      createDto.referenceNumber ||
      (await this.settingsService.generateDocumentNumber('Journal Entries'));

    // Check if reference number already exists
    const existingEntry = await this.journalEntryRepository.findOne({
      where: { referenceNumber },
      withDeleted: true,
    });

    if (existingEntry) {
      throw new ConflictException(
        `Journal entry with reference number '${referenceNumber}' already exists`,
      );
    }

    // Create journal entry
    const journalEntry = this.journalEntryRepository.create({
      entryDate: createDto.entryDate,
      referenceNumber,
      description: createDto.description,
      fiscalPeriodId: createDto.fiscalPeriodId,
      sourceType: createDto.sourceType,
      sourceId: createDto.sourceId,
      status: JournalEntryStatus.DRAFT,
    });

    const savedEntry = await this.journalEntryRepository.save(journalEntry);

    // Create journal entry lines
    const lines = createDto.lines.map((lineDto) =>
      this.journalEntryLineRepository.create({
        journalEntryId: savedEntry.id,
        accountId: lineDto.accountId,
        debitAmount: lineDto.debitAmount || 0,
        creditAmount: lineDto.creditAmount || 0,
        memo: lineDto.memo,
      }),
    );

    await this.journalEntryLineRepository.save(lines);

    await this.auditLogService.log(
      'CREATE',
      'JournalEntry',
      `Created journal entry: ${savedEntry.referenceNumber}`,
      { entityId: savedEntry.id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Journal entry created successfully with ID: ${savedEntry.id}`);
    return this.findOne(savedEntry.id);
  }

  /**
   * Find all journal entries with filtering, sorting, and pagination
   */
  async findAll(query: QueryJournalEntriesDto): Promise<JournalEntryListResponseDto> {
    const {
      page,
      limit,
      search,
      status,
      fiscalPeriodId,
      sourceType,
      sourceId,
      startDate,
      endDate,
      sortBy = 'entryDate',
      sortOrder = 'ASC',
      ids,
    } = query;

    const queryBuilder = this.journalEntryRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.fiscalPeriod', 'fiscalPeriod')
      .leftJoinAndSelect('entry.lines', 'lines')
      .leftJoinAndSelect('lines.account', 'account')
      .where('entry.deletedAt IS NULL');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(entry.referenceNumber ILIKE :search OR entry.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('entry.status = :status', { status });
    }

    if (fiscalPeriodId) {
      queryBuilder.andWhere('entry.fiscalPeriodId = :fiscalPeriodId', {
        fiscalPeriodId,
      });
    }

    if (ids) {
      const idList = ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (idList.length > 0) {
        queryBuilder.andWhere('entry.id IN (:...idList)', { idList });
      }
    } else {
      if (sourceType) {
        queryBuilder.andWhere('entry.sourceType = :sourceType', { sourceType });
      }

      if (sourceId) {
        queryBuilder.andWhere('entry.sourceId = :sourceId', { sourceId });
      }
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('entry.entryDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.andWhere('entry.entryDate >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('entry.entryDate <= :endDate', { endDate });
    }

    // Apply sorting
    const validSortFields = ['entryDate', 'referenceNumber', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'entryDate';
    const safeSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    queryBuilder.orderBy(`entry.${sortField}`, safeSortOrder);
    if (sortField !== 'referenceNumber') {
      queryBuilder.addOrderBy('entry.referenceNumber', safeSortOrder);
    }

    // Apply pagination
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    const [entries, total] = await queryBuilder.getManyAndCount();
    const sourceRefMap = await this.resolveSourceRefNumbersMany(entries);
    const data = await Promise.all(entries.map((entry) => this.toResponseDto(entry, sourceRefMap)));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
        hasNextPage: shouldPaginate ? page < Math.ceil(total / limit) : false,
        hasPreviousPage: shouldPaginate ? page > 1 : false,
      },
    };
  }

  async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
    if (!canSearchJournalEntries(user.role as UserRole)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();

    const results = await this.journalEntryRepository
      .createQueryBuilder('je')
      .where('je.deletedAt IS NULL')
      .andWhere('(je.referenceNumber ILIKE :q OR je.description ILIKE :q)', {
        q: `%${trimmed}%`,
      })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (results.length > 0) {
      return results.map((je) => this.mapJournalEntry(je, q, false));
    }

    const fuzzyResults = await this.journalEntryRepository
      .createQueryBuilder('je')
      .addSelect('similarity(je.referenceNumber, :q)', 'sim')
      .where('je.deletedAt IS NULL')
      .andWhere('similarity(je.referenceNumber, :q) > 0.3')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyResults.map((je) => this.mapJournalEntry(je, q, true));
  }

  /**
   * Find one journal entry by ID with all relations
   */
  async findOne(id: string): Promise<JournalEntryResponseDto> {
    const entry = await this.journalEntryRepository.findOne({
      where: { id },
      relations: {
        fiscalPeriod: true,
        lines: { account: true },
        reversalOf: true,
        reversedBy: true,
      },
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry with ID '${id}' not found`);
    }

    return this.toResponseDto(entry);
  }

  /**
   * Update a journal entry (only if status = DRAFT)
   */
  async update(
    id: string,
    updateDto: UpdateJournalEntryDto,
    userId?: string,
    username?: string,
  ): Promise<JournalEntryResponseDto> {
    this.logger.log(`Updating journal entry with ID: ${id}`);

    const entry = await this.journalEntryRepository.findOne({
      where: { id },
      relations: { lines: true },
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry with ID '${id}' not found`);
    }

    // Can only update DRAFT entries
    if (entry.status !== JournalEntryStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot update journal entry with status '${entry.status}'. Only DRAFT entries can be updated.`,
      );
    }

    // Validate fiscal period if being changed
    if (updateDto.fiscalPeriodId && updateDto.fiscalPeriodId !== entry.fiscalPeriodId) {
      const entryDate = updateDto.entryDate || entry.entryDate;
      await this.validateFiscalPeriod(updateDto.fiscalPeriodId, entryDate);
    }

    // Validate accounts if lines are being updated
    if (updateDto.lines) {
      await this.validateAccounts(updateDto.lines.map((line) => line.accountId));
      this.validateEntryLines(updateDto.lines);
    }

    // Check for reference number conflicts if being changed
    if (updateDto.referenceNumber && updateDto.referenceNumber !== entry.referenceNumber) {
      const existingEntry = await this.journalEntryRepository.findOne({
        where: { referenceNumber: updateDto.referenceNumber },
        withDeleted: true,
      });

      if (existingEntry && existingEntry.id !== id) {
        throw new ConflictException(
          `Journal entry with reference number '${updateDto.referenceNumber}' already exists`,
        );
      }
    }

    // Update journal entry
    Object.assign(entry, {
      entryDate: updateDto.entryDate ?? entry.entryDate,
      referenceNumber: updateDto.referenceNumber ?? entry.referenceNumber,
      description: updateDto.description ?? entry.description,
      fiscalPeriodId: updateDto.fiscalPeriodId ?? entry.fiscalPeriodId,
      sourceType: updateDto.sourceType ?? entry.sourceType,
      sourceId: updateDto.sourceId ?? entry.sourceId,
    });

    await this.journalEntryRepository.save(entry);

    // Update lines if provided
    if (updateDto.lines) {
      // Delete existing lines
      await this.journalEntryLineRepository.delete({ journalEntryId: id });

      // Create new lines
      const lines = updateDto.lines.map((lineDto) =>
        this.journalEntryLineRepository.create({
          journalEntryId: id,
          accountId: lineDto.accountId,
          debitAmount: lineDto.debitAmount || 0,
          creditAmount: lineDto.creditAmount || 0,
          memo: lineDto.memo,
        }),
      );

      await this.journalEntryLineRepository.save(lines);
    }

    await this.auditLogService.log(
      'UPDATE',
      'JournalEntry',
      `Updated journal entry: ${entry.referenceNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Journal entry updated successfully: ${id}`);
    return this.findOne(id);
  }

  /**
   * Soft delete a journal entry (only if status = DRAFT)
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Deleting journal entry with ID: ${id}`);

    const entry = await this.journalEntryRepository.findOne({
      where: { id },
      relations: { reversedBy: true },
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry with ID '${id}' not found`);
    }

    // Can only delete DRAFT entries
    if (entry.status !== JournalEntryStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot delete journal entry with status '${entry.status}'. Only DRAFT entries can be deleted.`,
      );
    }

    // Cannot delete entries that have been reversed
    if (entry.reversedById) {
      throw new BadRequestException(
        `Cannot delete journal entry '${entry.referenceNumber}' - it has been reversed. ` +
          `Reversed entries cannot be deleted.`,
      );
    }

    // Soft delete the entry (lines will be cascade deleted)
    await this.journalEntryRepository.softDelete(id);

    await this.auditLogService.log(
      'DELETE',
      'JournalEntry',
      `Deleted journal entry: ${entry.referenceNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Journal entry soft-deleted successfully: ${id}`);
  }

  private mapJournalEntry(je: JournalEntry, q: string, fuzzy: boolean): GlobalSearchResultDto {
    const ref = je.referenceNumber?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : ref === q
        ? SCORE_EXACT_CODE
        : ref.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : SCORE_CONTAINS;

    return {
      type: 'journal_entry',
      id: je.id,
      label: je.referenceNumber,
      description: je.description ?? undefined,
      route: `/accounting/journal-entries/${je.id}`,
      score: baseScore + BOOST_JOURNAL + (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
    };
  }

  /**
   * Post a draft entry
   * Validates: entry is balanced, period is open, changes status to POSTED
   */
  async postEntry(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<JournalEntryResponseDto> {
    this.logger.log(`Posting journal entry with ID: ${id}`);

    const entry = await this.journalEntryRepository.findOne({
      where: { id },
      relations: { fiscalPeriod: true, lines: { account: true } },
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry with ID '${id}' not found`);
    }

    // Can only post DRAFT entries
    if (entry.status !== JournalEntryStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot post journal entry with status '${entry.status}'. Only DRAFT entries can be posted.`,
      );
    }

    // Validate entry is balanced
    if (!entry.isBalanced) {
      throw new BadRequestException(
        `Cannot post unbalanced journal entry. ` +
          `Debits: ${entry.totalDebits.toFixed(2)}, Credits: ${entry.totalCredits.toFixed(2)}`,
      );
    }

    // Validate fiscal period is still open
    const periodIsOpen = await this.fiscalPeriodService.checkPeriodOpen(entry.fiscalPeriodId);
    if (!periodIsOpen) {
      throw new BadRequestException(
        `Cannot post journal entry - fiscal period '${entry.fiscalPeriod.name}' is closed`,
      );
    }

    // Validate entry date falls within fiscal period
    const entryDate = new Date(entry.entryDate);
    const periodStart = new Date(entry.fiscalPeriod.startDate);
    const periodEnd = new Date(entry.fiscalPeriod.endDate);

    if (entryDate < periodStart || entryDate > periodEnd) {
      throw new BadRequestException(
        `Entry date ${entryDate.toISOString().split('T')[0]} is outside fiscal period range ` +
          `(${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`,
      );
    }

    // Post the entry
    entry.status = JournalEntryStatus.POSTED;
    const postedEntry = await this.journalEntryRepository.save(entry);

    await this.auditLogService.log(
      'POST',
      'JournalEntry',
      `Posted journal entry: ${entry.referenceNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Journal entry posted successfully: ${id}`);
    return await this.toResponseDto(postedEntry);
  }

  /**
   * Reverse a posted entry
   * Creates a new entry that's the mirror of the original
   */
  async reverseEntry(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<JournalEntryResponseDto> {
    this.logger.log(`Reversing journal entry with ID: ${id}`);

    const originalEntry = await this.journalEntryRepository.findOne({
      where: { id },
      relations: { fiscalPeriod: true, lines: { account: true } },
    });

    if (!originalEntry) {
      throw new NotFoundException(`Journal entry with ID '${id}' not found`);
    }

    // Can only reverse POSTED entries
    if (originalEntry.status !== JournalEntryStatus.POSTED) {
      throw new BadRequestException(
        `Cannot reverse journal entry with status '${originalEntry.status}'. Only POSTED entries can be reversed.`,
      );
    }

    // Cannot reverse an entry that has already been reversed
    if (originalEntry.reversedById) {
      throw new BadRequestException(
        `Journal entry '${originalEntry.referenceNumber}' has already been reversed`,
      );
    }

    // Validate fiscal period is still open
    const periodIsOpen = await this.fiscalPeriodService.checkPeriodOpen(
      originalEntry.fiscalPeriodId,
    );
    if (!periodIsOpen) {
      throw new BadRequestException(
        `Cannot reverse journal entry - fiscal period '${originalEntry.fiscalPeriod.name}' is closed`,
      );
    }

    // Generate reference number for reversal entry
    const reversalReferenceNumber =
      await this.settingsService.generateDocumentNumber('Journal Entries');

    // Create reversal entry
    const reversalEntry = this.journalEntryRepository.create({
      entryDate: new Date(), // Use current date for reversal
      referenceNumber: reversalReferenceNumber,
      description: `Reversal of ${originalEntry.referenceNumber} - ${originalEntry.description}`,
      fiscalPeriodId: originalEntry.fiscalPeriodId,
      reversalOfId: originalEntry.id,
      status: JournalEntryStatus.POSTED, // Reversals are posted immediately
    });

    const savedReversalEntry = await this.journalEntryRepository.save(reversalEntry);

    // Create reversal lines (swap debits and credits)
    const reversalLines = originalEntry.lines.map((line) =>
      this.journalEntryLineRepository.create({
        journalEntryId: savedReversalEntry.id,
        accountId: line.accountId,
        debitAmount: line.creditAmount, // Swap credit to debit
        creditAmount: line.debitAmount, // Swap debit to credit
        memo: line.memo ? `Reversal: ${line.memo}` : 'Reversal entry',
      }),
    );

    await this.journalEntryLineRepository.save(reversalLines);

    // Update original entry to mark as REVERSED and set reversedById
    originalEntry.status = JournalEntryStatus.REVERSED;
    originalEntry.reversedById = savedReversalEntry.id;
    await this.journalEntryRepository.save(originalEntry);

    await this.auditLogService.log(
      'REVERSE',
      'JournalEntry',
      `Reversed journal entry: ${originalEntry.referenceNumber} -> ${savedReversalEntry.referenceNumber}`,
      {
        entityId: id,
        userId: userId ?? 'system',
        username,
        metadata: { reversalEntryId: savedReversalEntry.id },
      },
    );

    this.logger.log(`Journal entry reversed successfully: ${id} -> ${savedReversalEntry.id}`);
    return this.findOne(savedReversalEntry.id);
  }

  async reverseEntryInPeriod(
    id: string,
    fiscalPeriodId: string,
    userId?: string,
    username?: string,
  ): Promise<JournalEntryResponseDto> {
    this.logger.log(`Reversing journal entry ${id} into period ${fiscalPeriodId}`);

    const originalEntry = await this.journalEntryRepository.findOne({
      where: { id },
      relations: { fiscalPeriod: true, lines: { account: true } },
    });

    if (!originalEntry) {
      throw new NotFoundException(`Journal entry with ID '${id}' not found`);
    }

    if (originalEntry.status !== JournalEntryStatus.POSTED) {
      throw new BadRequestException(
        `Cannot reverse journal entry with status '${originalEntry.status}'. Only POSTED entries can be reversed.`,
      );
    }

    if (originalEntry.reversedById) {
      throw new BadRequestException(
        `Journal entry '${originalEntry.referenceNumber}' has already been reversed`,
      );
    }

    const periodIsOpen = await this.fiscalPeriodService.checkPeriodOpen(fiscalPeriodId);
    if (!periodIsOpen) {
      throw new BadRequestException(
        'Cannot reverse journal entry - target fiscal period is closed',
      );
    }

    const reversalReferenceNumber =
      await this.settingsService.generateDocumentNumber('Journal Entries');

    const reversalEntry = this.journalEntryRepository.create({
      entryDate: new Date(),
      referenceNumber: reversalReferenceNumber,
      description: `Reversal of ${originalEntry.referenceNumber} - ${originalEntry.description}`,
      fiscalPeriodId,
      reversalOfId: originalEntry.id,
      status: JournalEntryStatus.POSTED,
      // Do not copy sourceType/sourceId - reversal entries must not appear in findBySource
      // results or they will be reversed again on subsequent reversal calls
    });

    const savedReversalEntry = await this.journalEntryRepository.save(reversalEntry);

    const reversalLines = originalEntry.lines.map((line) =>
      this.journalEntryLineRepository.create({
        journalEntryId: savedReversalEntry.id,
        accountId: line.accountId,
        debitAmount: line.creditAmount,
        creditAmount: line.debitAmount,
        memo: line.memo ? `Reversal: ${line.memo}` : 'Reversal entry',
      }),
    );

    await this.journalEntryLineRepository.save(reversalLines);

    originalEntry.status = JournalEntryStatus.REVERSED;
    originalEntry.reversedById = savedReversalEntry.id;
    await this.journalEntryRepository.save(originalEntry);

    await this.auditLogService.log(
      'REVERSE',
      'JournalEntry',
      `Reversed journal entry: ${originalEntry.referenceNumber} (into period ${fiscalPeriodId})`,
      {
        entityId: id,
        userId: userId ?? 'system',
        username,
        metadata: { reversalEntryId: savedReversalEntry.id, fiscalPeriodId },
      },
    );

    this.logger.log(`Journal entry reversed: ${id} -> ${savedReversalEntry.id}`);
    return this.findOne(savedReversalEntry.id);
  }

  async findBySource(sourceType: string, sourceId: string): Promise<JournalEntry[]> {
    // Only return original entries (not reversal entries) to avoid reversing reversals
    return this.journalEntryRepository.find({
      where: { sourceType, sourceId, reversalOfId: IsNull() },
      relations: { lines: true },
    });
  }

  async bulkPost(
    ids: string[],
    userId?: string,
    username?: string,
  ): Promise<{
    succeeded: string[];
    failed: { id: string; error: string }[];
  }> {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.postEntry(id, userId, username);
        succeeded.push(id);
      } catch (error: any) {
        failed.push({ id, error: error?.message || 'Unknown error' });
      }
    }

    return { succeeded, failed };
  }

  async bulkDelete(
    ids: string[],
    userId?: string,
    username?: string,
  ): Promise<{
    succeeded: string[];
    failed: { id: string; error: string }[];
  }> {
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.remove(id, userId, username);
        succeeded.push(id);
      } catch (error: any) {
        failed.push({ id, error: error?.message || 'Unknown error' });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Validate fiscal period exists and is open
   */
  private async validateFiscalPeriod(fiscalPeriodId: string, entryDate: Date): Promise<void> {
    const period = await this.fiscalPeriodRepository.findOne({
      where: { id: fiscalPeriodId },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID '${fiscalPeriodId}' not found`);
    }

    if (period.status !== FiscalPeriodStatus.OPEN) {
      throw new BadRequestException(
        `Fiscal period '${period.name}' is ${period.status}. Only OPEN periods can accept new entries.`,
      );
    }

    // Validate entry date falls within period
    const date = new Date(entryDate);
    const periodStart = new Date(period.startDate);
    const periodEnd = new Date(period.endDate);

    if (date < periodStart || date > periodEnd) {
      throw new BadRequestException(
        `Entry date ${date.toISOString().split('T')[0]} is outside fiscal period range ` +
          `(${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`,
      );
    }
  }

  /**
   * Validate all accounts exist and are active
   */
  private async validateAccounts(accountIds: string[]): Promise<void> {
    const uniqueAccountIds = [...new Set(accountIds)];

    for (const accountId of uniqueAccountIds) {
      const account = await this.chartOfAccountRepository.findOne({
        where: { id: accountId, isActive: true },
      });

      if (!account) {
        throw new NotFoundException(
          `Chart of account with ID '${accountId}' not found or inactive`,
        );
      }
    }
  }

  /**
   * Validate entry lines
   * - Each line must have either debit OR credit (not both, not neither)
   * - At least 2 lines required
   */
  private validateEntryLines(lines: any[]): void {
    if (!lines || lines.length < 2) {
      throw new BadRequestException(
        'Journal entry must have at least 2 lines (minimum one debit and one credit)',
      );
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const debit = Number(line.debitAmount) || 0;
      const credit = Number(line.creditAmount) || 0;

      // A line must have either debit or credit, but not both
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(
          `Line ${i + 1}: A journal entry line cannot have both debit and credit amounts`,
        );
      }

      if (debit === 0 && credit === 0) {
        throw new BadRequestException(
          `Line ${i + 1}: A journal entry line must have either a debit or credit amount`,
        );
      }

      // Validate amounts are positive
      if (debit < 0 || credit < 0) {
        throw new BadRequestException(`Line ${i + 1}: Debit and credit amounts must be positive`);
      }
    }
  }

  /** Batch-resolves source reference numbers for a list of entries — one IN query per sourceType. */
  private async resolveSourceRefNumbersMany(entries: JournalEntry[]): Promise<Map<string, string>> {
    const refMap = new Map<string, string>();

    const withSource = entries.filter((entry) => entry.sourceType && entry.sourceId);
    if (withSource.length === 0) return refMap;

    // Group unique sourceIds by sourceType using a Set to avoid O(n²) dedup
    const grouped = new Map<string, Set<string>>();
    for (const entry of withSource) {
      if (!grouped.has(entry.sourceType!)) grouped.set(entry.sourceType!, new Set());
      grouped.get(entry.sourceType!)!.add(entry.sourceId!);
    }

    // Fire one IN query per sourceType; failures are caught per-type so partial results are preserved
    for (const [sourceType, idSet] of grouped.entries()) {
      const ids = [...idSet];
      try {
        switch (sourceType) {
          case 'sales_order': {
            const records = await this.salesOrderRepository.find({
              where: { id: In(ids) },
              select: { id: true, orderNumber: true },
            });
            for (const record of records) {
              refMap.set(`sales_order:${record.id}`, record.orderNumber);
            }
            break;
          }
          case 'purchase_order': {
            const records = await this.purchaseOrderRepository.find({
              where: { id: In(ids) },
              select: { id: true, orderNumber: true },
            });
            for (const record of records) {
              refMap.set(`purchase_order:${record.id}`, record.orderNumber);
            }
            break;
          }
          case 'payment': {
            const records = await this.paymentRepository.find({
              where: { id: In(ids) },
              select: { id: true, paymentNumber: true },
            });
            for (const record of records) {
              refMap.set(`payment:${record.id}`, record.paymentNumber);
            }
            break;
          }
          // 'goods_received_note' source removed with the GRN module. Legacy
          // GRN-sourced entries (pre-redesign) fall through to no resolved ref.
          case 'vendor_payment': {
            const records = await this.vendorPaymentRepository.find({
              where: { id: In(ids) },
              select: { id: true, paymentNumber: true },
            });
            for (const record of records) {
              refMap.set(`vendor_payment:${record.id}`, record.paymentNumber);
            }
            break;
          }
          case 'expense': {
            const records = await this.expenseRepository.find({
              where: { id: In(ids) },
              select: { id: true, referenceNumber: true },
            });
            for (const record of records) {
              refMap.set(`expense:${record.id}`, record.referenceNumber);
            }
            break;
          }
          case 'owner_equity_transaction': {
            const records = await this.ownerEquityTransactionRepository.find({
              where: { id: In(ids) },
              select: { id: true, referenceNumber: true },
            });
            for (const record of records) {
              refMap.set(`owner_equity_transaction:${record.id}`, record.referenceNumber);
            }
            break;
          }
          case 'fund_transfer': {
            const records = await this.fundTransferRepository.find({
              where: { id: In(ids) },
              select: { id: true, referenceNumber: true },
            });
            for (const record of records) {
              refMap.set(`fund_transfer:${record.id}`, record.referenceNumber);
            }
            break;
          }
          case 'settlement': {
            const records = await this.settlementRepository.find({
              where: { id: In(ids) },
              withDeleted: true,
              select: { id: true, settlementNumber: true },
            });
            for (const record of records) {
              refMap.set(`settlement:${record.id}`, record.settlementNumber);
            }
            break;
          }
          case 'stock_adjustment': {
            const records = await this.stockAdjustmentRepository.find({
              where: { id: In(ids) },
              select: { id: true, adjustmentNumber: true },
            });
            for (const record of records) {
              refMap.set(`stock_adjustment:${record.id}`, record.adjustmentNumber);
            }
            break;
          }
          default:
            break;
        }
      } catch (err) {
        this.logger.error(
          `resolveSourceRefNumbersMany failed for sourceType '${sourceType}', skipping`,
          err,
        );
      }
    }

    return refMap;
  }

  private async resolveSourceRefNumber(
    sourceType: string | undefined,
    sourceId: string | undefined,
  ): Promise<string | undefined> {
    if (!sourceType || !sourceId) return undefined;

    try {
      switch (sourceType) {
        case 'sales_order': {
          const record = await this.salesOrderRepository.findOne({
            where: { id: sourceId },
            select: { id: true, orderNumber: true },
          });
          return record?.orderNumber;
        }
        case 'purchase_order': {
          const record = await this.purchaseOrderRepository.findOne({
            where: { id: sourceId },
            select: { id: true, orderNumber: true },
          });
          return record?.orderNumber;
        }
        case 'payment': {
          const record = await this.paymentRepository.findOne({
            where: { id: sourceId },
            select: { id: true, paymentNumber: true },
          });
          return record?.paymentNumber;
        }
        // 'goods_received_note' source removed with the GRN module. Legacy
        // GRN-sourced entries (pre-redesign) resolve to no ref number.
        case 'vendor_payment': {
          const record = await this.vendorPaymentRepository.findOne({
            where: { id: sourceId },
            select: { id: true, paymentNumber: true },
          });
          return record?.paymentNumber;
        }
        case 'expense': {
          const record = await this.expenseRepository.findOne({
            where: { id: sourceId },
            select: { id: true, referenceNumber: true },
          });
          return record?.referenceNumber;
        }
        case 'owner_equity_transaction': {
          const record = await this.ownerEquityTransactionRepository.findOne({
            where: { id: sourceId },
            select: { id: true, referenceNumber: true },
          });
          return record?.referenceNumber;
        }
        case 'fund_transfer': {
          const record = await this.fundTransferRepository.findOne({
            where: { id: sourceId },
            select: { id: true, referenceNumber: true },
          });
          return record?.referenceNumber;
        }
        case 'settlement': {
          const record = await this.settlementRepository.findOne({
            where: { id: sourceId },
            withDeleted: true,
            select: { id: true, settlementNumber: true },
          });
          return record?.settlementNumber;
        }
        case 'stock_adjustment': {
          const record = await this.stockAdjustmentRepository.findOne({
            where: { id: sourceId },
            select: { id: true, adjustmentNumber: true },
          });
          return record?.adjustmentNumber;
        }
        // settlement: no dedicated list page, source navigation not supported
        // opening_balance: synthetic entry with no source entity UUID
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }

  /** Convert journal entry entity to response DTO. */
  private async toResponseDto(
    entry: JournalEntry,
    sourceRefMap?: Map<string, string>,
  ): Promise<JournalEntryResponseDto> {
    const sourceRefNumber = sourceRefMap
      ? sourceRefMap.get(`${entry.sourceType}:${entry.sourceId}`)
      : await this.resolveSourceRefNumber(entry.sourceType, entry.sourceId);

    return {
      id: entry.id,
      entryDate: entry.entryDate,
      referenceNumber: entry.referenceNumber,
      description: entry.description,
      status: entry.status,
      fiscalPeriodId: entry.fiscalPeriodId,
      reversalOfId: entry.reversalOfId,
      reversedById: entry.reversedById,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      sourceRefNumber,
      isDraft: entry.isDraft,
      isPosted: entry.isPosted,
      isReversed: entry.isReversed,
      totalDebits: entry.totalDebits,
      totalCredits: entry.totalCredits,
      isBalanced: entry.isBalanced,
      fiscalPeriod: entry.fiscalPeriod
        ? {
            id: entry.fiscalPeriod.id,
            code: entry.fiscalPeriod.code,
            name: entry.fiscalPeriod.name,
            status: entry.fiscalPeriod.status,
          }
        : undefined,
      lines: entry.lines ? entry.lines.map((line) => this.toLineResponseDto(line)) : undefined,
      // map not propagated: reversalOf/reversedBy are not loaded in list queries
      reversalOf: entry.reversalOf ? await this.toResponseDto(entry.reversalOf) : undefined,
      reversedBy: entry.reversedBy ? await this.toResponseDto(entry.reversedBy) : undefined,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
    };
  }

  /**
   * Convert journal entry line entity to response DTO
   */
  private toLineResponseDto(line: JournalEntryLine): JournalEntryLineResponseDto {
    return {
      id: line.id,
      journalEntryId: line.journalEntryId,
      accountId: line.accountId,
      debitAmount: Number(line.debitAmount),
      creditAmount: Number(line.creditAmount),
      memo: line.memo,
      account: line.account
        ? {
            id: line.account.id,
            code: line.account.code,
            name: line.account.name,
            type: line.account.type,
          }
        : undefined,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    };
  }
}
