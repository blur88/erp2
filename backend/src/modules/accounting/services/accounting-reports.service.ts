import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import {
  JournalEntry,
  JournalEntryStatus,
} from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { JournalEntryService } from './journal-entry.service';
import { FiscalPeriodService } from './fiscal-period.service';

/**
 * Interface for account with balance information
 */
export interface AccountWithBalance {
  account: ChartOfAccount;
  balance: number;
}

/**
 * Accounting Reports Service
 * Provides foundation for all financial reports with reusable calculation and filtering logic
 */
@Injectable()
export class AccountingReportsService {
  private readonly logger = new Logger(AccountingReportsService.name);

  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntry)
    private readonly journalEntryRepository: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly journalEntryService: JournalEntryService,
    private readonly fiscalPeriodService: FiscalPeriodService,
  ) {}

  /**
   * Calculate balance for a single account as of a specific date
   * Uses proper accounting rules based on account type
   *
   * @param accountId - Account ID to calculate balance for
   * @param asOfDate - Calculate balance as of this date (default: current date)
   * @returns Account balance
   * @throws NotFoundException if account does not exist
   */
  async calculateAccountBalance(
    accountId: string,
    asOfDate: Date = new Date(),
  ): Promise<number> {
    this.logger.log(`Calculating balance for account ${accountId} as of ${asOfDate.toISOString()}`);

    // Fetch the account to determine its type
    const account = await this.accountRepository.findOne({
      where: { id: accountId, isActive: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${accountId}' not found or inactive`);
    }

    // Query journal entry lines for this account up to the specified date
    // Only include POSTED journal entries
    const result = await this.journalEntryLineRepository
      .createQueryBuilder('jel')
      .leftJoin('jel.journalEntry', 'je')
      .select('SUM(jel.debitAmount)', 'totalDebit')
      .addSelect('SUM(jel.creditAmount)', 'totalCredit')
      .where('jel.accountId = :accountId', { accountId })
      .andWhere('je.entryDate <= :asOfDate', { asOfDate })
      .andWhere('je.status = :status', { status: JournalEntryStatus.POSTED })
      .getRawMany();

    // Extract totals (default to 0 if no transactions)
    const totalDebit = result.length > 0 && result[0].totalDebit
      ? parseFloat(result[0].totalDebit)
      : 0;
    const totalCredit = result.length > 0 && result[0].totalCredit
      ? parseFloat(result[0].totalCredit)
      : 0;

    // Calculate balance based on account type using proper accounting rules
    const balance = this.calculateBalanceByAccountType(
      account.type,
      totalDebit,
      totalCredit,
    );

    this.logger.log(
      `Account ${account.code} (${account.type}): Debit=${totalDebit}, Credit=${totalCredit}, Balance=${balance}`,
    );

    return balance;
  }

  /**
   * Calculate balances for multiple accounts in a single query (batch operation)
   * More efficient than calling calculateAccountBalance multiple times
   *
   * @param accountIds - Array of account IDs
   * @param asOfDate - Calculate balances as of this date (default: current date)
   * @returns Object mapping account ID to balance
   */
  async calculateAccountBalances(
    accountIds: string[],
    asOfDate: Date = new Date(),
  ): Promise<Record<string, number>> {
    if (!accountIds || accountIds.length === 0) {
      return {};
    }

    this.logger.log(`Calculating balances for ${accountIds.length} accounts as of ${asOfDate.toISOString()}`);

    // Fetch all accounts to determine their types
    const accounts = await this.accountRepository.find({
      where: { id: In(accountIds), isActive: true },
    });

    // Create a map of account ID to account type for quick lookup
    const accountTypeMap = new Map<string, AccountType>();
    accounts.forEach(account => {
      accountTypeMap.set(account.id, account.type);
    });

    // Query journal entry lines for all accounts in a single query
    const results = await this.journalEntryLineRepository
      .createQueryBuilder('jel')
      .leftJoin('jel.journalEntry', 'je')
      .select('jel.accountId', 'accountId')
      .addSelect('SUM(jel.debitAmount)', 'totalDebit')
      .addSelect('SUM(jel.creditAmount)', 'totalCredit')
      .where('jel.accountId IN (:...accountIds)', { accountIds })
      .andWhere('je.entryDate <= :asOfDate', { asOfDate })
      .andWhere('je.status = :status', { status: JournalEntryStatus.POSTED })
      .groupBy('jel.accountId')
      .getRawMany();

    // Build result map with calculated balances
    const balances: Record<string, number> = {};

    // Initialize all accounts with 0 balance
    accountIds.forEach(accountId => {
      balances[accountId] = 0;
    });

    // Update balances for accounts with transactions
    results.forEach(result => {
      const accountId = result.accountId;
      const accountType = accountTypeMap.get(accountId);

      if (!accountType) {
        this.logger.warn(`Account type not found for account ${accountId}, skipping`);
        return;
      }

      const totalDebit = parseFloat(result.totalDebit || '0');
      const totalCredit = parseFloat(result.totalCredit || '0');

      balances[accountId] = this.calculateBalanceByAccountType(
        accountType,
        totalDebit,
        totalCredit,
      );
    });

    this.logger.log(`Calculated balances for ${Object.keys(balances).length} accounts`);

    return balances;
  }

  /**
   * Get all accounts filtered by type(s)
   *
   * @param accountTypes - Array of account types to filter by
   * @returns Array of accounts matching the specified types
   */
  async getAccountsByType(accountTypes: AccountType[]): Promise<ChartOfAccount[]> {
    if (!accountTypes || accountTypes.length === 0) {
      return [];
    }

    this.logger.log(`Fetching accounts by types: ${accountTypes.join(', ')}`);

    // If single type, use simple find
    if (accountTypes.length === 1) {
      return this.accountRepository.find({
        where: { type: accountTypes[0], isActive: true },
        order: { code: 'ASC' },
      });
    }

    // For multiple types, use query builder with IN clause
    const accounts = await this.accountRepository
      .createQueryBuilder('account')
      .where('account.type IN (:...types)', { types: accountTypes })
      .andWhere('account.isActive = :isActive', { isActive: true })
      .orderBy('account.code', 'ASC')
      .getMany();

    this.logger.log(`Found ${accounts.length} accounts matching types`);

    return accounts;
  }

  /**
   * Get accounts with their calculated balances
   * Combines filtering by type and balance calculation
   *
   * @param accountTypes - Array of account types to filter by
   * @param asOfDate - Calculate balances as of this date (default: current date)
   * @returns Array of accounts with their balances
   */
  async getAccountsWithBalances(
    accountTypes: AccountType[],
    asOfDate: Date = new Date(),
  ): Promise<AccountWithBalance[]> {
    this.logger.log(`Fetching accounts with balances for types: ${accountTypes.join(', ')}`);

    // Get accounts matching the specified types
    const accounts = await this.getAccountsByType(accountTypes);

    if (accounts.length === 0) {
      return [];
    }

    // Get account IDs
    const accountIds = accounts.map(account => account.id);

    // Calculate balances for all accounts in batch
    const balances = await this.calculateAccountBalances(accountIds, asOfDate);

    // Combine accounts with their balances
    const accountsWithBalances: AccountWithBalance[] = accounts.map(account => ({
      account,
      balance: balances[account.id] || 0,
    }));

    this.logger.log(`Returning ${accountsWithBalances.length} accounts with balances`);

    return accountsWithBalances;
  }

  /**
   * Calculate balance based on account type using proper accounting rules
   *
   * Assets & Expenses: Debit increases, Credit decreases (Balance = Debit - Credit)
   * Liabilities, Equity & Revenue: Credit increases, Debit decreases (Balance = Credit - Debit)
   *
   * @param accountType - Type of account
   * @param totalDebit - Total debit amount
   * @param totalCredit - Total credit amount
   * @returns Calculated balance
   */
  private calculateBalanceByAccountType(
    accountType: AccountType,
    totalDebit: number,
    totalCredit: number,
  ): number {
    // Round to 2 decimal places to avoid floating point precision issues
    const roundTo2Decimals = (num: number): number => Math.round(num * 100) / 100;

    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        // Debit increases, Credit decreases
        return roundTo2Decimals(totalDebit - totalCredit);

      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        // Credit increases, Debit decreases
        return roundTo2Decimals(totalCredit - totalDebit);

      default:
        this.logger.warn(`Unknown account type: ${accountType}, defaulting to Debit - Credit`);
        return roundTo2Decimals(totalDebit - totalCredit);
    }
  }
}
