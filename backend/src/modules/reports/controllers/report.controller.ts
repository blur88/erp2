import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  Param, 
  UseGuards, 
  Req 
} from '@nestjs/common';
import { 
  ReportConfig, 
  ReportGenerationOptions,
  ReportFormat,
  ReportCategory 
} from '../interfaces/report-types.interface';
import { SalesReportService } from '../services/sales-report.service';
import { BaseReportService } from '../services/base-report.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RoleGuard } from '../../auth/guards/role.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../auth/interfaces/user-role.interface';

@Controller('reports')
@UseGuards(AuthGuard, RoleGuard)
export class ReportController {
  constructor(
    private readonly salesReportService: SalesReportService,
    private readonly baseReportService: BaseReportService
  ) {}

  /**
   * Generate a report
   */
  @Post('generate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async generateReport(
    @Body('reportConfig') reportConfig: ReportConfig,
    @Body('options') options: ReportGenerationOptions,
    @Req() request
  ) {
    const userRole = request.user.role;

    // Determine appropriate report service based on category
    const reportService = this.getReportService(reportConfig.category);

    // Generate report
    const reportData = await reportService.generateReport(
      reportConfig, 
      options, 
      userRole
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async exportReport(
    @Body('reportData') reportData: any,
    @Body('format') format: ReportFormat,
    @Req() request
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async getReportTemplates(
    @Query('category') category?: ReportCategory
  ) {
    // Placeholder for report template retrieval
    // Implement logic to fetch report templates based on category
    return {
      success: true,
      templates: []
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