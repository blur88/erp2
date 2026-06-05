import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { Response } from "express";
import { AccountingReportsService } from "../services/accounting-reports.service";
import { JournalEntryStatus } from "../../../database/entities/journal-entry.entity";
import { Auth } from "../../auth/decorators/auth.decorator";
import { AsOfDateQueryDto } from "../../../common/dto/report-date-query.dto";

@ApiTags("Accounting Reports")
@Controller("accounting/reports")
@Auth()
export class AccountingReportsController {
  constructor(
    private readonly accountingReportsService: AccountingReportsService,
  ) {}

  /**
   * Generate Trial Balance Report
   * GET /api/accounting/reports/trial-balance
   */
  @Get("trial-balance")
  @ApiOperation({
    summary: "Generate Trial Balance report",
    description:
      "Lists all accounts with their debit/credit balances as of a specific date. Total Debits must equal Total Credits in a balanced system.",
  })
  @ApiQuery({
    name: "asOfDate",
    required: false,
    type: String,
    description:
      "Calculate trial balance as of this date (ISO 8601 format, defaults to current date)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Include inactive accounts in the report",
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: "Trial Balance report generated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid date or date is in the future",
  })
  async getTrialBalance(
    @Query() query: AsOfDateQueryDto,
    @Query("includeInactive") includeInactive?: string,
  ) {
    const date = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const includeInactiveBool = includeInactive === "true";

    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    return this.accountingReportsService.generateTrialBalance(
      date,
      includeInactiveBool,
    );
  }

