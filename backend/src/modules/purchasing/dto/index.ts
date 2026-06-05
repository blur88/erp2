/**
 * DTO exports for Purchasing Module
 *
 * This file exports all DTOs used in the purchasing module
 * for easy importing throughout the application.
 */

// Supplier DTOs
export * from "./supplier.dto";

// Purchase Order DTOs
export * from "./purchase-order.dto";

// Goods Received Note DTOs
export * from "./goods-received-note.dto";

// Vendor Payment DTOs
export * from "./vendor-payment.dto";

// Common response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error?: string;
  timestamp: Date;
}

interface BulkOperationResponse {
  success: boolean;
  successCount: number;
  errorCount: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

// Analytics and reporting DTOs
interface PurchaseAnalyticsDto {
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalOrders: number;
  totalAmount: number;
  averageOrderValue: number;
  topSuppliers: Array<{
    supplierId: string;
    companyName: string;
    orderCount: number;
    totalAmount: number;
    percentage: number;
  }>;
  spendByCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  spendByDepartment: Array<{
    department: string;
    amount: number;
    percentage: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    orderCount: number;
    totalAmount: number;
  }>;
  performanceMetrics: {
    averageLeadTime: number;
    onTimeDeliveryRate: number;
    qualityRate: number;
    costSavings: number;
  };
}

interface VendorPerformanceDto {
  supplierId: string;
  companyName: string;
  rating: string;
  performanceScore: number;
  metrics: {
    totalOrders: number;
    totalAmount: number;
    averageOrderValue: number;
    onTimeDeliveryRate: number;
    qualityRate: number;
    averageLeadTime: number;
    lastOrderDate: Date;
  };
  trends: {
    orderVolumeTrend: "increasing" | "decreasing" | "stable";
    performanceTrend: "improving" | "declining" | "stable";
    costTrend: "increasing" | "decreasing" | "stable";
  };
  issues: Array<{
    type: "delivery" | "quality" | "pricing" | "communication";
    description: string;
    impact: "low" | "medium" | "high";
    occurrenceCount: number;
  }>;
}

// Approval workflow DTOs
interface ApprovalWorkflowDto {
  entityType: "purchase_order" | "purchase_requisition" | "supplier_invoice";
  entityId: string;
  currentLevel: number;
  requiredLevels: number;
  approvers: Array<{
    level: number;
    userId: string;
    userName: string;
    approvalDate?: Date;
    comments?: string;
    action?: "approved" | "rejected" | "pending";
  }>;
  canApprove: boolean;
  isFullyApproved: boolean;
}

// Notification DTOs
interface PurchaseNotificationDto {
  type:
    | "approval_required"
    | "overdue"
    | "quality_issue"
    | "invoice_mismatch"
    | "budget_exceeded";
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  priority: "low" | "medium" | "high" | "critical";
  recipients: string[];
  data?: Record<string, any>;
}

// Integration DTOs
interface InventoryUpdateDto {
  productId: string;
  quantityReceived: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: Date;
  storageLocation?: string;
  notes?: string;
}

interface BudgetCheckDto {
  department: string;
  budgetCode?: string;
  amount: number;
  period: {
    startDate: Date;
    endDate: Date;
  };
}

interface BudgetCheckResponseDto {
  isWithinBudget: boolean;
  budgetAmount: number;
  spentAmount: number;
  remainingBudget: number;
  utilizationPercentage: number;
  warning?: string;
}

// Report DTOs
interface PurchaseReportDto {
  reportType:
    | "spend_analysis"
    | "vendor_performance"
    | "purchase_trends"
    | "budget_utilization";
  parameters: {
    startDate: Date;
    endDate: Date;
    supplierIds?: string[];
    departments?: string[];
    categories?: string[];
    includeCharts?: boolean;
    format?: "json" | "pdf" | "excel";
  };
}

interface ExportOptionsDto {
  format: "csv" | "excel" | "pdf";
  fields?: string[];
  filters?: Record<string, any>;
  includeHeaders?: boolean;
  fileName?: string;
}
