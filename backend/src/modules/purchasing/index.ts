/**
 * Purchasing Module Exports
 * 
 * This file exports all public components from the purchasing module
 * for easy importing throughout the application.
 */

// Module
export { PurchasingModule } from './purchasing.module';

// DTOs
export * from './dto';

// Services
export * from './services';

// Controllers
export * from './controllers';

// Interfaces and types
export interface PurchasingModuleConfig {
  defaultApprovalLevels: {
    purchaseOrder: number;
    purchaseRequisition: number;
    supplierInvoice: number;
  };
  creditLimits: {
    defaultSupplierCreditLimit: number;
    maxCreditLimitOverride: number;
  };
  approvalThresholds: {
    purchaseOrderApprovalThreshold: number;
    requisitionApprovalThreshold: number;
    invoiceApprovalThreshold: number;
  };
  qualityControl: {
    defaultInspectionRequired: boolean;
    qualityThreshold: number;
    deliveryToleranceDays: number;
  };
  notifications: {
    enableOverdueNotifications: boolean;
    enableApprovalNotifications: boolean;
    enableQualityIssueNotifications: boolean;
  };
}

export const DEFAULT_PURCHASING_CONFIG: PurchasingModuleConfig = {
  defaultApprovalLevels: {
    purchaseOrder: 1,
    purchaseRequisition: 1,
    supplierInvoice: 1,
  },
  creditLimits: {
    defaultSupplierCreditLimit: 50000,
    maxCreditLimitOverride: 500000,
  },
  approvalThresholds: {
    purchaseOrderApprovalThreshold: 10000,
    requisitionApprovalThreshold: 5000,
    invoiceApprovalThreshold: 10000,
  },
  qualityControl: {
    defaultInspectionRequired: true,
    qualityThreshold: 95, // 95% quality acceptance rate
    deliveryToleranceDays: 3,
  },
  notifications: {
    enableOverdueNotifications: true,
    enableApprovalNotifications: true,
    enableQualityIssueNotifications: true,
  },
};

// Purchasing workflow states
export enum PurchasingWorkflowStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Purchasing event types for audit logging
export enum PurchasingEventType {
  SUPPLIER_CREATED = 'supplier_created',
  SUPPLIER_UPDATED = 'supplier_updated',
  SUPPLIER_ACTIVATED = 'supplier_activated',
  SUPPLIER_SUSPENDED = 'supplier_suspended',
  SUPPLIER_PERFORMANCE_UPDATED = 'supplier_performance_updated',
  
  PURCHASE_ORDER_CREATED = 'purchase_order_created',
  PURCHASE_ORDER_APPROVED = 'purchase_order_approved',
  PURCHASE_ORDER_SENT = 'purchase_order_sent',
  PURCHASE_ORDER_ACKNOWLEDGED = 'purchase_order_acknowledged',
  PURCHASE_ORDER_RECEIVED = 'purchase_order_received',
  PURCHASE_ORDER_COMPLETED = 'purchase_order_completed',
  PURCHASE_ORDER_CANCELLED = 'purchase_order_cancelled',
  
  PURCHASE_REQUISITION_CREATED = 'purchase_requisition_created',
  PURCHASE_REQUISITION_SUBMITTED = 'purchase_requisition_submitted',
  PURCHASE_REQUISITION_APPROVED = 'purchase_requisition_approved',
  PURCHASE_REQUISITION_REJECTED = 'purchase_requisition_rejected',
  PURCHASE_REQUISITION_CONVERTED = 'purchase_requisition_converted',
  PURCHASE_REQUISITION_CANCELLED = 'purchase_requisition_cancelled',
  
  GRN_CREATED = 'grn_created',
  GRN_INSPECTED = 'grn_inspected',
  GRN_APPROVED = 'grn_approved',
  GRN_REJECTED = 'grn_rejected',
  
  SUPPLIER_INVOICE_RECEIVED = 'supplier_invoice_received',
  SUPPLIER_INVOICE_MATCHED = 'supplier_invoice_matched',
  SUPPLIER_INVOICE_APPROVED = 'supplier_invoice_approved',
  SUPPLIER_INVOICE_PAID = 'supplier_invoice_paid',
  SUPPLIER_INVOICE_DISPUTED = 'supplier_invoice_disputed',
}

// Permission constants for role-based access control
export const PURCHASING_PERMISSIONS = {
  SUPPLIER_CREATE: 'purchasing:supplier:create',
  SUPPLIER_READ: 'purchasing:supplier:read',
  SUPPLIER_UPDATE: 'purchasing:supplier:update',
  SUPPLIER_DELETE: 'purchasing:supplier:delete',
  SUPPLIER_ACTIVATE: 'purchasing:supplier:activate',
  SUPPLIER_SUSPEND: 'purchasing:supplier:suspend',
  
  PURCHASE_ORDER_CREATE: 'purchasing:po:create',
  PURCHASE_ORDER_READ: 'purchasing:po:read',
  PURCHASE_ORDER_UPDATE: 'purchasing:po:update',
  PURCHASE_ORDER_APPROVE: 'purchasing:po:approve',
  PURCHASE_ORDER_CANCEL: 'purchasing:po:cancel',
  
  PURCHASE_REQUISITION_CREATE: 'purchasing:pr:create',
  PURCHASE_REQUISITION_READ: 'purchasing:pr:read',
  PURCHASE_REQUISITION_UPDATE: 'purchasing:pr:update',
  PURCHASE_REQUISITION_APPROVE: 'purchasing:pr:approve',
  PURCHASE_REQUISITION_REJECT: 'purchasing:pr:reject',
  
  GRN_CREATE: 'purchasing:grn:create',
  GRN_READ: 'purchasing:grn:read',
  GRN_INSPECT: 'purchasing:grn:inspect',
  GRN_APPROVE: 'purchasing:grn:approve',
  
  SUPPLIER_INVOICE_CREATE: 'purchasing:invoice:create',
  SUPPLIER_INVOICE_READ: 'purchasing:invoice:read',
  SUPPLIER_INVOICE_MATCH: 'purchasing:invoice:match',
  SUPPLIER_INVOICE_APPROVE: 'purchasing:invoice:approve',
  SUPPLIER_INVOICE_PAY: 'purchasing:invoice:pay',
  
  PURCHASING_ANALYTICS: 'purchasing:analytics:read',
  PURCHASING_REPORTS: 'purchasing:reports:read',
} as const;

// Utility types
export type PurchasingPermission = typeof PURCHASING_PERMISSIONS[keyof typeof PURCHASING_PERMISSIONS];

export interface PurchasingUserPermissions {
  userId: string;
  permissions: PurchasingPermission[];
  approvalLimits: {
    purchaseOrderLimit: number;
    requisitionLimit: number;
    invoiceLimit: number;
  };
}