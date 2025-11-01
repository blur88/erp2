import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ScheduledReportService {
  private readonly logger = new Logger(ScheduledReportService.name);

  constructor() {}

  /**
   * Schedule and generate reports based on configured frequency
   * Note: Scheduled reporting disabled - requires email service integration
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processScheduledReports() {
    this.logger.log('Scheduled report processing disabled - email service not configured');
    // TODO: Implement when email service is available
  }
}