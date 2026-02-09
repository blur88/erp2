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

/**
 * Interface for account with balance information
 */
export interface AccountWithBalance {
  account: ChartOfAccount;
  balance: number;
}

/**
 * Trial Balance account entry
 */
export interface TrialBalanceAccount {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
}

/**
 * Trial Balance report response
 */
export interface TrialBalanceResponse {
  accounts: TrialBalanceAccount[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
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
   * Generate Trial Balance report
   * Lists all accounts with their debit/credit balances as of a specific date
   *
   * Trial Balance follows double-entry bookkeeping rules:
   * - Total Debits must equal Total Credits in a balanced system
   * - Each account shows EITHER a debit OR credit balance, never both
   * - Unlike other reports, shows RAW debit/credit amounts, not signed balances
   *
   * @param asOfDate - Calculate trial balance as of this date (default: current date)
   * @param includeInactive - Include inactive accounts in the report (default: false)
   * @returns Trial balance with account details and totals
   */
  async generateTrialBalance(
    asOfDate: Date = new Date(),
    includeInactive: boolean = false,
  ): Promise<TrialBalanceResponse> {
    this.logger.log(
      `Generating trial balance as of ${asOfDate.toISOString()}, includeInactive=${includeInactive}`,
    );

    // Fetch all accounts (filtered by active status if needed)
    const queryBuilder = this.accountRepository.createQueryBuilder('account');

    if (!includeInactive) {
      queryBuilder.andWhere('account.isActive = :isActive', { isActive: true });
    }

    const accounts = await queryBuilder
      .orderBy('account.code', 'ASC')
      .getMany();

    if (accounts.length === 0) {
      this.logger.warn('No accounts found for trial balance');
      return {
        accounts: [],
        totalDebit: 0,
        totalCredit: 0,
        isBalanced: true,
      };
    }

    // Get account IDs for batch query
    const accountIds = accounts.map(account => account.id);

    // Query journal entry lines for all accounts in a single batch query
    const transactionData = await this.journalEntryLineRepository
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

    // Build a map of account ID to transaction totals
    const transactionMap = new Map<string, { totalDebit: number; totalCredit: number }>();
    transactionData.forEach(row => {
      transactionMap.set(row.accountId, {
        totalDebit: parseFloat(row.totalDebit || '0'),
        totalCredit: parseFloat(row.totalCredit || '0'),
      });
    });

    // Build trial balance accounts array
    let grandTotalDebit = 0;
    let grandTotalCredit = 0;

    const trialBalanceAccounts: TrialBalanceAccount[] = accounts.map(account => {
      const transactions = transactionMap.get(account.id) || {
        totalDebit: 0,
        totalCredit: 0,
      };

      // Calculate net debit or credit for this account
      const netDebit = transactions.totalDebit - transactions.totalCredit;
      const netCredit = transactions.totalCredit - transactions.totalDebit;

      // Determine which column to show (debit or credit, never both)
      let debit = 0;
      let credit = 0;

      if (netDebit > 0) {
        debit = this.roundTo2Decimals(netDebit);
        grandTotalDebit += debit;
      } else if (netCredit > 0) {
        credit = this.roundTo2Decimals(netCredit);
        grandTotalCredit += credit;
      }
      // If netDebit === netCredit (zero balance), both remain 0

      return {
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        debit,
        credit,
      };
    });

    // Round grand totals to 2 decimals
    grandTotalDebit = this.roundTo2Decimals(grandTotalDebit);
    grandTotalCredit = this.roundTo2Decimals(grandTotalCredit);

    // Check if trial balance is balanced (allow 0.01 tolerance for rounding)
    const isBalanced = Math.abs(grandTotalDebit - grandTotalCredit) < 0.01;

    this.logger.log(
      `Trial balance generated: ${trialBalanceAccounts.length} accounts, ` +
      `Total Debit=${grandTotalDebit}, Total Credit=${grandTotalCredit}, ` +
      `Balanced=${isBalanced}`,
    );

    return {
      accounts: trialBalanceAccounts,
      totalDebit: grandTotalDebit,
      totalCredit: grandTotalCredit,
      isBalanced,
    };
  }

  /**
   * Round number to 2 decimal places to avoid floating point precision issues
   */
  private roundTo2Decimals(num: number): number {
    return Math.round(num * 100) / 100;
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
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        // Debit increases, Credit decreases
        return this.roundTo2Decimals(totalDebit - totalCredit);

      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        // Credit increases, Debit decreases
        return this.roundTo2Decimals(totalCredit - totalDebit);

      default:
        this.logger.warn(`Unknown account type: ${accountType}, defaulting to Debit - Credit`);
        return this.roundTo2Decimals(totalDebit - totalCredit);
    }
  }
}
