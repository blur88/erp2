import { AccountingReportsController } from "./accounting-reports.controller";
import { AccountingReportsService } from "../services/accounting-reports.service";

describe("AccountingReportsController", () => {
  let controller: AccountingReportsController;
  let service: Pick<
    AccountingReportsService,
    "generateTrialBalance" | "generateBalanceSheet"
  >;

  beforeEach(() => {
    service = {
      generateTrialBalance: jest.fn().mockResolvedValue({ accounts: [] }),
      generateBalanceSheet: jest.fn().mockResolvedValue({ assets: [] }),
    } as any;

    controller = new AccountingReportsController(
      service as AccountingReportsService,
    );
  });

  it("passes validated asOfDate to generateTrialBalance", async () => {
    await controller.getTrialBalance({ asOfDate: "2026-01-01" }, "true");

    expect(service.generateTrialBalance).toHaveBeenCalledWith(
      new Date("2026-01-01"),
      true,
    );
  });

  it("passes validated asOfDate to generateBalanceSheet", async () => {
    await controller.getBalanceSheet({ asOfDate: "2026-01-01" }, "false");

    expect(service.generateBalanceSheet).toHaveBeenCalledWith(
      new Date("2026-01-01"),
      false,
    );
  });
});
