import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { 
  ScheduledReportConfig, 
  ReportFormat, 
  ReportFrequency 
} from '../interfaces/report-types.interface';
import { BaseReportService } from './base-report.service';
import { EmailService } from '../../notifications/services/email.service';
import { ReportRepository } from '../repositories/report.repository';
import { Logger } from '../../shared/services/logger.service';

@Injectable()
export class ScheduledReportService {
  constructor(
    private readonly reportRepository: ReportRepository,
    private readonly baseReportService: BaseReportService,
    private readonly emailService: EmailService,
    private readonly logger: Logger
  ) {}

  /**
   * Schedule and generate reports based on configured frequency
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processScheduledReports() {
    // Fetch all scheduled reports due for generation
    const scheduledReports = await this.getScheduledReports();

    for (const reportConfig of scheduledReports) {
      try {
        await this.generateAndSendReport(reportConfig);
      } catch (error) {
        this.logger.error(`Failed to process scheduled report ${reportConfig.id}`, error);
      }
    }
  }

  /**
   * Generate and send a scheduled report
   */
  private async generateAndSendReport(
    reportConfig: ScheduledReportConfig
  ): Promise<void> {
    // Generate report
    const reportData = await this.baseReportService.generateReport(
      {
        id: reportConfig.id,
        name: reportConfig.name,
        category: this.getCategoryFromReportType(reportConfig.reportType),
        requiredRoles: [], // Define appropriate roles
        type: reportConfig.reportType
      },
      { format: reportConfig.format },
      null // Add appropriate user role
    );

    // Export report
    const exportedReport = await this.baseReportService.exportReport(
      reportData, 
      reportConfig.format
    );

    // Send via email
    await this.sendReportViaEmail(
      reportConfig.recipients, 
      reportConfig.name, 
      exportedReport, 
      reportConfig.format
    );

    // Update report tracking
    await this.updateReportSchedule(reportConfig);
  }

  /**
   * Send report via email
   */
  private async sendReportViaEmail(
    recipients: string[], 
    reportName: string, 
    reportBuffer: Buffer, 
    format: ReportFormat
  ): Promise<void> {
    const attachmentName = `${reportName}_${new Date().toISOString()}.${format}`;

    for (const recipient of recipients) {
      await this.emailService.sendEmail({
        to: recipient,
        subject: `Scheduled Report: ${reportName}`,
        text: `Please find the attached ${reportName} report.`,
        attachments: [{
          filename: attachmentName,
          content: reportBuffer
        }]
      });
    }
  }

  /**
   * Get reports scheduled for generation
   */
  private async getScheduledReports(): Promise<ScheduledReportConfig[]> {
    const now = new Date();
    return this.reportRepository.findScheduledReports({
      $or: [
        { nextRunAt: { $lte: now } },
        { nextRunAt: null } // For initial scheduling
      ]
    });
  }

  /**
   * Update report schedule after generation
   */
  private async updateReportSchedule(
    reportConfig: ScheduledReportConfig
  ): Promise<void> {
    const nextRunAt = this.calculateNextRunTime(reportConfig.frequency);

    await this.reportRepository.updateScheduledReport(reportConfig.id, {
      lastRunAt: new Date(),
      nextRunAt
    });
  }

  /**
   * Calculate next run time based on frequency
   */
  private calculateNextRunTime(frequency: ReportFrequency): Date {
    const now = new Date();
    switch (frequency) {
      case ReportFrequency.DAILY:
        now.setDate(now.getDate() + 1);
        break;
      case ReportFrequency.WEEKLY:
        now.setDate(now.getDate() + 7);
        break;
      case ReportFrequency.MONTHLY:
        now.setMonth(now.getMonth() + 1);
        break;
      case ReportFrequency.QUARTERLY:
        now.setMonth(now.getMonth() + 3);
        break;
      case ReportFrequency.YEARLY:
        now.setFullYear(now.getFullYear() + 1);
        break;
    }
    return now;
  }

  /**
   * Map report type to category (placeholder implementation)
   */
  private getCategoryFromReportType(reportType: string): any {
    // Implement mapping logic
    return null;
  }
}