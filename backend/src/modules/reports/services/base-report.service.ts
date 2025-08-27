import { Injectable } from '@nestjs/common';
import { 
  ReportConfig, 
  ReportGenerationOptions, 
  ReportDataAggregationResult,
  ReportFormat 
} from '../interfaces/report-types.interface';
import { UserRole } from '../../auth/interfaces/user-role.interface';
import { AuthorizationService } from '../../auth/services/authorization.service';
import { CacheService } from '../../shared/services/cache.service';
import { Logger } from '../../shared/services/logger.service';

@Injectable()
export class BaseReportService {
  constructor(
    private readonly authService: AuthorizationService,
    private readonly cacheService: CacheService,
    private readonly logger: Logger
  ) {}

  /**
   * Generate a report with caching and authorization checks
   * @param reportConfig Report configuration
   * @param options Report generation options
   * @param userRole User's role for authorization
   */
  async generateReport(
    reportConfig: ReportConfig, 
    options: ReportGenerationOptions,
    userRole: UserRole
  ): Promise<ReportDataAggregationResult> {
    // Check user authorization
    this.checkReportAuthorization(reportConfig, userRole);

    // Generate cache key
    const cacheKey = this.generateCacheKey(reportConfig, options);

    // Try to fetch from cache first
    const cachedReport = await this.cacheService.get(cacheKey);
    if (cachedReport) {
      return cachedReport;
    }

    // Generate report
    const reportData = await this.aggregateReportData(reportConfig, options);

    // Cache the report
    await this.cacheService.set(cacheKey, reportData, 3600); // Cache for 1 hour

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
   * Check if user is authorized to access the report
   */
  private checkReportAuthorization(
    reportConfig: ReportConfig, 
    userRole: UserRole
  ): void {
    if (!this.authService.hasRole(userRole, reportConfig.requiredRoles)) {
      throw new Error('Unauthorized access to report');
    }
  }

  /**
   * Generate a unique cache key for the report
   */
  private generateCacheKey(
    reportConfig: ReportConfig, 
    options: ReportGenerationOptions
  ): string {
    const key = JSON.stringify({
      reportId: reportConfig.id,
      filters: options.filters,
      sortBy: options.sortBy,
      sortOrder: options.sortOrder,
      groupBy: options.groupBy
    });
    return `report:${Buffer.from(key).toString('base64')}`;
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