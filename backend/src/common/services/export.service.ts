import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { SettingsService } from '../../modules/settings/settings.service';

export interface ExportColumn {
  key: string;
  header: string;
  type: 'string' | 'number' | 'currency' | 'date';
  width?: number;
}

export interface GroupConfig {
  groupKey: string;
  groupLabel: string;
  subtotalColumns: string[];
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async exportFlat(
    title: string,
    columns: ExportColumn[],
    rows: Record<string, any>[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title);

    await this.addCompanyHeader(worksheet, title);
    this.addColumnHeaders(worksheet, columns);
    rows.forEach(row => this.addDataRow(worksheet, columns, row));
    this.setColumnWidths(worksheet, columns);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    this.logger.debug(`exportFlat: "${title}" — ${rows.length} rows, ${buffer.length} bytes`);
    return buffer;
  }

  async exportGrouped(
    title: string,
    columns: ExportColumn[],
    rows: Record<string, any>[],
    group: GroupConfig,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title);

    await this.addCompanyHeader(worksheet, title);
    this.addColumnHeaders(worksheet, columns);

    const grouped = this.groupRows(rows, group.groupKey);
    const grandTotals: Record<string, number> = {};
    group.subtotalColumns.forEach(k => (grandTotals[k] = 0));

    for (const [groupValue, groupRows] of Object.entries(grouped)) {
      this.addSectionHeaderRow(worksheet, columns.length, groupValue);
      groupRows.forEach(row => this.addDataRow(worksheet, columns, row));

      const subtotals: Record<string, any> = {};
      subtotals[columns[0].key] = `Subtotal (${groupValue})`;
      group.subtotalColumns.forEach(k => {
        const sum = groupRows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
        subtotals[k] = sum;
        grandTotals[k] += sum;
      });
      this.addSubtotalRow(worksheet, columns, subtotals);
      worksheet.addRow([]);
    }

    const totals: Record<string, any> = {};
    totals[columns[0].key] = 'Grand Total';
    group.subtotalColumns.forEach(k => (totals[k] = grandTotals[k]));
    this.addGrandTotalRow(worksheet, columns, totals);

    this.setColumnWidths(worksheet, columns);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    this.logger.debug(`exportGrouped: "${title}" — ${rows.length} rows, ${buffer.length} bytes`);
    return buffer;
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

  private addColumnHeaders(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
  ): void {
    const row = worksheet.addRow(columns.map(c => c.header));
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };
  }

  private addDataRow(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
    data: Record<string, any>,
  ): void {
    const values = columns.map(c => this.resolveValue(data, c.key));
    const row = worksheet.addRow(values);
    columns.forEach((col, i) => {
      if (col.type === 'currency') row.getCell(i + 1).numFmt = '#,##0.00';
      else if (col.type === 'number') row.getCell(i + 1).numFmt = '#,##0';
      else if (col.type === 'date' && values[i] instanceof Date)
        row.getCell(i + 1).numFmt = 'yyyy-mm-dd';
    });
  }

  private addSectionHeaderRow(
    worksheet: ExcelJS.Worksheet,
    colCount: number,
    label: string,
  ): void {
    const row = worksheet.addRow([label, ...Array(colCount - 1).fill('')]);
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };
  }

  private addSubtotalRow(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
    data: Record<string, any>,
  ): void {
    const values = columns.map(c => data[c.key] ?? '');
    const row = worksheet.addRow(values);
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    columns.forEach((col, i) => {
      if (col.type === 'currency') row.getCell(i + 1).numFmt = '#,##0.00';
      else if (col.type === 'number') row.getCell(i + 1).numFmt = '#,##0';
    });
  }

  private addGrandTotalRow(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
    data: Record<string, any>,
  ): void {
    const values = columns.map(c => data[c.key] ?? '');
    const row = worksheet.addRow(values);
    row.font = { bold: true, size: 12 };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD0D0D0' },
    };
    columns.forEach((col, i) => {
      if (col.type === 'currency') row.getCell(i + 1).numFmt = '#,##0.00';
      else if (col.type === 'number') row.getCell(i + 1).numFmt = '#,##0';
    });
  }

  private setColumnWidths(
    worksheet: ExcelJS.Worksheet,
    columns: ExportColumn[],
  ): void {
    worksheet.columns = columns.map(c => ({ width: c.width ?? 15 }));
  }

  private groupRows(
    rows: Record<string, any>[],
    key: string,
  ): Record<string, Record<string, any>[]> {
    return rows.reduce(
      (acc, row) => {
        const groupValue = String(row[key] ?? 'Other');
        if (!acc[groupValue]) acc[groupValue] = [];
        acc[groupValue].push(row);
        return acc;
      },
      {} as Record<string, Record<string, any>[]>,
    );
  }

  private resolveValue(obj: Record<string, any>, key: string): any {
    return key.split('.').reduce((acc, k) => acc?.[k], obj);
  }
}
