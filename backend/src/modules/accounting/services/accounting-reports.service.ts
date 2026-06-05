import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
import {
  AccountingReportsQueryHelper,
} from './accounting-reports.query-helper';
import { AccountingExcelExportService } from './accounting-reports.excel-export.service';

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
 * Account balance entry for Balance Sheet
 */
export interface AccountBalance {
  accountCode: string;
  accountName: string;
  balance: number;
}

/**
 * Balance Sheet report response
 */
export interface BalanceSheetResponse {
  assets: {
    current: AccountBalance[];
    fixed: AccountBalance[];
    totalCurrent: number;
    totalFixed: number;
    total: number;
  };
  liabilities: {
    current: AccountBalance[];
    longTerm: AccountBalance[];
    totalCurrent: number;
    totalLongTerm: number;
    total: number;
  };
  equity: {
    accounts: AccountBalance[];
    netIncome: number;
    total: number;
  };
  isBalanced: boolean;
}

/**
 * Profit and Loss (Income Statement) report response
 */
export interface ProfitAndLossResponse {
  revenue: {
    accounts: AccountBalance[];
    total: number;
  };
  costOfGoodsSold: {
    accounts: AccountBalance[];
    total: number;
  };
  grossProfit: number;
  expenses: {
    accounts: AccountBalance[];
    total: number;
  };
  netIncome: number;
}

/**
 * General Ledger transaction entry
 */
export interface GeneralLedgerTransaction {
  date: Date;
  entryNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * General Ledger report response
 */
export interface GeneralLedgerResponse {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  openingBalance: number;
  transactions: GeneralLedgerTransaction[];
  closingBalance: number;
}

/**
 * Account Activity transaction entry (enhanced version of General Ledger)
 */
export interface AccountActivityTransaction {
  date: Date;
  entryNumber: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  status: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Account Activity report response
 */
export interface AccountActivityResponse {
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
  };
  openingBalance: number;
  activity: AccountActivityTransaction[];
  closingBalance: number;
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
    private readonly queryHelper: AccountingReportsQueryHelper,
    private readonly excelExportService: AccountingExcelExportService,
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
      .andWhere('je.status IN (:...statuses)', { statuses: [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED] })
      .getRawMany();

    // Extract totals (default to 0 if no transactions)
    const totalDebit = result.length > 0 && result[0].totalDebit
      ? parseFloat(result[0].totalDebit)
      : 0;
    const totalCredit = result.length > 0 && result[0].totalCredit
      ? parseFloat(result[0].totalCredit)
      : 0;

