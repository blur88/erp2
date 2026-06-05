import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  ChartOfAccount,
  AccountType,
} from "../../../database/entities/chart-of-account.entity";
import {
  JournalEntry,
  JournalEntryStatus,
} from "../../../database/entities/journal-entry.entity";
import { JournalEntryLine } from "../../../database/entities/journal-entry-line.entity";
import {
  createMockQueryBuilder,
  createMockRepositories,
} from "./__fixtures__/accounting-reports.fixtures";
import { AccountingReportsQueryHelper } from "./accounting-reports.query-helper";

describe("AccountingReportsQueryHelper", () => {
  let helper: AccountingReportsQueryHelper;
  let qb: ReturnType<typeof createMockQueryBuilder>;
  let lineRepo: any;

  beforeEach(async () => {
    qb = createMockQueryBuilder();
    const {
      accountRepo,
      journalRepo,
      lineRepo: lr,
    } = createMockRepositories(qb);
    lineRepo = lr;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingReportsQueryHelper,
        { provide: getRepositoryToken(ChartOfAccount), useValue: accountRepo },
        { provide: getRepositoryToken(JournalEntry), useValue: journalRepo },
        { provide: getRepositoryToken(JournalEntryLine), useValue: lineRepo },
      ],
    }).compile();

    helper = module.get<AccountingReportsQueryHelper>(
      AccountingReportsQueryHelper,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it("should be defined", () => {
    expect(helper).toBeDefined();
  });

  describe("queryTransactionTotals", () => {
    const statuses = [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED];

    it("returns empty map for empty accountIds", async () => {
      const result = await helper.queryTransactionTotals(
        [],
        { type: "asOf", date: new Date() },
        statuses,
      );

      expect(result.size).toBe(0);
    });

    it("asOf filter: returns totals keyed by accountId", async () => {
      qb.getRawMany.mockResolvedValue([
        { accountId: "1", totalDebit: "1000", totalCredit: "200" },
        { accountId: "2", totalDebit: "0", totalCredit: "500" },
      ]);

      const result = await helper.queryTransactionTotals(
        ["1", "2"],
        { type: "asOf", date: new Date("2026-02-01") },
        statuses,
      );

      expect(result.get("1")).toEqual({ totalDebit: 1000, totalCredit: 200 });
      expect(result.get("2")).toEqual({ totalDebit: 0, totalCredit: 500 });
    });

    it("range filter: queries with startDate and endDate", async () => {
      qb.getRawMany.mockResolvedValue([]);

      await helper.queryTransactionTotals(
        ["1"],
        {
          type: "range",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-01-31"),
        },
        statuses,
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(">="),
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("<="),
        expect.any(Object),
      );
    });

    it("before filter: queries with strict less-than date", async () => {
      qb.getRawMany.mockResolvedValue([]);

      await helper.queryTransactionTotals(
        ["1"],
        { type: "before", date: new Date("2026-01-01") },
        statuses,
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("<"),
        expect.any(Object),
      );
    });

    it("handles null/undefined raw values as 0", async () => {
      qb.getRawMany.mockResolvedValue([
        { accountId: "1", totalDebit: null, totalCredit: undefined },
      ]);

      const result = await helper.queryTransactionTotals(
        ["1"],
        { type: "asOf", date: new Date() },
        statuses,
      );

      expect(result.get("1")).toEqual({ totalDebit: 0, totalCredit: 0 });
    });
  });

  describe("calculateBalanceByAccountType", () => {
    it("ASSET: debit - credit", () => {
      expect(
        helper.calculateBalanceByAccountType(AccountType.ASSET, 1000, 200),
      ).toBe(800);
    });

    it("EXPENSE: debit - credit", () => {
      expect(
        helper.calculateBalanceByAccountType(AccountType.EXPENSE, 500, 100),
      ).toBe(400);
    });

    it("LIABILITY: credit - debit", () => {
      expect(
        helper.calculateBalanceByAccountType(AccountType.LIABILITY, 100, 600),
      ).toBe(500);
    });

    it("EQUITY: credit - debit", () => {
      expect(
        helper.calculateBalanceByAccountType(AccountType.EQUITY, 0, 1000),
      ).toBe(1000);
    });

    it("REVENUE: credit - debit", () => {
      expect(
        helper.calculateBalanceByAccountType(AccountType.REVENUE, 50, 1050),
      ).toBe(1000);
    });
  });

  describe("roundTo2Decimals", () => {
    it("rounds to 2 decimal places", () => {
      expect(helper.roundTo2Decimals(1.005)).toBe(1);
      expect(helper.roundTo2Decimals(1.004)).toBe(1);
      expect(helper.roundTo2Decimals(100)).toBe(100);
    });
  });
});