  /**
   * Export Trial Balance to Excel
   * GET /api/accounting/reports/trial-balance/export
   */
  @Get("trial-balance/export")
  @ApiOperation({
    summary: "Export Trial Balance report to Excel",
    description: "Downloads Trial Balance report as an Excel file",
  })
  @ApiQuery({
    name: "asOfDate",
    required: false,
    type: String,
    description:
      "Calculate trial balance as of this date (ISO 8601 format, defaults to current date)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Include inactive accounts in the report",
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: "Excel file generated successfully",
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  async exportTrialBalance(
    @Res() res: Response,
    @Query() query: AsOfDateQueryDto,
    @Query("includeInactive") includeInactive?: string,
  ) {
    const date = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const includeInactiveBool = includeInactive === "true";

    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    const data = await this.accountingReportsService.generateTrialBalance(
      date,
      includeInactiveBool,
    );

    const buffer =
      await this.accountingReportsService.exportTrialBalanceToExcel(
        data,
        "trial-balance",
      );

    const filename = `trial-balance-${date.toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(buffer);
  }

  /**
   * Generate Balance Sheet Report
   * GET /api/accounting/reports/balance-sheet
   */
  @Get("balance-sheet")
  @ApiOperation({
    summary: "Generate Balance Sheet report",
    description:
      "Lists assets, liabilities, and equity as of a specific date. Follows the equation: Assets = Liabilities + Equity",
  })
  @ApiQuery({
    name: "asOfDate",
    required: false,
    type: String,
    description:
      "Calculate balance sheet as of this date (ISO 8601 format, defaults to current date)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Include inactive accounts in the report",
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: "Balance Sheet report generated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid date or date is in the future",
  })
  async getBalanceSheet(
    @Query() query: AsOfDateQueryDto,
    @Query("includeInactive") includeInactive?: string,
  ) {
    const date = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const includeInactiveBool = includeInactive === "true";

    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    return this.accountingReportsService.generateBalanceSheet(
      date,
      includeInactiveBool,
    );
  }

  /**
   * Export Balance Sheet to Excel
   * GET /api/accounting/reports/balance-sheet/export
   */
  @Get("balance-sheet/export")
  @ApiOperation({
    summary: "Export Balance Sheet report to Excel",
    description: "Downloads Balance Sheet report as an Excel file",
  })
  @ApiQuery({
    name: "asOfDate",
    required: false,
    type: String,
    description:
      "Calculate balance sheet as of this date (ISO 8601 format, defaults to current date)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Include inactive accounts in the report",
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: "Excel file generated successfully",
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  async exportBalanceSheet(
    @Res() res: Response,
    @Query() query: AsOfDateQueryDto,
    @Query("includeInactive") includeInactive?: string,
  ) {
    const date = query.asOfDate ? new Date(query.asOfDate) : new Date();
    const includeInactiveBool = includeInactive === "true";

    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    const data = await this.accountingReportsService.generateBalanceSheet(
      date,
      includeInactiveBool,
    );

    const buffer =
      await this.accountingReportsService.exportBalanceSheetToExcel(
        data,
        "balance-sheet",
      );

    const filename = `balance-sheet-${date.toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(buffer);
  }

  /**
   * Generate Profit and Loss (Income Statement) Report
   * GET /api/accounting/reports/profit-loss
   */
  @Get("profit-loss")
  @ApiOperation({
    summary: "Generate Profit and Loss (Income Statement) report",
    description:
      "Shows revenues, costs, and expenses over a period of time. Calculates Net Income = Revenue - COGS - Expenses",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    type: String,
    description: "Start date of the period (ISO 8601 format)",
    example: "2026-01-01",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    type: String,
    description: "End date of the period (ISO 8601 format)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Include inactive accounts in the report",
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: "Profit and Loss report generated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid date range or end date is in the future",
  })
  async getProfitAndLoss(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("includeInactive") includeInactive?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException("Both startDate and endDate are required");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const includeInactiveBool = includeInactive === "true";

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    return this.accountingReportsService.generateProfitAndLoss(
      start,
      end,
      includeInactiveBool,
    );
  }

  /**
   * Export Profit and Loss to Excel
   * GET /api/accounting/reports/profit-loss/export
   */
  @Get("profit-loss/export")
  @ApiOperation({
    summary: "Export Profit and Loss report to Excel",
    description:
      "Downloads Profit and Loss (Income Statement) report as an Excel file",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    type: String,
    description: "Start date of the period (ISO 8601 format)",
    example: "2026-01-01",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    type: String,
    description: "End date of the period (ISO 8601 format)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description: "Include inactive accounts in the report",
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: "Excel file generated successfully",
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  async exportProfitAndLoss(
    @Res() res: Response,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("includeInactive") includeInactive?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException("Both startDate and endDate are required");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const includeInactiveBool = includeInactive === "true";

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    const data = await this.accountingReportsService.generateProfitAndLoss(
      start,
      end,
      includeInactiveBool,
    );

    const buffer =
      await this.accountingReportsService.exportProfitAndLossToExcel(
        data,
        "profit-and-loss",
      );

    const filename = `profit-and-loss-${start.toISOString().split("T")[0]}-to-${end.toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(buffer);
  }

  /**
   * Generate General Ledger Report
   * GET /api/accounting/reports/general-ledger
   */
  @Get("general-ledger")
  @ApiOperation({
    summary: "Generate General Ledger report for a specific account",
    description:
      "Shows all transactions for an account over a period with running balance. Most detailed transaction report.",
  })
  @ApiQuery({
    name: "accountId",
    required: true,
    type: String,
    description: "Account ID to generate ledger for",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    type: String,
    description: "Start date of the period (ISO 8601 format)",
    example: "2026-01-01",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    type: String,
    description: "End date of the period (ISO 8601 format)",
    example: "2026-02-10",
  })
  @ApiResponse({
    status: 200,
    description: "General Ledger report generated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid date range or end date is in the future",
  })
  @ApiResponse({
    status: 404,
    description: "Account not found or inactive",
  })
  async getGeneralLedger(
    @Query("accountId") accountId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    if (!accountId || !startDate || !endDate) {
      throw new BadRequestException(
        "accountId, startDate, and endDate are required",
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    return this.accountingReportsService.generateGeneralLedger(
      accountId,
      start,
      end,
    );
  }

  /**
   * Export General Ledger to Excel
   * GET /api/accounting/reports/general-ledger/export
   */
  @Get("general-ledger/export")
  @ApiOperation({
    summary: "Export General Ledger report to Excel",
    description:
      "Downloads General Ledger report for a specific account as an Excel file",
  })
  @ApiQuery({
    name: "accountId",
    required: true,
    type: String,
    description: "Account ID to generate ledger for",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    type: String,
    description: "Start date of the period (ISO 8601 format)",
    example: "2026-01-01",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    type: String,
    description: "End date of the period (ISO 8601 format)",
    example: "2026-02-10",
  })
  @ApiResponse({
    status: 200,
    description: "Excel file generated successfully",
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  async exportGeneralLedger(
    @Res() res: Response,
    @Query("accountId") accountId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    if (!accountId || !startDate || !endDate) {
      throw new BadRequestException(
        "accountId, startDate, and endDate are required",
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    const data = await this.accountingReportsService.generateGeneralLedger(
      accountId,
      start,
      end,
    );

    const buffer =
      await this.accountingReportsService.exportGeneralLedgerToExcel(
        data,
        "general-ledger",
      );

    const filename = `general-ledger-${data.account.code}-${start.toISOString().split("T")[0]}-to-${end.toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(buffer);
  }

  /**
   * Generate Account Activity Report
   * GET /api/accounting/reports/account-activity
   */
  @Get("account-activity")
  @ApiOperation({
    summary: "Generate Account Activity report for a specific account",
    description:
      "Enhanced version of General Ledger with status, reference links, and drill-down capability. Includes ALL entry statuses (DRAFT, POSTED, REVERSED) by default.",
  })
  @ApiQuery({
    name: "accountId",
    required: true,
    type: String,
    description: "Account ID to generate activity for",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    type: String,
    description: "Start date of the period (ISO 8601 format)",
    example: "2026-01-01",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    type: String,
    description: "End date of the period (ISO 8601 format)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["DRAFT", "POSTED", "REVERSED"],
    description: "Filter by journal entry status",
    example: "POSTED",
  })
  @ApiResponse({
    status: 200,
    description: "Account Activity report generated successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid date range, status, or end date is in the future",
  })
  @ApiResponse({
    status: 404,
    description: "Account not found or inactive",
  })
  async getAccountActivity(
    @Query("accountId") accountId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("status") status?: string,
  ) {
    if (!accountId || !startDate || !endDate) {
      throw new BadRequestException(
        "accountId, startDate, and endDate are required",
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    // Validate status if provided
    let statusFilter: JournalEntryStatus | undefined;
    if (status) {
      if (
        !Object.values(JournalEntryStatus).includes(
          status as JournalEntryStatus,
        )
      ) {
        throw new BadRequestException(
          `Invalid status. Must be one of: ${Object.values(JournalEntryStatus).join(", ")}`,
        );
      }
      statusFilter = status as JournalEntryStatus;
    }

    return this.accountingReportsService.generateAccountActivity(
      accountId,
      start,
      end,
      statusFilter,
    );
  }

  /**
   * Export Account Activity to Excel
   * GET /api/accounting/reports/account-activity/export
   */
  @Get("account-activity/export")
  @ApiOperation({
    summary: "Export Account Activity report to Excel",
    description:
      "Downloads Account Activity report for a specific account as an Excel file with color-coded status",
  })
  @ApiQuery({
    name: "accountId",
    required: true,
    type: String,
    description: "Account ID to generate activity for",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    type: String,
    description: "Start date of the period (ISO 8601 format)",
    example: "2026-01-01",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    type: String,
    description: "End date of the period (ISO 8601 format)",
    example: "2026-02-10",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["DRAFT", "POSTED", "REVERSED"],
    description: "Filter by journal entry status",
    example: "POSTED",
  })
  @ApiResponse({
    status: 200,
    description: "Excel file generated successfully",
    content: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        schema: { type: "string", format: "binary" },
      },
    },
  })
  async exportAccountActivity(
    @Res() res: Response,
    @Query("accountId") accountId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("status") status?: string,
  ) {
    if (!accountId || !startDate || !endDate) {
      throw new BadRequestException(
        "accountId, startDate, and endDate are required",
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format (YYYY-MM-DD)",
      );
    }

    // Validate status if provided
    let statusFilter: JournalEntryStatus | undefined;
    if (status) {
      if (
        !Object.values(JournalEntryStatus).includes(
          status as JournalEntryStatus,
        )
      ) {
        throw new BadRequestException(
          `Invalid status. Must be one of: ${Object.values(JournalEntryStatus).join(", ")}`,
        );
      }
      statusFilter = status as JournalEntryStatus;
    }

    const data = await this.accountingReportsService.generateAccountActivity(
      accountId,
      start,
      end,
      statusFilter,
    );

    const buffer =
      await this.accountingReportsService.exportAccountActivityToExcel(
        data,
        "account-activity",
      );

    const filename = `account-activity-${data.account.code}-${start.toISOString().split("T")[0]}-to-${end.toISOString().split("T")[0]}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(HttpStatus.OK).send(buffer);
  }
}
