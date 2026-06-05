import { AccountType } from "../../../../database/entities/chart-of-account.entity";

export const ACCOUNT_IDS = {
  cash: "123e4567-e89b-12d3-a456-426614174000",
  ap: "223e4567-e89b-12d3-a456-426614174001",
  revenue: "423e4567-e89b-12d3-a456-426614174003",
};

export const CASH_ACCOUNT = {
  id: ACCOUNT_IDS.cash,
  code: "1000",
  name: "Cash",
  type: AccountType.ASSET,
  isActive: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export const AP_ACCOUNT = {
  id: ACCOUNT_IDS.ap,
  code: "2000",
  name: "Accounts Payable",
  type: AccountType.LIABILITY,
  isActive: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export const REVENUE_ACCOUNT = {
  id: ACCOUNT_IDS.revenue,
  code: "4000",
  name: "Sales Revenue",
  type: AccountType.REVENUE,
  isActive: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

export function createMockQueryBuilder() {
  return {
    createQueryBuilder: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };
}

export function createMockRepositories(
  qb: ReturnType<typeof createMockQueryBuilder>,
) {
  const makeRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  });

  return {
    accountRepo: makeRepo(),
    journalRepo: makeRepo(),
    lineRepo: makeRepo(),
  };
}

export function createMockQueryHelper() {
  const roundTo2Decimals = (n: number) => Math.round(n * 100) / 100;

  return {
    queryTransactionTotals: jest.fn().mockResolvedValue(new Map()),
    calculateBalanceByAccountType: jest.fn(
      (type: AccountType, debit: number, credit: number) => {
        if (type === AccountType.ASSET || type === AccountType.EXPENSE) {
          return roundTo2Decimals(debit - credit);
        }

        return roundTo2Decimals(credit - debit);
      },
    ),
    roundTo2Decimals: jest.fn(roundTo2Decimals),
  };
}

export function createMockExcelExportService() {
  return {
    exportTrialBalanceToExcel: jest
      .fn()
      .mockResolvedValue(Buffer.from("trial-balance")),
    exportBalanceSheetToExcel: jest
      .fn()
      .mockResolvedValue(Buffer.from("balance-sheet")),
    exportProfitAndLossToExcel: jest
      .fn()
      .mockResolvedValue(Buffer.from("profit-and-loss")),
    exportGeneralLedgerToExcel: jest
      .fn()
      .mockResolvedValue(Buffer.from("general-ledger")),
    exportAccountActivityToExcel: jest
      .fn()
      .mockResolvedValue(Buffer.from("account-activity")),
  };
}
