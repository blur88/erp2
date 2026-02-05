import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
  QueryChartOfAccountsDto,
  ChartOfAccountResponseDto,
  ChartOfAccountListResponseDto,
  ChartOfAccountHierarchyDto,
} from '../dto/chart-of-account.dto';

@Injectable()
export class ChartOfAccountsService {
  private readonly logger = new Logger(ChartOfAccountsService.name);

  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
  ) {}

  /**
   * Create a new chart of account
   */
  async create(
    createDto: CreateChartOfAccountDto,
    userId: string = 'system',
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
      page = 1,
      limit = 20,
      search,
      type,
      isActive,
      parentId,
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
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [accounts, total] = await queryBuilder.getManyAndCount();

    const data = accounts.map((account) => this.toResponseDto(account));

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
   * Find one account by ID
   */
  async findOne(id: string): Promise<ChartOfAccountResponseDto> {
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['parent', 'children'],
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
    userId: string = 'system',
  ): Promise<ChartOfAccountResponseDto> {
    this.logger.log(`Updating account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['parent', 'children'],
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
      relations: ['parent', 'children'],
    });

    this.logger.log(`Account updated successfully: ${id}`);
    return this.toResponseDto(accountWithRelations!);
  }

  /**
   * Soft delete an account
   */
  async remove(id: string, userId: string = 'system'): Promise<void> {
    this.logger.log(`Deleting account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['children'],
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

    this.logger.log(`Account soft-deleted successfully: ${id}`);
  }

  /**
   * Restore a soft-deleted account
   */
  async restore(id: string, userId: string = 'system'): Promise<ChartOfAccountResponseDto> {
    this.logger.log(`Restoring account with ID: ${id}`);

    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['parent'],
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
      relations: ['parent', 'children'],
    });

    this.logger.log(`Account restored successfully: ${id}`);
    return this.toResponseDto(restoredAccount!);
  }

  /**
   * Get full account hierarchy as a tree structure
   */
  async getAccountHierarchy(): Promise<ChartOfAccountHierarchyDto> {
    this.logger.log('Fetching account hierarchy');

    // Get all accounts
    const accounts = await this.accountRepository.find({
      where: { isActive: true },
      relations: ['parent', 'children'],
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
      relations: ['parent'],
      order: { code: 'ASC' },
    });

    return children.map((child) => this.toResponseDto(child));
  }

  /**
   * Seed default chart of accounts
   * Creates 20+ accounts covering all account types
   */
  async seedDefaultChartOfAccounts(): Promise<void> {
    this.logger.log('Seeding default chart of accounts');

    // Check if accounts already exist
    const existingCount = await this.accountRepository.count();
    if (existingCount > 0) {
      this.logger.warn('Chart of accounts already seeded, skipping');
      return;
    }

    const defaultAccounts: CreateChartOfAccountDto[] = [
      // ASSET Accounts (1000-1999)
      { code: '1000', name: 'Cash', type: AccountType.ASSET },
      { code: '1010', name: 'Petty Cash', type: AccountType.ASSET },
      { code: '1100', name: 'Bank Account', type: AccountType.ASSET },
      { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET },
      { code: '1300', name: 'Inventory', type: AccountType.ASSET },
      { code: '1400', name: 'Prepaid Expenses', type: AccountType.ASSET },
      { code: '1500', name: 'Fixed Assets', type: AccountType.ASSET },
      { code: '1510', name: 'Equipment', type: AccountType.ASSET },
      { code: '1520', name: 'Furniture & Fixtures', type: AccountType.ASSET },
      { code: '1600', name: 'Accumulated Depreciation', type: AccountType.ASSET },

      // LIABILITY Accounts (2000-2999)
      { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY },
      { code: '2100', name: 'Credit Cards Payable', type: AccountType.LIABILITY },
      { code: '2200', name: 'Sales Tax Payable', type: AccountType.LIABILITY },
      { code: '2300', name: 'Accrued Expenses', type: AccountType.LIABILITY },
      { code: '2400', name: 'Short-term Loans', type: AccountType.LIABILITY },
      { code: '2500', name: 'Long-term Loans', type: AccountType.LIABILITY },

      // EQUITY Accounts (3000-3999)
      { code: '3000', name: "Owner's Equity", type: AccountType.EQUITY },
      { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY },
      { code: '3200', name: 'Dividends', type: AccountType.EQUITY },

      // REVENUE Accounts (4000-4999)
      { code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE },
      { code: '4100', name: 'Service Revenue', type: AccountType.REVENUE },
      { code: '4200', name: 'Other Income', type: AccountType.REVENUE },
      { code: '4300', name: 'Interest Income', type: AccountType.REVENUE },

      // EXPENSE Accounts (5000-5999)
      { code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE },
      { code: '5100', name: 'Salaries & Wages', type: AccountType.EXPENSE },
      { code: '5200', name: 'Rent Expense', type: AccountType.EXPENSE },
      { code: '5300', name: 'Utilities Expense', type: AccountType.EXPENSE },
      { code: '5400', name: 'Office Supplies', type: AccountType.EXPENSE },
      { code: '5500', name: 'Insurance Expense', type: AccountType.EXPENSE },
      { code: '5600', name: 'Advertising & Marketing', type: AccountType.EXPENSE },
      { code: '5700', name: 'Professional Fees', type: AccountType.EXPENSE },
      { code: '5800', name: 'Depreciation Expense', type: AccountType.EXPENSE },
      { code: '5900', name: 'Interest Expense', type: AccountType.EXPENSE },
      { code: '5950', name: 'Bank Charges', type: AccountType.EXPENSE },
    ];

    // Create all accounts
    for (const accountDto of defaultAccounts) {
      try {
        await this.create(accountDto, 'system');
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
      relations: ['parent'],
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
