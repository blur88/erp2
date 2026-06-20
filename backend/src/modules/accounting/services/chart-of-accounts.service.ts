import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { applyPagination } from '../../../common/pagination/apply-pagination';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { AccountMapping } from '../../../database/entities/account-mapping.entity';
import { BankReconciliation } from '../../../database/entities/bank-reconciliation.entity';
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
  QueryChartOfAccountsDto,
  ChartOfAccountResponseDto,
  ChartOfAccountListResponseDto,
  ChartOfAccountHierarchyDto,
  RecentActivityItemDto,
} from '../dto/chart-of-account.dto';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class ChartOfAccountsService {
  private readonly logger = new Logger(ChartOfAccountsService.name);

  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
    @InjectRepository(AccountMapping)
    private readonly accountMappingRepository: Repository<AccountMapping>,
    @InjectRepository(BankReconciliation)
    private readonly bankReconciliationRepository: Repository<BankReconciliation>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new chart of account
   */
  async create(
    createDto: CreateChartOfAccountDto,
    userId?: string,
    username?: string,
  ): Promise<ChartOfAccountResponseDto> {
    this.logger.log(`Creating account with code: ${createDto.code}`);

    // Check if account code already exists
    const existingAccount = await this.accountRepository.findOne({
      where: { code: createDto.code },
      withDeleted: true,
    });

    if (existingAccount) {
      if (existingAccount.deletedAt) {
        throw new ConflictException(
          `Account with code '${createDto.code}' was previously deleted. ` +
          `Please restore it or use a different code.`,
        );
      }
      throw new ConflictException(
        `Account with code '${createDto.code}' already exists`,
      );
    }

    // Validate parent account if provided
    if (createDto.parentId) {
      const parentAccount = await this.accountRepository.findOne({
        where: { id: createDto.parentId, isActive: true },
      });

      if (!parentAccount) {
        throw new NotFoundException(
          `Parent account with ID '${createDto.parentId}' not found or inactive`,
        );
      }

      // Ensure parent account is the same type
      if (parentAccount.type !== createDto.type) {
        throw new BadRequestException(
          `Parent account must be of the same type (${createDto.type})`,
        );
      }
    }

    // Create the account
    const account = this.accountRepository.create({
      ...createDto,
      isActive: createDto.isActive ?? true,
    });

    const savedAccount = await this.accountRepository.save(account);

    await this.auditLogService.log(
      'CREATE',
      'Account',
      `Created account: ${savedAccount.code} - ${savedAccount.name}`,
      { entityId: savedAccount.id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Account created successfully with ID: ${savedAccount.id}`);
    return this.toResponseDto(savedAccount);
  }

  /**
   * Find all accounts with filtering, sorting, and pagination
   */
  async findAll(
    query: QueryChartOfAccountsDto,
  ): Promise<ChartOfAccountListResponseDto> {
    const {
      page,
      limit,
      search,
      type,
      isActive,
      parentId,
      isCashEquivalent,
      sortBy = 'code',
      sortOrder = 'ASC',
    } = query;

    const queryBuilder = this.accountRepository
      .createQueryBuilder('account')
      .leftJoinAndSelect('account.parent', 'parent')
      .where('account.deletedAt IS NULL');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(account.code ILIKE :search OR account.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (type) {
      queryBuilder.andWhere('account.type = :type', { type });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('account.isActive = :isActive', { isActive });
    }

    if (isCashEquivalent !== undefined) {
      queryBuilder.andWhere('account.isCashEquivalent = :isCashEquivalent', { isCashEquivalent });
    }

    if (parentId !== undefined) {
      if (parentId === null || parentId === 'null') {
        queryBuilder.andWhere('account.parentId IS NULL');
      } else {
        queryBuilder.andWhere('account.parentId = :parentId', { parentId });
      }
    }

    // Apply sorting
    const validSortFields = ['code', 'name', 'type', 'createdAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'code';
    const safeSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    queryBuilder.orderBy(`account.${sortField}`, safeSortOrder);

    // Apply pagination
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    const [accounts, total] = await queryBuilder.getManyAndCount();

    const data = accounts.map((account) => this.toResponseDto(account));

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

  /**
   * Find one account by ID
   */
  async findOne(id: string): Promise<ChartOfAccountResponseDto> {
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { parent: true, children: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${id}' not found`);
    }

    return this.toResponseDto(account);
  }

  /**
   * Update an account
   */
  async update(
    id: string,
    updateDto: UpdateChartOfAccountDto,
    userId?: string,
    username?: string,
  ): Promise<ChartOfAccountResponseDto> {
    this.logger.log(`Updating account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { parent: true, children: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${id}' not found`);
    }

    // Check for code conflicts if code is being changed
    if (updateDto.code && updateDto.code !== account.code) {
      const existingAccount = await this.accountRepository.findOne({
        where: { code: updateDto.code },
        withDeleted: true,
      });

      if (existingAccount && existingAccount.id !== id) {
        if (existingAccount.deletedAt) {
          throw new ConflictException(
            `Account with code '${updateDto.code}' was previously deleted. ` +
            `Please restore it or use a different code.`,
          );
        }
        throw new ConflictException(
          `Account with code '${updateDto.code}' already exists`,
        );
      }
    }

    // Validate parent account if being changed
    if (updateDto.parentId && updateDto.parentId !== account.parentId) {
      const parentAccount = await this.accountRepository.findOne({
        where: { id: updateDto.parentId, isActive: true },
      });

      if (!parentAccount) {
        throw new NotFoundException(
          `Parent account with ID '${updateDto.parentId}' not found or inactive`,
        );
      }

      // Prevent circular reference
      if (updateDto.parentId === id) {
        throw new BadRequestException('An account cannot be its own parent');
      }

      // Ensure parent account is the same type
      const accountType = updateDto.type || account.type;
      if (parentAccount.type !== accountType) {
        throw new BadRequestException(
          `Parent account must be of the same type (${accountType})`,
        );
      }

      // Check if the new parent is not a descendant
      const isDescendant = await this.isDescendantOf(updateDto.parentId, id);
      if (isDescendant) {
        throw new BadRequestException(
          'Cannot set parent to a descendant account (circular reference)',
        );
      }
    }

    // Update the account
    Object.assign(account, updateDto);

    const updatedAccount = await this.accountRepository.save(account);

    // Reload with relations
    const accountWithRelations = await this.accountRepository.findOne({
      where: { id },
      relations: { parent: true, children: true },
    });

    await this.auditLogService.log(
      'UPDATE',
      'Account',
      `Updated account: ${account.code} - ${account.name}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Account updated successfully: ${id}`);
    return this.toResponseDto(accountWithRelations!);
  }

  /**
   * Soft delete an account
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Deleting account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { children: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${id}' not found`);
    }

    // Check if account has children
    if (account.children && account.children.length > 0) {
      throw new BadRequestException(
        `Cannot delete account '${account.name}' - it has ${account.children.length} child account(s). ` +
        `Please delete or reassign child accounts first.`,
      );
    }

    // Check if account has journal entry lines
    const journalEntryLineCount = await this.journalEntryLineRepository.count({
      where: { accountId: id },
    });

    if (journalEntryLineCount > 0) {
      throw new BadRequestException(
        `Cannot delete account '${account.name}' - it has ${journalEntryLineCount} journal entry line(s). ` +
        `Accounts with transactions cannot be deleted.`,
      );
    }

    // Soft delete the account
    await this.accountRepository.softDelete(id);

    await this.auditLogService.log(
      'DELETE',
      'Account',
      `Deleted account: ${account.code} - ${account.name}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Account soft-deleted successfully: ${id}`);
  }

  /**
   * Get all soft-deleted accounts
   */
  async findDeleted(): Promise<ChartOfAccountResponseDto[]> {
    this.logger.log('Fetching all soft-deleted accounts');

    const deletedAccounts = await this.accountRepository.find({
      where: {},
      relations: { parent: true },
      withDeleted: true,
      order: { code: 'ASC' },
    });

    // Filter only deleted accounts
    const deleted = deletedAccounts.filter(account => account.deletedAt !== null);

    this.logger.log(`Found ${deleted.length} soft-deleted accounts`);
    return deleted.map(account => this.toResponseDto(account));
  }

  /**
   * Restore a soft-deleted account
   */
  async restore(id: string, userId?: string, username?: string): Promise<ChartOfAccountResponseDto> {
    this.logger.log(`Restoring account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { parent: true },
      withDeleted: true,
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${id}' not found`);
    }

    if (!account.deletedAt) {
      throw new BadRequestException(`Account '${account.name}' is not deleted`);
    }

    // Check if code is still unique
    const existingAccount = await this.accountRepository.findOne({
      where: { code: account.code },
    });

    if (existingAccount) {
      throw new ConflictException(
        `Cannot restore account - code '${account.code}' is now used by another account`,
      );
    }

    // Restore the account
    await this.accountRepository.restore(id);

    // Fetch the restored account
    const restoredAccount = await this.accountRepository.findOne({
      where: { id },
      relations: { parent: true, children: true },
    });

    await this.auditLogService.log(
      'RESTORE',
      'Account',
      `Restored account: ${account.code} - ${account.name}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Account restored successfully: ${id}`);
    return this.toResponseDto(restoredAccount!);
  }

  /**
   * Bulk restore soft-deleted accounts
   */
  async bulkRestore(
    accountIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    if (!accountIds?.length) {
      return { restoredCount: 0, failedIds: [] };
    }

    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const accountId of accountIds) {
      try {
        await this.restore(accountId, userId, username);
        restoredCount += 1;
      } catch (error: any) {
        failedIds.push(accountId);
        this.logger.warn(
          `Failed to restore account '${accountId}': ${error.message}`,
        );
      }
    }

    return { restoredCount, failedIds };
  }

  /**
   * Get full account hierarchy as a tree structure
   */
  async getAccountHierarchy(): Promise<ChartOfAccountHierarchyDto> {
    this.logger.log('Fetching account hierarchy');

    // Get all accounts
    const accounts = await this.accountRepository.find({
      where: { isActive: true },
      relations: { parent: true, children: true },
      order: { type: 'ASC', code: 'ASC' },
    });

    // Build hierarchy by type
    const rootAccounts = accounts.filter((account) => !account.parentId);
    const hierarchicalData = this.buildHierarchy(rootAccounts, accounts);

    // Calculate statistics
    const accountsByType = accounts.reduce(
      (acc, account) => {
        acc[account.type] = (acc[account.type] || 0) + 1;
        return acc;
      },
      {} as Record<AccountType, number>,
    );

    const maxDepth = this.calculateMaxDepth(hierarchicalData);

    return {
      data: hierarchicalData,
      meta: {
        totalAccounts: accounts.length,
        accountsByType,
        maxDepth,
      },
    };
  }

  /**
   * Get direct children of an account
   */
  async getChildren(parentId: string): Promise<ChartOfAccountResponseDto[]> {
    this.logger.log(`Fetching children for account: ${parentId}`);

    // Verify parent account exists
    const parentAccount = await this.accountRepository.findOne({
      where: { id: parentId },
    });

    if (!parentAccount) {
      throw new NotFoundException(`Account with ID '${parentId}' not found`);
    }

    // Get children
    const children = await this.accountRepository.find({
      where: { parentId, isActive: true },
      relations: { parent: true },
      order: { code: 'ASC' },
    });

    return children.map((child) => this.toResponseDto(child));
  }

  async getRecentActivity(id: string, limit: number): Promise<RecentActivityItemDto[]> {
    const account = await this.accountRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Account with ID '${id}' not found`);
    }

    const rows = await this.journalEntryLineRepository
      .createQueryBuilder('jel')
      .leftJoin('jel.journalEntry', 'je')
      .where('jel.accountId = :id', { id })
      .andWhere('je.status = :status', { status: 'POSTED' })
      .orderBy('je.entryDate', 'DESC')
      .addOrderBy('jel.id', 'DESC')
      .limit(limit)
      .select([
        'je.entryDate AS date',
        'je.referenceNumber AS reference',
        'je.description AS description',
        'jel.debitAmount AS debit',
        'jel.creditAmount AS credit',
      ])
      .getRawMany();

    return rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
      reference: row.reference,
      description: row.description ?? '',
      debit: Number(row.debit) > 0 ? Number(row.debit) : null,
      credit: Number(row.credit) > 0 ? Number(row.credit) : null,
    }));
  }

  /**
   * Permanently delete an account (hard delete)
   * Only soft-deleted accounts can be permanently deleted
   */
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Permanently deleting account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { children: true },
      withDeleted: true,
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${id}' not found`);
    }

    // Only allow permanent delete of soft-deleted accounts
    if (!account.deletedAt) {
      throw new BadRequestException(
        `Account '${account.name}' must be soft-deleted first before permanent deletion`,
      );
    }

    // Check if account has children
    if (account.children && account.children.length > 0) {
      throw new BadRequestException(
        `Cannot permanently delete account '${account.name}' - it has ${account.children.length} child account(s)`,
      );
    }

    // Check if account has journal entry lines
    const journalEntryLineCount = await this.journalEntryLineRepository.count({
      where: { accountId: id },
    });

    if (journalEntryLineCount > 0) {
      throw new BadRequestException(
        `Cannot permanently delete account '${account.name}' - it has ${journalEntryLineCount} journal entry line(s). ` +
        `Accounts with transactions cannot be permanently deleted.`,
      );
    }

    // Check if account is still used by account mappings
    const mappingCount = await this.accountMappingRepository.count({
      where: { accountId: id },
    });
    if (mappingCount > 0) {
      const mappings = await this.accountMappingRepository.find({
        where: { accountId: id },
      });
      const mappingTypes = [...new Set(mappings.map((m) => m.mappingType))].sort();
      throw new BadRequestException(
        `Cannot permanently delete account '${account.name}' - it is used in account mapping(s): ${mappingTypes.join(', ')}. Clear those mappings first.`,
      );
    }

    // "Clear mapping" currently soft-deletes rows, which can still hold FK references.
    // Remove any lingering mapping rows to avoid DB-level RESTRICT failures.
    await this.accountMappingRepository.delete({ accountId: id });

    // Check if account is used by bank reconciliations
    const reconciliationCount = await this.bankReconciliationRepository.count({
      where: { accountId: id },
    });
    if (reconciliationCount > 0) {
      throw new BadRequestException(
        `Cannot permanently delete account '${account.name}' - it has ${reconciliationCount} bank reconciliation(s).`,
      );
    }

    // Hard delete the account
    await this.accountRepository.remove(account);

    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'Account',
      `Permanently deleted account: ${account.code} - ${account.name}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    this.logger.log(`Account permanently deleted: ${id}`);
  }

  /**
   * Bulk permanently delete soft-deleted accounts
   */
  async bulkPermanentDelete(
    accountIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{
    deletedCount: number;
    failedIds: string[];
    failedItems: Array<{ id: string; reason: string }>;
  }> {
    if (!accountIds?.length) {
      return { deletedCount: 0, failedIds: [], failedItems: [] };
    }

    const failedIds: string[] = [];
    const failedItems: Array<{ id: string; reason: string }> = [];
    let deletedCount = 0;

    for (const accountId of accountIds) {
      try {
        await this.permanentDelete(accountId, userId, username);
        deletedCount += 1;
      } catch (error: any) {
        const reason = error?.response?.message || error?.message || 'Unknown error';
        failedIds.push(accountId);
        failedItems.push({ id: accountId, reason });
        this.logger.warn(
          `Failed to permanently delete account '${accountId}': ${reason}`,
        );
      }
    }

    return { deletedCount, failedIds, failedItems };
  }

  /**
   * Seed default chart of accounts
   * Creates 20+ accounts covering all account types
   */
  async seedDefaultChartOfAccounts(userId?: string, username?: string): Promise<void> {
    this.logger.log('Seeding default chart of accounts');

    // Check if accounts already exist
    const existingCount = await this.accountRepository.count();
    if (existingCount > 0) {
      this.logger.warn('Chart of accounts already seeded, skipping');
      return;
    }

    const defaultAccounts: CreateChartOfAccountDto[] = [
      // ASSET Accounts
      { code: '1000', name: 'Cash', type: AccountType.ASSET },
      { code: '1010', name: 'CIMB', type: AccountType.ASSET },
      { code: '1020', name: 'Maybank', type: AccountType.ASSET },
      { code: '1030', name: 'Shopee Receivable', type: AccountType.ASSET },
      { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET },
      { code: '1200', name: 'Inventory', type: AccountType.ASSET },

      // LIABILITY Accounts
      { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY },

      // EQUITY Accounts
      { code: '3000', name: "Owner's Capital", type: AccountType.EQUITY },
      { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY },
      { code: '3200', name: "Owner's Drawings", type: AccountType.EQUITY },

      // REVENUE Accounts
      { code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE },
      { code: '4100', name: 'Other Income', type: AccountType.REVENUE },
      { code: '4200', name: 'Inventory Adjustment Gain', type: AccountType.REVENUE },

      // EXPENSE Accounts
      { code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE },
      { code: '6000', name: 'Utilities Expense', type: AccountType.EXPENSE },
      { code: '6100', name: 'Office Supplies Expense', type: AccountType.EXPENSE },
      { code: '6200', name: 'Courier Expense', type: AccountType.EXPENSE },
      { code: '6300', name: 'Inventory Adjustment Loss', type: AccountType.EXPENSE },
    ];

    // Create all accounts
    for (const accountDto of defaultAccounts) {
      try {
        await this.create(accountDto, userId, username);
        this.logger.log(`Created account: ${accountDto.code} - ${accountDto.name}`);
      } catch (error) {
        this.logger.error(`Failed to create account ${accountDto.code}: ${error.message}`);
      }
    }

    this.logger.log(`Default chart of accounts seeded: ${defaultAccounts.length} accounts`);
  }

  /**
   * Convert account entity to response DTO
   */
  private toResponseDto(account: ChartOfAccount): ChartOfAccountResponseDto {
    return {
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      parentId: account.parentId,
      isActive: account.isActive,
      isCashEquivalent: account.isCashEquivalent,
      fullCode: account.fullCode,
      isParent: account.isParent,
      parent: account.parent
        ? {
            id: account.parent.id,
            code: account.parent.code,
            name: account.parent.name,
            type: account.parent.type,
          }
        : undefined,
      children: account.children
        ? account.children.map((child) => this.toResponseDto(child))
        : undefined,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      deletedAt: account.deletedAt,
    };
  }

  /**
   * Build hierarchical tree structure from flat account list
   */
  private buildHierarchy(
    roots: ChartOfAccount[],
    allAccounts: ChartOfAccount[],
  ): ChartOfAccountResponseDto[] {
    return roots.map((root) => {
      const dto = this.toResponseDto(root);
      const children = allAccounts.filter(
        (account) => account.parentId === root.id,
      );
      if (children.length > 0) {
        dto.children = this.buildHierarchy(children, allAccounts);
      }
      return dto;
    });
  }

  /**
   * Calculate maximum depth of hierarchy tree
   */
  private calculateMaxDepth(
    accounts: ChartOfAccountResponseDto[],
    currentDepth: number = 1,
  ): number {
    if (!accounts || accounts.length === 0) {
      return currentDepth - 1;
    }

    let maxDepth = currentDepth;

    for (const account of accounts) {
      if (account.children && account.children.length > 0) {
        const childDepth = this.calculateMaxDepth(
          account.children,
          currentDepth + 1,
        );
        maxDepth = Math.max(maxDepth, childDepth);
      }
    }

    return maxDepth;
  }

  /**
   * Check if targetId is a descendant of ancestorId
   */
  private async isDescendantOf(
    targetId: string,
    ancestorId: string,
  ): Promise<boolean> {
    const target = await this.accountRepository.findOne({
      where: { id: targetId },
      relations: { parent: true },
    });

    if (!target || !target.parentId) {
      return false;
    }

    if (target.parentId === ancestorId) {
      return true;
    }

    return this.isDescendantOf(target.parentId, ancestorId);
  }
}
