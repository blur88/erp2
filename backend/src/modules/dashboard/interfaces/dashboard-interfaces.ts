// Auth imports removed - authentication system disabled

// Core Dashboard Types
export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  dataSource: string;
  config: WidgetConfig;
  // accessibleRoles removed - all widgets now publicly accessible
}

export enum WidgetType {
  LineChart = 'line_chart',
  BarChart = 'bar_chart',
  PieChart = 'pie_chart',
  Gauge = 'gauge',
  KPI = 'kpi',
  Table = 'table'
}

export interface WidgetConfig {
  dimensions?: string[];
  metrics?: string[];
  filters?: Record<string, any>;
  chartOptions?: Record<string, any>;
}

// Dashboard Data Interfaces
export interface DashboardDataRequest {
  dashboardId?: string;
  widgetIds?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: Record<string, any>;
}

export interface DashboardDataResponse {
  widgets: {
    [widgetId: string]: any;
  };
  metadata?: {
    lastUpdated: Date;
    refreshInterval: number;
  };
}

// KPI Interfaces
export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  category: KPICategory;
  calculation: (data: any) => number;
  alertThresholds?: {
    warning?: number;
    critical?: number;
  };
}

export enum KPICategory {
  Sales = 'sales',
  Inventory = 'inventory',
  Financial = 'financial',
  Operational = 'operational',
  Customer = 'customer',
  Supplier = 'supplier'
}

// Alert Interfaces
export interface DashboardAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  relatedWidgetId?: string;
  timestamp: Date;
  acknowledged?: boolean;
}

export enum AlertType {
  Threshold = 'threshold',
}

export enum AlertSeverity {
  Low = 'low',
  Medium = 'medium',
}

// Dashboard Personalization
export interface UserDashboardLayout {
  userId: string;
  dashboardId: string;
  widgets: {
    widgetId: string;
    position: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
}