    // Calculate balance based on account type using proper accounting rules
    const balance = this.queryHelper.calculateBalanceByAccountType(
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
    const totalsMap = await this.queryHelper.queryTransactionTotals(
      accountIds,
      { type: 'asOf', date: asOfDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );

    // Build result map with calculated balances
    const balances: Record<string, number> = {};

    // Initialize all accounts with 0 balance
    accountIds.forEach(accountId => {
      balances[accountId] = 0;
    });

    // Update balances for accounts with transactions
    accountIds.forEach(accountId => {
      const accountType = accountTypeMap.get(accountId);

      if (!accountType) {
        this.logger.warn(`Account type not found for account ${accountId}, skipping`);
        return;
      }

      const { totalDebit, totalCredit } = totalsMap.get(accountId) || {
        totalDebit: 0,
        totalCredit: 0,
      };

      balances[accountId] = this.queryHelper.calculateBalanceByAccountType(
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
   * @throws BadRequestException if asOfDate is in the future
   */
  async generateTrialBalance(
    asOfDate: Date = new Date(),
    includeInactive: boolean = false,
  ): Promise<TrialBalanceResponse> {
    // Validate date is not in future
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Allow today
    if (asOfDate > now) {
      throw new BadRequestException('Trial Balance cannot be generated for future dates');
    }

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
    const totalsMap = await this.queryHelper.queryTransactionTotals(
      accountIds,
      { type: 'asOf', date: asOfDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );

    // Build trial balance accounts array
    let grandTotalDebit = 0;
    let grandTotalCredit = 0;

    const trialBalanceAccounts: TrialBalanceAccount[] = accounts.map(account => {
      const transactions = totalsMap.get(account.id) || {
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
        debit = this.queryHelper.roundTo2Decimals(netDebit);
        grandTotalDebit += debit;
      } else if (netCredit > 0) {
        credit = this.queryHelper.roundTo2Decimals(netCredit);
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
    grandTotalDebit = this.queryHelper.roundTo2Decimals(grandTotalDebit);
    grandTotalCredit = this.queryHelper.roundTo2Decimals(grandTotalCredit);

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
   * Generate Balance Sheet report
   * Lists assets, liabilities, and equity as of a specific date
   *
   * Balance Sheet follows the fundamental accounting equation:
   * Assets = Liabilities + Equity
   *
   * Account Classification by Code Ranges:
   * - Current Assets: 1000-1499 (Cash, AR, Inventory)
   * - Fixed Assets: 1500-1999 (Equipment, Buildings, Land)
   * - Current Liabilities: 2000-2499 (AP, Short-term Debt)
   * - Long-term Liabilities: 2500-2999 (Long-term Debt, Bonds)
   * - Equity: 3000-3999 (Common Stock, Retained Earnings)
   *
   * @param asOfDate - Calculate balance sheet as of this date (default: current date)
   * @param includeInactive - Include inactive accounts in the report (default: false)
   * @returns Balance sheet with assets, liabilities, equity, and validation
   * @throws BadRequestException if asOfDate is in the future
   */
  async generateBalanceSheet(
    asOfDate: Date = new Date(),
    includeInactive: boolean = false,
  ): Promise<BalanceSheetResponse> {
    // Validate date is not in future
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Allow today
    if (asOfDate > now) {
      throw new BadRequestException('Balance Sheet cannot be generated for future dates');
    }

    this.logger.log(
      `Generating balance sheet as of ${asOfDate.toISOString()}, includeInactive=${includeInactive}`,
    );

    // Fetch all accounts for balance sheet (ASSET, LIABILITY, EQUITY only)
    const queryBuilder = this.accountRepository.createQueryBuilder('account');

    queryBuilder.where('account.type IN (:...types)', {
      types: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY],
    });

    if (!includeInactive) {
      queryBuilder.andWhere('account.isActive = :isActive', { isActive: true });
    }

    const accounts = await queryBuilder
      .orderBy('account.code', 'ASC')
      .getMany();

    if (accounts.length === 0) {
      this.logger.warn('No accounts found for balance sheet');
      return this.createEmptyBalanceSheet();
    }

    // Get account IDs for batch query
    const accountIds = accounts.map(account => account.id);

    // Query journal entry lines for all accounts in a single batch query
    const totalsMap = await this.queryHelper.queryTransactionTotals(
      accountIds,
      { type: 'asOf', date: asOfDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );

    // Initialize balance sheet sections
    const currentAssets: AccountBalance[] = [];
    const fixedAssets: AccountBalance[] = [];
    const currentLiabilities: AccountBalance[] = [];
    const longTermLiabilities: AccountBalance[] = [];
    const equityAccounts: AccountBalance[] = [];

    // Process each account and classify by type and code
    accounts.forEach(account => {
      const transactions = totalsMap.get(account.id) || {
        totalDebit: 0,
        totalCredit: 0,
      };

      const balance = this.queryHelper.calculateBalanceByAccountType(
        account.type,
        transactions.totalDebit,
        transactions.totalCredit,
      );

      const accountBalance: AccountBalance = {
        accountCode: account.code,
        accountName: account.name,
        balance,
      };

      // Classify by account type and code range
      if (account.type === AccountType.ASSET) {
        const codeNum = parseInt(account.code, 10);
        if (codeNum >= 1000 && codeNum < 1500) {
          // Current Assets: 1000-1499
          currentAssets.push(accountBalance);
        } else if (codeNum >= 1500 && codeNum < 2000) {
          // Fixed Assets: 1500-1999
          fixedAssets.push(accountBalance);
        } else {
          // Default to current assets if code doesn't match pattern
          currentAssets.push(accountBalance);
        }
      } else if (account.type === AccountType.LIABILITY) {
        const codeNum = parseInt(account.code, 10);
        if (codeNum >= 2000 && codeNum < 2500) {
          // Current Liabilities: 2000-2499
          currentLiabilities.push(accountBalance);
        } else if (codeNum >= 2500 && codeNum < 3000) {
          // Long-term Liabilities: 2500-2999
          longTermLiabilities.push(accountBalance);
        } else {
          // Default to current liabilities if code doesn't match pattern
          currentLiabilities.push(accountBalance);
        }
      } else if (account.type === AccountType.EQUITY) {
        // All equity accounts (3000-3999)
        equityAccounts.push(accountBalance);
      }
    });

    // Calculate section totals
    const totalCurrentAssets = this.queryHelper.roundTo2Decimals(
      currentAssets.reduce((sum, acc) => sum + acc.balance, 0),
    );
    const totalFixedAssets = this.queryHelper.roundTo2Decimals(
      fixedAssets.reduce((sum, acc) => sum + acc.balance, 0),
    );
    const totalAssets = this.queryHelper.roundTo2Decimals(
      totalCurrentAssets + totalFixedAssets,
    );

    const totalCurrentLiabilities = this.queryHelper.roundTo2Decimals(
      currentLiabilities.reduce((sum, acc) => sum + acc.balance, 0),
    );
    const totalLongTermLiabilities = this.queryHelper.roundTo2Decimals(
      longTermLiabilities.reduce((sum, acc) => sum + acc.balance, 0),
    );
    const totalLiabilities = this.queryHelper.roundTo2Decimals(
      totalCurrentLiabilities + totalLongTermLiabilities,
    );

    const equityAccountsTotal = this.queryHelper.roundTo2Decimals(
      equityAccounts.reduce((sum, acc) => sum + acc.balance, 0),
    );
    const netIncome = await this.calculateNetIncome(asOfDate, includeInactive);

    this.logger.log(`Net income calculated: ${netIncome}`);

    const totalEquity = this.queryHelper.roundTo2Decimals(
      equityAccountsTotal + netIncome,
    );

    // Validate balance sheet equation: Assets = Liabilities + Equity (including net income)
    const totalLiabilitiesAndEquity = this.queryHelper.roundTo2Decimals(
      totalLiabilities + totalEquity,
    );
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

    this.logger.log(
      `Balance sheet generated: Assets=${totalAssets}, ` +
      `Liabilities=${totalLiabilities}, Equity=${totalEquity} ` +
      `(Accounts=${equityAccountsTotal}, Net Income=${netIncome}), ` +
      `Balanced=${isBalanced}`,
    );

    if (!isBalanced) {
      this.logger.warn(
        `Balance sheet is UNBALANCED! ` +
        `Assets (${totalAssets}) != Liabilities + Equity (${totalLiabilitiesAndEquity})`,
      );
    }

    return {
      assets: {
        current: currentAssets,
        fixed: fixedAssets,
        totalCurrent: totalCurrentAssets,
        totalFixed: totalFixedAssets,
        total: totalAssets,
      },
      liabilities: {
        current: currentLiabilities,
        longTerm: longTermLiabilities,
        totalCurrent: totalCurrentLiabilities,
        totalLongTerm: totalLongTermLiabilities,
        total: totalLiabilities,
      },
      equity: {
        accounts: equityAccounts,
        netIncome,
        total: totalEquity,
      },
      isBalanced,
    };
  }

  /**
   * Generate General Ledger report for a specific account
   * Shows all transactions for an account over a period with running balance
   *
   * General Ledger is the most detailed transaction report, listing every
   * journal entry line for a specific account with a running balance after
   * each transaction.
   *
   * Running Balance Calculation:
   * - For ASSET and EXPENSE accounts: balance increases with debit, decreases with credit
   * - For LIABILITY, EQUITY, and REVENUE accounts: balance increases with credit, decreases with debit
   *
   * @param accountId - The account ID to generate ledger for
   * @param startDate - Start date of the period (inclusive)
   * @param endDate - End date of the period (inclusive)
   * @returns General Ledger with opening balance, transactions, and closing balance
   * @throws NotFoundException if account does not exist
   * @throws BadRequestException if date range is invalid or endDate is in the future
   */
  async generateGeneralLedger(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<GeneralLedgerResponse> {
    // Validate date range
    if (startDate > endDate) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    // Validate end date is not in future
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Allow today
    if (endDate > now) {
      throw new BadRequestException('End date cannot be in the future');
    }

    this.logger.log(
      `Generating general ledger for account ${accountId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    // Fetch the account to determine its type and validate existence
    const account = await this.accountRepository.findOne({
      where: { id: accountId, isActive: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${accountId}' not found or inactive`);
    }

    // Calculate opening balance (balance before startDate)
    const openingTotalsMap = await this.queryHelper.queryTransactionTotals(
      [accountId],
      { type: 'before', date: startDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );
    const { totalDebit: openingDebit, totalCredit: openingCredit } =
      openingTotalsMap.get(accountId) || { totalDebit: 0, totalCredit: 0 };

    const openingBalance = this.queryHelper.calculateBalanceByAccountType(
      account.type,
      openingDebit,
      openingCredit,
    );

    this.logger.log(`Opening balance for account ${account.code}: ${openingBalance}`);

    // Query all transactions for the account within the date range
    const transactionData = await this.journalEntryLineRepository
      .createQueryBuilder('jel')
      .leftJoin('jel.journalEntry', 'je')
      .select('je.entryDate', 'entryDate')
      .addSelect('je.referenceNumber', 'referenceNumber')
      .addSelect('je.description', 'description')
      .addSelect('jel.debitAmount', 'debitAmount')
      .addSelect('jel.creditAmount', 'creditAmount')
      .where('jel.accountId = :accountId', { accountId })
      .andWhere('je.entryDate >= :startDate', { startDate })
      .andWhere('je.entryDate <= :endDate', { endDate })
      .andWhere('je.status IN (:...statuses)', { statuses: [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED] })
      .orderBy('je.entryDate', 'ASC')
      .addOrderBy('je.referenceNumber', 'ASC')
      .getRawMany();

    // Build transactions array with running balance
    let runningBalance = openingBalance;
    const transactions: GeneralLedgerTransaction[] = transactionData.map(row => {
      const debit = parseFloat(row.debitAmount || '0');
      const credit = parseFloat(row.creditAmount || '0');

      // Calculate running balance based on account type
      if (
        account.type === AccountType.ASSET ||
        account.type === AccountType.EXPENSE
      ) {
        // For ASSET and EXPENSE: balance increases with debit, decreases with credit
        runningBalance += debit - credit;
      } else {
        // For LIABILITY, EQUITY, and REVENUE: balance increases with credit, decreases with debit
        runningBalance += credit - debit;
      }

      runningBalance = this.queryHelper.roundTo2Decimals(runningBalance);

      return {
        date: row.entryDate,
        entryNumber: row.referenceNumber,
        description: row.description,
        debit: this.queryHelper.roundTo2Decimals(debit),
        credit: this.queryHelper.roundTo2Decimals(credit),
        balance: runningBalance,
      };
    });

    // Closing balance should match final running balance
    const closingBalance = transactions.length > 0
      ? transactions[transactions.length - 1].balance
      : openingBalance;

    this.logger.log(
      `General ledger generated for account ${account.code}: ` +
      `Opening=${openingBalance}, Transactions=${transactions.length}, Closing=${closingBalance}`,
    );

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
      },
      openingBalance: this.queryHelper.roundTo2Decimals(openingBalance),
      transactions,
      closingBalance: this.queryHelper.roundTo2Decimals(closingBalance),
    };
  }

  /**
   * Generate Account Activity report for a specific account
   * Enhanced version of General Ledger with status, reference links, and drill-down capability
   *
   * Key Differences from General Ledger:
   * - Includes ALL entry statuses (DRAFT, POSTED, REVERSED) by default - not just POSTED
   * - Shows status on each transaction line
   * - Includes reference metadata (referenceType, referenceId) for drill-down links
   * - Supports optional status filtering
   * - Opening balance ONLY includes POSTED entries for accuracy
   * - Running balance includes ALL statuses to show potential future state
   *
   * @param accountId - The account ID to generate activity for
   * @param startDate - Start date of the period (inclusive)
   * @param endDate - End date of the period (inclusive)
   * @param statusFilter - Optional filter by entry status (DRAFT, POSTED, REVERSED)
   * @returns Account Activity with opening balance, transactions, and closing balance
   * @throws NotFoundException if account does not exist
   * @throws BadRequestException if date range is invalid or endDate is in the future
   */
  async generateAccountActivity(
    accountId: string,
    startDate: Date,
    endDate: Date,
    statusFilter?: JournalEntryStatus,
  ): Promise<AccountActivityResponse> {
    // Validate date range
    if (startDate > endDate) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    // Validate end date is not in future
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Allow today
    if (endDate > now) {
      throw new BadRequestException('End date cannot be in the future');
    }

    this.logger.log(
      `Generating account activity for account ${accountId} from ${startDate.toISOString()} to ${endDate.toISOString()}` +
      (statusFilter ? `, status filter: ${statusFilter}` : ''),
    );

    // Fetch the account to determine its type and validate existence
    const account = await this.accountRepository.findOne({
      where: { id: accountId, isActive: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID '${accountId}' not found or inactive`);
    }

    // Calculate opening balance (balance before startDate)
    // IMPORTANT: Opening balance only includes POSTED entries for accuracy
    const openingTotalsMap = await this.queryHelper.queryTransactionTotals(
      [accountId],
      { type: 'before', date: startDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );
    const { totalDebit: openingDebit, totalCredit: openingCredit } =
      openingTotalsMap.get(accountId) || { totalDebit: 0, totalCredit: 0 };

    const openingBalance = this.queryHelper.calculateBalanceByAccountType(
      account.type,
      openingDebit,
      openingCredit,
    );

    this.logger.log(`Opening balance for account ${account.code}: ${openingBalance}`);

    // Query all transactions for the account within the date range
    // KEY DIFFERENCE: Include ALL statuses (DRAFT, POSTED, REVERSED), not just POSTED
    const queryBuilder = this.journalEntryLineRepository
      .createQueryBuilder('jel')
      .leftJoin('jel.journalEntry', 'je')
      .select('je.entryDate', 'entryDate')
      .addSelect('je.referenceNumber', 'referenceNumber')
      .addSelect('je.description', 'description')
      .addSelect('je.status', 'status') // Include status
      .addSelect('je.sourceType', 'sourceType') // Include reference type
      .addSelect('je.sourceId', 'sourceId') // Include reference ID
      .addSelect('jel.debitAmount', 'debitAmount')
      .addSelect('jel.creditAmount', 'creditAmount')
      .where('jel.accountId = :accountId', { accountId })
      .andWhere('je.entryDate >= :startDate', { startDate })
      .andWhere('je.entryDate <= :endDate', { endDate });

    // Apply optional status filter
    if (statusFilter) {
      queryBuilder.andWhere('je.status = :statusFilter', { statusFilter });
    }

    const transactionData = await queryBuilder
      .orderBy('je.entryDate', 'ASC')
      .addOrderBy('je.referenceNumber', 'ASC')
      .getRawMany();

    // Build activity array with running balance
    let runningBalance = openingBalance;
    const activity: AccountActivityTransaction[] = transactionData.map(row => {
      const debit = parseFloat(row.debitAmount || '0');
      const credit = parseFloat(row.creditAmount || '0');

      // Calculate running balance based on account type
      if (
        account.type === AccountType.ASSET ||
        account.type === AccountType.EXPENSE
      ) {
        // For ASSET and EXPENSE: balance increases with debit, decreases with credit
        runningBalance += debit - credit;
      } else {
        // For LIABILITY, EQUITY, and REVENUE: balance increases with credit, decreases with debit
        runningBalance += credit - debit;
      }

      runningBalance = this.queryHelper.roundTo2Decimals(runningBalance);

      return {
        date: row.entryDate,
        entryNumber: row.referenceNumber,
        description: row.description,
        referenceType: row.sourceType || undefined, // Include reference metadata
        referenceId: row.sourceId || undefined, // Include reference metadata
        status: row.status, // Include status for filtering in frontend
        debit: this.queryHelper.roundTo2Decimals(debit),
        credit: this.queryHelper.roundTo2Decimals(credit),
        balance: runningBalance,
      };
    });

    // Closing balance should match final running balance
    const closingBalance = activity.length > 0
      ? activity[activity.length - 1].balance
      : openingBalance;

    this.logger.log(
      `Account activity generated for account ${account.code}: ` +
      `Opening=${openingBalance}, Transactions=${activity.length}, Closing=${closingBalance}`,
    );

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
      },
      openingBalance: this.queryHelper.roundTo2Decimals(openingBalance),
      activity,
      closingBalance: this.queryHelper.roundTo2Decimals(closingBalance),
    };
  }

  private async calculateNetIncome(
    asOfDate: Date,
    includeInactive: boolean,
  ): Promise<number> {
    const incomeQueryBuilder = this.accountRepository.createQueryBuilder('account');
    incomeQueryBuilder.where('account.type IN (:...types)', {
      types: [AccountType.REVENUE, AccountType.EXPENSE],
    });

    if (!includeInactive) {
      incomeQueryBuilder.andWhere('account.isActive = :isActive', {
        isActive: true,
      });
    }

    const incomeAccounts = await incomeQueryBuilder
      .orderBy('account.code', 'ASC')
      .getMany();

    if (incomeAccounts.length === 0) {
      return 0;
    }

    const incomeAccountIds = incomeAccounts.map(account => account.id);
    const totalsMap = await this.queryHelper.queryTransactionTotals(
      incomeAccountIds,
      { type: 'asOf', date: asOfDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );

    let totalRevenue = 0;
    let totalExpenses = 0;

    incomeAccounts.forEach(account => {
      const { totalDebit, totalCredit } = totalsMap.get(account.id) || {
        totalDebit: 0,
        totalCredit: 0,
      };
      const balance = this.queryHelper.calculateBalanceByAccountType(
        account.type,
        totalDebit,
        totalCredit,
      );

      if (account.type === AccountType.REVENUE) {
        totalRevenue += balance;
      } else {
        totalExpenses += balance;
      }
    });

    return this.queryHelper.roundTo2Decimals(totalRevenue - totalExpenses);
  }

  /**
   * Generate Profit and Loss (Income Statement) report
   * Shows revenues, costs, and expenses over a period of time
   *
   * P&L Structure:
   * - Revenue (credit balances shown as positive)
   * - Cost of Goods Sold (COGS) - accounts 5000-5999 (debit balances shown as positive)
   * - Gross Profit = Revenue - COGS
   * - Operating Expenses - accounts 6000+ (debit balances shown as positive)
   * - Net Income = Gross Profit - Expenses
   *
   * Account Code Ranges:
   * - Revenue: 4000-4999 (AccountType.REVENUE)
   * - COGS: 5000-5999 (AccountType.EXPENSE)
   * - Operating Expenses: 6000+ (AccountType.EXPENSE)
   *
   * @param startDate - Start date of the period (inclusive)
   * @param endDate - End date of the period (inclusive)
   * @param includeInactive - Include inactive accounts in the report (default: false)
   * @returns Profit and Loss report with revenue, COGS, expenses, and net income
   * @throws BadRequestException if date range is invalid or endDate is in the future
   */
  async generateProfitAndLoss(
    startDate: Date,
    endDate: Date,
    includeInactive: boolean = false,
  ): Promise<ProfitAndLossResponse> {
    // Validate date range
    if (startDate > endDate) {
      throw new BadRequestException('Start date must be before or equal to end date');
    }

    // Validate end date is not in future
    const now = new Date();
    now.setHours(23, 59, 59, 999); // Allow today
    if (endDate > now) {
      throw new BadRequestException('End date cannot be in the future');
    }

    this.logger.log(
      `Generating P&L from ${startDate.toISOString()} to ${endDate.toISOString()}, includeInactive=${includeInactive}`,
    );

    // Fetch all income statement accounts (REVENUE and EXPENSE only)
    const queryBuilder = this.accountRepository.createQueryBuilder('account');

    queryBuilder.where('account.type IN (:...types)', {
      types: [AccountType.REVENUE, AccountType.EXPENSE],
    });

    if (!includeInactive) {
      queryBuilder.andWhere('account.isActive = :isActive', { isActive: true });
    }

    const accounts = await queryBuilder
      .orderBy('account.code', 'ASC')
      .getMany();

    if (accounts.length === 0) {
      this.logger.warn('No income statement accounts found for P&L');
      return this.createEmptyProfitAndLoss();
    }

    // Get account IDs for batch query
    const accountIds = accounts.map(account => account.id);

    // Query journal entry lines for the date range
    const totalsMap = await this.queryHelper.queryTransactionTotals(
      accountIds,
      { type: 'range', startDate, endDate },
      [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
    );

    // Initialize P&L sections
    const revenueAccounts: AccountBalance[] = [];
    const cogsAccounts: AccountBalance[] = [];
    const expenseAccounts: AccountBalance[] = [];

    // Process each account and classify by type and code
    accounts.forEach(account => {
      const transactions = totalsMap.get(account.id) || {
        totalDebit: 0,
        totalCredit: 0,
      };

      const balance = this.queryHelper.calculateBalanceByAccountType(
        account.type,
        transactions.totalDebit,
        transactions.totalCredit,
      );

      const accountBalance: AccountBalance = {
        accountCode: account.code,
        accountName: account.name,
        balance,
      };

      // Classify accounts
      if (account.type === AccountType.REVENUE) {
        // Revenue accounts (4000-4999)
        revenueAccounts.push(accountBalance);
      } else if (account.type === AccountType.EXPENSE) {
        const codeNum = parseInt(account.code, 10);
        if (codeNum >= 5000 && codeNum < 6000) {
          // COGS accounts (5000-5999)
          cogsAccounts.push(accountBalance);
        } else {
          // Operating Expenses (6000+)
          expenseAccounts.push(accountBalance);
        }
      }
    });

    // Calculate totals
    const totalRevenue = this.queryHelper.roundTo2Decimals(
      revenueAccounts.reduce((sum, acc) => sum + acc.balance, 0),
    );

    const totalCOGS = this.queryHelper.roundTo2Decimals(
      cogsAccounts.reduce((sum, acc) => sum + acc.balance, 0),
    );

    const grossProfit = this.queryHelper.roundTo2Decimals(totalRevenue - totalCOGS);

    const totalExpenses = this.queryHelper.roundTo2Decimals(
      expenseAccounts.reduce((sum, acc) => sum + acc.balance, 0),
    );

    const netIncome = this.queryHelper.roundTo2Decimals(grossProfit - totalExpenses);

    this.logger.log(
      `P&L generated: Revenue=${totalRevenue}, COGS=${totalCOGS}, ` +
      `Gross Profit=${grossProfit}, Expenses=${totalExpenses}, Net Income=${netIncome}`,
    );

    return {
      revenue: {
        accounts: revenueAccounts,
        total: totalRevenue,
      },
      costOfGoodsSold: {
        accounts: cogsAccounts,
        total: totalCOGS,
      },
      grossProfit,
      expenses: {
        accounts: expenseAccounts,
        total: totalExpenses,
      },
      netIncome,
    };
  }

  /**
   * Export Trial Balance to Excel
   *
   * @param data - Trial Balance report data
   * @param filename - Output filename (without extension)
   * @returns Excel file as Buffer
   */
  async exportTrialBalanceToExcel(
    data: TrialBalanceResponse,
    filename: string = 'trial-balance',
  ): Promise<Buffer> {
    return this.excelExportService.exportTrialBalanceToExcel(data, filename);
  }

  /**
   * Export Balance Sheet to Excel
   *
   * @param data - Balance Sheet report data
   * @param filename - Output filename (without extension)
   * @returns Excel file as Buffer
   */
  async exportBalanceSheetToExcel(
    data: BalanceSheetResponse,
    filename: string = 'balance-sheet',
  ): Promise<Buffer> {
    return this.excelExportService.exportBalanceSheetToExcel(data, filename);
  }

  /**
   * Export Profit and Loss (Income Statement) to Excel
   *
   * @param data - Profit and Loss report data
   * @param filename - Output filename (without extension)
   * @returns Excel file as Buffer
   */
  async exportProfitAndLossToExcel(
    data: ProfitAndLossResponse,
    filename: string = 'profit-and-loss',
  ): Promise<Buffer> {
    return this.excelExportService.exportProfitAndLossToExcel(data, filename);
  }

  /**
   * Export General Ledger to Excel
   *
   * @param data - General Ledger report data
   * @param filename - Output filename (without extension)
   * @returns Excel file as Buffer
   */
  async exportGeneralLedgerToExcel(
    data: GeneralLedgerResponse,
    filename: string = 'general-ledger',
  ): Promise<Buffer> {
    return this.excelExportService.exportGeneralLedgerToExcel(data, filename);
  }

  /**
   * Export Account Activity to Excel
   *
   * @param data - Account Activity report data
   * @param filename - Output filename (without extension)
   * @returns Excel file as Buffer
   */
  async exportAccountActivityToExcel(
    data: AccountActivityResponse,
    filename: string = 'account-activity',
  ): Promise<Buffer> {
    return this.excelExportService.exportAccountActivityToExcel(data, filename);
  }

  /**
   * Create empty profit and loss structure (for when no accounts exist)
   */
  private createEmptyProfitAndLoss(): ProfitAndLossResponse {
    return {
      revenue: {
        accounts: [],
        total: 0,
      },
      costOfGoodsSold: {
        accounts: [],
        total: 0,
      },
      grossProfit: 0,
      expenses: {
        accounts: [],
        total: 0,
      },
      netIncome: 0,
    };
  }

  /**
   * Create empty balance sheet structure (for when no accounts exist)
   */
  private createEmptyBalanceSheet(): BalanceSheetResponse {
    return {
      assets: {
        current: [],
        fixed: [],
        totalCurrent: 0,
        totalFixed: 0,
        total: 0,
      },
      liabilities: {
        current: [],
        longTerm: [],
        totalCurrent: 0,
        totalLongTerm: 0,
        total: 0,
      },
      equity: {
        accounts: [],
        netIncome: 0,
        total: 0,
      },
      isBalanced: true,
    };
  }

}
