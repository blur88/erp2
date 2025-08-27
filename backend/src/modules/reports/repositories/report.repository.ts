import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { 
  ScheduledReportConfig, 
  ReportTemplate 
} from '../interfaces/report-types.interface';

@Injectable()
export class ReportRepository {
  constructor(
    @InjectModel('ScheduledReport') 
    private readonly scheduledReportModel: Model<ScheduledReportConfig>,
    @InjectModel('ReportTemplate') 
    private readonly reportTemplateModel: Model<ReportTemplate>
  ) {}

  /**
   * Find scheduled reports matching a query
   */
  async findScheduledReports(
    query: any = {}, 
    options: { limit?: number; skip?: number } = {}
  ): Promise<ScheduledReportConfig[]> {
    return this.scheduledReportModel
      .find(query)
      .limit(options.limit || 100)
      .skip(options.skip || 0)
      .exec();
  }

  /**
   * Create a new scheduled report
   */
  async createScheduledReport(
    reportConfig: ScheduledReportConfig
  ): Promise<ScheduledReportConfig> {
    const newReport = new this.scheduledReportModel(reportConfig);
    return newReport.save();
  }

  /**
   * Update a scheduled report
   */
  async updateScheduledReport(
    reportId: string, 
    updates: Partial<ScheduledReportConfig>
  ): Promise<ScheduledReportConfig> {
    return this.scheduledReportModel.findByIdAndUpdate(
      reportId, 
      updates, 
      { new: true }
    ).exec();
  }

  /**
   * Delete a scheduled report
   */
  async deleteScheduledReport(reportId: string): Promise<void> {
    await this.scheduledReportModel.findByIdAndDelete(reportId).exec();
  }

  /**
   * Get report templates
   */
  async getReportTemplates(
    query: any = {}, 
    options: { limit?: number; skip?: number } = {}
  ): Promise<ReportTemplate[]> {
    return this.reportTemplateModel
      .find(query)
      .limit(options.limit || 50)
      .skip(options.skip || 0)
      .exec();
  }

  /**
   * Create a new report template
   */
  async createReportTemplate(
    template: ReportTemplate
  ): Promise<ReportTemplate> {
    const newTemplate = new this.reportTemplateModel(template);
    return newTemplate.save();
  }
}