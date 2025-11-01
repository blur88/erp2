import { Injectable, Logger } from '@nestjs/common';
import {
  ReportConfig,
  ReportGenerationOptions,
  ReportDataAggregationResult,
  ReportFormat
} from '../interfaces/report-types.interface';

@Injectable()
export class BaseReportService {
  private readonly logger = new Logger(BaseReportService.name);

  constructor() {}

  /**
   * Generate a report
   * @param reportConfig Report configuration
   * @param options Report generation options
   */
  async generateReport(
    reportConfig: ReportConfig,
    options: ReportGenerationOptions
  ): Promise<ReportDataAggregationResult> {
    this.logger.log(`Generating report: ${reportConfig.name}`);

    // Generate report
    const reportData = await this.aggregateReportData(reportConfig, options);

    return reportData;
  }

  /**
   * Export report to specified format
   * @param reportData Report data to export
   * @param format Export format
   */
  async exportReport(
    reportData: ReportDataAggregationResult, 
    format: ReportFormat
  ): Promise<Buffer> {
    switch (format) {
      case ReportFormat.CSV:
        return this.exportToCSV(reportData);
      case ReportFormat.XLSX:
        return this.exportToExcel(reportData);
      case ReportFormat.PDF:
        return this.exportToPDF(reportData);
      case ReportFormat.JSON:
        return this.exportToJSON(reportData);
      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Aggregate report data - to be implemented by specific report services
   */
  protected async aggregateReportData(
    reportConfig: ReportConfig, 
    options: ReportGenerationOptions
  ): Promise<ReportDataAggregationResult> {
    throw new Error('Method not implemented');
  }

  /**
   * Export methods - to be implemented with specific export logic
   */
  private async exportToCSV(data: ReportDataAggregationResult): Promise<Buffer> {
    throw new Error('CSV export not implemented');
  }

  private async exportToExcel(data: ReportDataAggregationResult): Promise<Buffer> {
    throw new Error('Excel export not implemented');
  }

  private async exportToPDF(data: ReportDataAggregationResult): Promise<Buffer> {
    throw new Error('PDF export not implemented');
  }

  private async exportToJSON(data: ReportDataAggregationResult): Promise<Buffer> {
    return Buffer.from(JSON.stringify(data, null, 2));
  }
}