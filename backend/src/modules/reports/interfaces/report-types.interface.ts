// Auth imports removed - authentication system disabled

export enum ReportCategory {
  SALES = 'sales',
  INVENTORY = 'inventory',
  PURCHASING = 'purchasing',
  FINANCIAL = 'financial',
  OPERATIONAL = 'operational'
}

export enum ReportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
  JSON = 'json'
}

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

export interface ReportConfig {
  id?: string;
  name: string;
  category: ReportCategory;
  type: string;
  description?: string;
  // requiredRoles removed - authentication system disabled
  filters?: Record<string, any>;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export interface ReportTemplate {
  id: string;
  name: string;
  category: ReportCategory;
  template: string;
  fields: string[];
  // requiredPermissions removed - authentication system disabled
}

export interface ReportGenerationOptions {
  format: ReportFormat;
  filters?: Record<string, any>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  groupBy?: string[];
}

export interface ScheduledReportConfig {
  id?: string;
  name: string;
  frequency: ReportFrequency;
  reportType: string;
  recipients: string[];
  format: ReportFormat;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

export interface ReportDataAggregationResult {
  totalRecords: number;
  data: any[];
  aggregations?: Record<string, any>;
  metadata?: Record<string, any>;
}