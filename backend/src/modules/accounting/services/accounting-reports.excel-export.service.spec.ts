import { Test, TestingModule } from "@nestjs/testing";
import { AccountingExcelExportService } from "./accounting-reports.excel-export.service";
import { SettingsService } from "../../settings/settings.service";
import {
  AccountActivityResponse,
  BalanceSheetResponse,
  GeneralLedgerResponse,
  ProfitAndLossResponse,
  TrialBalanceResponse,
} from "./accounting-reports.service";

describe("AccountingExcelExportService", () => {
  let service: AccountingExcelExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingExcelExportService,
        {
          provide: SettingsService,
          useValue: {
            getCompanySettings: jest
              .fn()
              .mockResolvedValue({ name: "Test Co" }),
          },
        },
      ],
    }).compile();

    service = module.get<AccountingExcelExportService>(
      AccountingExcelExportService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("exportTrialBalanceToExcel returns a non-empty Buffer", async () => {
    const data: TrialBalanceResponse = {
      accounts: [
        {
          accountCode: "1000",
          accountName: "Cash",
          accountType: "ASSET",
          debit: 1000,
          credit: 0,
        },
      ],
      totalDebit: 1000,
      totalCredit: 1000,
      isBalanced: true,
    };

    const result = await service.exportTrialBalanceToExcel(data);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("exportBalanceSheetToExcel returns a non-empty Buffer", async () => {
    const data: BalanceSheetResponse = {
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
      equity: { accounts: [], netIncome: 0, total: 0 },
      isBalanced: true,
    };

    const result = await service.exportBalanceSheetToExcel(data);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("exportProfitAndLossToExcel returns a non-empty Buffer", async () => {
    const data: ProfitAndLossResponse = {
      revenue: { accounts: [], total: 0 },
      costOfGoodsSold: { accounts: [], total: 0 },
      grossProfit: 0,
      expenses: { accounts: [], total: 0 },
      netIncome: 0,
    };

    const result = await service.exportProfitAndLossToExcel(data);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("exportGeneralLedgerToExcel returns a non-empty Buffer", async () => {
    const data: GeneralLedgerResponse = {
      account: { id: "1", code: "1000", name: "Cash", type: "ASSET" },
      openingBalance: 0,
      transactions: [],
      closingBalance: 0,
    };

    const result = await service.exportGeneralLedgerToExcel(data);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("exportAccountActivityToExcel returns a non-empty Buffer", async () => {
    const data: AccountActivityResponse = {
      account: { id: "1", code: "1000", name: "Cash", type: "ASSET" },
      openingBalance: 0,
      activity: [],
      closingBalance: 0,
    };

    const result = await service.exportAccountActivityToExcel(data);

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
