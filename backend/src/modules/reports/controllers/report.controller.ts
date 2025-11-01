import {
  Controller,
  Post,
  Get,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  ReportConfig,
  ReportGenerationOptions,
  ReportFormat,
  ReportCategory
} from '../interfaces/report-types.interface';
import { SalesReportService } from '../services/sales-report.service';
import { BaseReportService } from '../services/base-report.service';

@ApiTags('reports')
@Controller('reports')
export class ReportController {
  constructor(
    private readonly salesReportService: SalesReportService,
    private readonly baseReportService: BaseReportService
  ) {}

  /**
   * Generate a report
   */
  @Post('generate')
  @ApiOperation({ summary: 'Generate a report based on configuration' })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  async generateReport(
    @Body('reportConfig') reportConfig: ReportConfig,
    @Body('options') options: ReportGenerationOptions
  ) {
    // Determine appropriate report service based on category
    const reportService = this.getReportService(reportConfig.category);

    // Generate report
    const reportData = await reportService.generateReport(
      reportConfig,
      options
    );

    return {
      success: true,
      data: reportData
    };
  }

  /**
   * Export a report
   */
  @Post('export')
  @ApiOperation({ summary: 'Export report to specified format' })
  @ApiResponse({ status: 200, description: 'Report exported successfully' })
  async exportReport(
    @Body('reportData') reportData: any,
    @Body('format') format: ReportFormat
  ) {
    const exportedReport = await this.baseReportService.exportReport(
      reportData,
      format
    );

    return {
      success: true,
      data: exportedReport.toString('base64')
    };
  }

  /**
   * Get available report templates
   */
  @Get('templates')
  @ApiOperation({ summary: 'Get available report templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getReportTemplates(
    @Query('category') category?: ReportCategory
  ) {
    // Return predefined report templates
    const templates = [
      {
        id: 'sales-summary',
        name: 'Sales Summary',
        category: ReportCategory.SALES,
        description: 'Summary of sales performance with revenue and order metrics'
      },
      {
        id: 'inventory-valuation',
        name: 'Inventory Valuation',
        category: ReportCategory.INVENTORY,
        description: 'Current inventory stock levels and valuation'
      },
      {
        id: 'purchase-analysis',
        name: 'Purchase Analysis',
        category: ReportCategory.PURCHASING,
        description: 'Analysis of purchasing patterns and supplier performance'
      }
    ];

    const filteredTemplates = category
      ? templates.filter(t => t.category === category)
      : templates;

    return {
      success: true,
      templates: filteredTemplates
    };
  }

  /**
   * Determine appropriate report service based on category
   */
  private getReportService(category: ReportCategory) {
    switch (category) {
      case ReportCategory.SALES:
        return this.salesReportService;
      // Add other report service mappings
      default:
        throw new Error(`No report service found for category: ${category}`);
    }
  }
}