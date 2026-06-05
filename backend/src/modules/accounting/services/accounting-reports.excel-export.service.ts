import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { SettingsService } from '../../settings/settings.service';
import type {
  AccountActivityResponse,
  BalanceSheetResponse,
  GeneralLedgerResponse,
  ProfitAndLossResponse,
  TrialBalanceResponse,
} from './accounting-reports.service';

@Injectable()
export class AccountingExcelExportService {
  private readonly logger = new Logger(AccountingExcelExportService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async exportTrialBalanceToExcel(
    data: TrialBalanceResponse,
    filename: string = 'trial-balance',
  ): Promise<Buffer> {
    this.logger.log(`Exporting Trial Balance to Excel: ${filename}`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trial Balance');

    await this.addCompanyHeader(worksheet, 'Trial Balance');

    const headerRow = worksheet.addRow([
      'Account Code',
      'Account Name',
      'Account Type',
      'Debit',
      'Credit',
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };

    data.accounts.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.accountType,
        account.debit || 0,
        account.credit || 0,
      ]);

      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);

    const totalRow = worksheet.addRow([
      '',
      '',
      'Total',
      data.totalDebit,
      data.totalCredit,
    ]);
    totalRow.font = { bold: true, size: 12 };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    totalRow.getCell(4).numFmt = '#,##0.00';
    totalRow.getCell(5).numFmt = '#,##0.00';

    const balanceRow = worksheet.addRow([
      '',
      '',
      data.isBalanced ? 'BALANCED' : 'UNBALANCED',
      '',
      '',
    ]);
    balanceRow.font = {
      bold: true,
      color: { argb: data.isBalanced ? 'FF008000' : 'FFFF0000' },
    };

    worksheet.columns = [
      { width: 15 },
      { width: 30 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportBalanceSheetToExcel(
    data: BalanceSheetResponse,
    filename: string = 'balance-sheet',
  ): Promise<Buffer> {
    this.logger.log(`Exporting Balance Sheet to Excel: ${filename}`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Balance Sheet');

    await this.addCompanyHeader(worksheet, 'Balance Sheet');

    const headerRow = worksheet.addRow(['Account Code', 'Account Name', 'Balance']);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };

    const assetsSectionRow = worksheet.addRow(['ASSETS', '', '']);
    assetsSectionRow.font = { bold: true, size: 12 };
    assetsSectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    worksheet.addRow(['Current Assets', '', '']);
    data.assets.current.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const currentAssetsTotalRow = worksheet.addRow([
      '',
      'Total Current Assets',
      data.assets.totalCurrent,
    ]);
    currentAssetsTotalRow.font = { bold: true };
    currentAssetsTotalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    currentAssetsTotalRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    worksheet.addRow(['Fixed Assets', '', '']);
    data.assets.fixed.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const fixedAssetsTotalRow = worksheet.addRow([
      '',
      'Total Fixed Assets',
      data.assets.totalFixed,
    ]);
    fixedAssetsTotalRow.font = { bold: true };
    fixedAssetsTotalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    fixedAssetsTotalRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);
    const totalAssetsRow = worksheet.addRow(['', 'TOTAL ASSETS', data.assets.total]);
    totalAssetsRow.font = { bold: true, size: 12 };
    totalAssetsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    totalAssetsRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const liabilitiesSectionRow = worksheet.addRow(['LIABILITIES', '', '']);
    liabilitiesSectionRow.font = { bold: true, size: 12 };
    liabilitiesSectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    worksheet.addRow(['Current Liabilities', '', '']);
    data.liabilities.current.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const currentLiabilitiesTotalRow = worksheet.addRow([
      '',
      'Total Current Liabilities',
      data.liabilities.totalCurrent,
    ]);
    currentLiabilitiesTotalRow.font = { bold: true };
    currentLiabilitiesTotalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    currentLiabilitiesTotalRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    worksheet.addRow(['Long-term Liabilities', '', '']);
    data.liabilities.longTerm.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const longTermLiabilitiesTotalRow = worksheet.addRow([
      '',
      'Total Long-term Liabilities',
      data.liabilities.totalLongTerm,
    ]);
    longTermLiabilitiesTotalRow.font = { bold: true };
    longTermLiabilitiesTotalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    longTermLiabilitiesTotalRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);
    const totalLiabilitiesRow = worksheet.addRow([
      '',
      'TOTAL LIABILITIES',
      data.liabilities.total,
    ]);
    totalLiabilitiesRow.font = { bold: true, size: 12 };
    totalLiabilitiesRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    totalLiabilitiesRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const equitySectionRow = worksheet.addRow(['EQUITY', '', '']);
    equitySectionRow.font = { bold: true, size: 12 };
    equitySectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    data.equity.accounts.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    if (data.equity.netIncome !== 0) {
      const netIncomeRow = worksheet.addRow([
        '',
        data.equity.netIncome >= 0
          ? 'Net Income (Current Period)'
          : 'Net Loss (Current Period)',
        data.equity.netIncome,
      ]);
      netIncomeRow.font = { bold: true, italic: true };
      netIncomeRow.getCell(3).numFmt = '#,##0.00';
    }

    worksheet.addRow([]);
    const totalEquityRow = worksheet.addRow(['', 'TOTAL EQUITY', data.equity.total]);
    totalEquityRow.font = { bold: true, size: 12 };
    totalEquityRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    totalEquityRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const totalLiabilitiesAndEquity = data.liabilities.total + data.equity.total;
    const grandTotalRow = worksheet.addRow([
      '',
      'TOTAL LIABILITIES & EQUITY',
      totalLiabilitiesAndEquity,
    ]);
    grandTotalRow.font = { bold: true, size: 12 };
    grandTotalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC0C0C0' },
    };
    grandTotalRow.getCell(3).numFmt = '#,##0.00';

    const balanceRow = worksheet.addRow([
      '',
      data.isBalanced ? 'BALANCED' : 'UNBALANCED',
      '',
    ]);
    balanceRow.font = {
      bold: true,
      color: { argb: data.isBalanced ? 'FF008000' : 'FFFF0000' },
    };

    worksheet.columns = [{ width: 15 }, { width: 35 }, { width: 18 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportProfitAndLossToExcel(
    data: ProfitAndLossResponse,
    filename: string = 'profit-and-loss',
  ): Promise<Buffer> {
    this.logger.log(`Exporting Profit and Loss to Excel: ${filename}`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Profit and Loss');

    await this.addCompanyHeader(worksheet, 'Profit and Loss Statement');

    const headerRow = worksheet.addRow(['Account Code', 'Account Name', 'Amount']);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };

    const revenueSectionRow = worksheet.addRow(['REVENUE', '', '']);
    revenueSectionRow.font = { bold: true, size: 12 };
    revenueSectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    data.revenue.accounts.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const totalRevenueRow = worksheet.addRow(['', 'Total Revenue', data.revenue.total]);
    totalRevenueRow.font = { bold: true };
    totalRevenueRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    totalRevenueRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const cogsSectionRow = worksheet.addRow(['COST OF GOODS SOLD', '', '']);
    cogsSectionRow.font = { bold: true, size: 12 };
    cogsSectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    data.costOfGoodsSold.accounts.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const totalCogsRow = worksheet.addRow([
      '',
      'Total Cost of Goods Sold',
      data.costOfGoodsSold.total,
    ]);
    totalCogsRow.font = { bold: true };
    totalCogsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    totalCogsRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const grossProfitRow = worksheet.addRow(['', 'GROSS PROFIT', data.grossProfit]);
    grossProfitRow.font = { bold: true, size: 12 };
    grossProfitRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    grossProfitRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const expensesSectionRow = worksheet.addRow(['OPERATING EXPENSES', '', '']);
    expensesSectionRow.font = { bold: true, size: 12 };
    expensesSectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };

    data.expenses.accounts.forEach(account => {
      const row = worksheet.addRow([
        account.accountCode,
        account.accountName,
        account.balance,
      ]);
      row.getCell(3).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);
    const totalExpensesRow = worksheet.addRow([
      '',
      'Total Operating Expenses',
      data.expenses.total,
    ]);
    totalExpensesRow.font = { bold: true };
    totalExpensesRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    totalExpensesRow.getCell(3).numFmt = '#,##0.00';

    worksheet.addRow([]);

    const netIncomeRow = worksheet.addRow(['', 'NET INCOME', data.netIncome]);
    netIncomeRow.font = { bold: true, size: 12 };
    netIncomeRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC0C0C0' },
    };
    netIncomeRow.getCell(3).numFmt = '#,##0.00';

    worksheet.columns = [{ width: 15 }, { width: 35 }, { width: 18 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportGeneralLedgerToExcel(
    data: GeneralLedgerResponse,
    filename: string = 'general-ledger',
  ): Promise<Buffer> {
    this.logger.log(`Exporting General Ledger to Excel: ${filename}`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('General Ledger');

    await this.addCompanyHeader(worksheet, 'General Ledger');
    worksheet.addRow([`Account: ${data.account.code} - ${data.account.name}`]);
    worksheet.addRow([`Account Type: ${data.account.type}`]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'Date',
      'Entry Number',
      'Description',
      'Debit',
      'Credit',
      'Balance',
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };

    const openingRow = worksheet.addRow([
      '',
      '',
      'Opening Balance',
      '',
      '',
      data.openingBalance,
    ]);
    openingRow.font = { bold: true };
    openingRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' },
    };
    openingRow.getCell(6).numFmt = '#,##0.00';

    data.transactions.forEach(transaction => {
      const row = worksheet.addRow([
        transaction.date.toISOString().split('T')[0],
        transaction.entryNumber,
        transaction.description,
        transaction.debit || '',
        transaction.credit || '',
        transaction.balance,
      ]);
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
    });

    worksheet.addRow([]);

    const closingRow = worksheet.addRow([
      '',
      '',
      'Closing Balance',
      '',
      '',
      data.closingBalance,
    ]);
    closingRow.font = { bold: true, size: 12 };
    closingRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    closingRow.getCell(6).numFmt = '#,##0.00';

    worksheet.columns = [
      { width: 12 },
      { width: 15 },
      { width: 35 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportAccountActivityToExcel(
    data: AccountActivityResponse,
    filename: string = 'account-activity',
  ): Promise<Buffer> {
    this.logger.log(`Exporting Account Activity to Excel: ${filename}`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Account Activity');

    await this.addCompanyHeader(worksheet, 'Account Activity Report');
    worksheet.addRow([`Account: ${data.account.code} - ${data.account.name}`]);
    worksheet.addRow([`Account Type: ${data.account.type}`]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'Date',
      'Entry Number',
      'Description',
      'Reference Type',
      'Reference ID',
      'Status',
      'Debit',
      'Credit',
      'Balance',
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };

    const openingRow = worksheet.addRow([
      '',
      '',
      'Opening Balance',
      '',
      '',
      '',
      '',
      '',
      data.openingBalance,
    ]);
    openingRow.font = { bold: true };
    openingRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' },
    };
    openingRow.getCell(9).numFmt = '#,##0.00';

    data.activity.forEach(transaction => {
      const row = worksheet.addRow([
        transaction.date.toISOString().split('T')[0],
        transaction.entryNumber,
        transaction.description,
        transaction.referenceType || '',
        transaction.referenceId || '',
        transaction.status,
        transaction.debit || '',
        transaction.credit || '',
        transaction.balance,
      ]);
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).numFmt = '#,##0.00';

      if (transaction.status === 'DRAFT') {
        row.getCell(6).font = { color: { argb: 'FFFFA500' } };
      } else if (transaction.status === 'REVERSED') {
        row.getCell(6).font = { color: { argb: 'FFFF0000' } };
      } else if (transaction.status === 'POSTED') {
        row.getCell(6).font = { color: { argb: 'FF008000' } };
      }
    });

    worksheet.addRow([]);

    const closingRow = worksheet.addRow([
      '',
      '',
      'Closing Balance',
      '',
      '',
      '',
      '',
      '',
      data.closingBalance,
    ]);
    closingRow.font = { bold: true, size: 12 };
    closingRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    closingRow.getCell(9).numFmt = '#,##0.00';

    worksheet.columns = [
      { width: 12 },
      { width: 15 },
      { width: 30 },
      { width: 15 },
      { width: 20 },
      { width: 10 },
      { width: 13 },
      { width: 13 },
      { width: 15 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async addCompanyHeader(
    worksheet: ExcelJS.Worksheet,
    title: string,
  ): Promise<void> {
    const settings = await this.settingsService.getCompanySettings();
    worksheet.addRow([settings.name]);
    worksheet.addRow([title]);
    worksheet.addRow([new Date().toISOString().split('T')[0]]);
    worksheet.addRow([]);
  }
}
