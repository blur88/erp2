/**
 * Entity exports for ERP System
 * 
 * This file exports all database entities for easy importing throughout the application.
 * Organized by functional domains for better maintainability.
 */

// Base entity
export { BaseEntity } from './base.entity';

// User Management
export { User, UserRole, UserStatus } from './user.entity';

// Product Management
export { Category } from './category.entity';
export { Product, ProductType, ProductStatus, StockStatus } from './product.entity';

// Customer Management  
export { Customer, CustomerType, CustomerStatus, PriceLevel } from './customer.entity';

// Supplier Management
export { Supplier, SupplierType, SupplierStatus, SupplierRating } from './supplier.entity';

// Sales Management
export { SalesOrder, SalesOrderStatus, SalesOrderPriority } from './sales-order.entity';
export { SalesOrderItem, SalesOrderItemStatus } from './sales-order-item.entity';

// Financial Management
export { Invoice, InvoiceStatus, InvoiceType } from './invoice.entity';
export { Payment, PaymentMethod, PaymentStatus, PaymentType } from './payment.entity';

// Purchasing Management
export { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderPriority } from './purchase-order.entity';
export { PurchaseOrderItem, PurchaseOrderItemStatus } from './purchase-order-item.entity';
export { PurchaseRequisition, PurchaseRequisitionStatus, PurchaseRequisitionPriority, PurchaseRequisitionType } from './purchase-requisition.entity';
export { PurchaseRequisitionItem, PurchaseRequisitionItemStatus } from './purchase-requisition-item.entity';
export { GoodsReceivedNote, GrnStatus, GrnType } from './goods-received-note.entity';
export { SupplierInvoice, SupplierInvoiceStatus, SupplierInvoiceType, InvoiceMatchingStatus } from './supplier-invoice.entity';
export { SupplierInvoiceItem } from './supplier-invoice-item.entity';

// Inventory Management
export { StockMovement, StockMovementType, StockMovementStatus } from './stock-movement.entity';
export { StockAdjustment, StockAdjustmentType, StockAdjustmentStatus } from './stock-adjustment.entity';

// System Management
export { Plugin, PluginStatus, PluginType } from './plugin.entity';

/**
 * Array of all entity classes for TypeORM configuration
 * Use this array when configuring TypeORM in your application
 * Note: Temporarily commented out due to TypeScript compilation issues
 */
// export const ALL_ENTITIES = [
//   // Core entities
//   User,
//   Category,
//   Product,
//   Customer,
//   Supplier,
//   
//   // Transaction entities
//   SalesOrder,
//   SalesOrderItem,
//   Invoice,
//   Payment,
//   PurchaseOrder,
//   PurchaseOrderItem,
//   PurchaseRequisition,
//   PurchaseRequisitionItem,
//   GoodsReceivedNote,
//   SupplierInvoice,
//   SupplierInvoiceItem,
//   
//   // Inventory entities
//   StockMovement,
//   StockAdjustment,
//   
//   // System entities
//   Plugin,
// ] as const;

/**
 * Entity groups for modular loading
 * Useful for feature-specific entity loading or testing
 * Note: Temporarily commented out due to TypeScript compilation issues
 */
// export const ENTITY_GROUPS = {
//   CORE: [User, Category, Product, Customer, Supplier],
//   SALES: [SalesOrder, SalesOrderItem, Invoice, Payment],
//   PURCHASING: [PurchaseOrder, PurchaseOrderItem, PurchaseRequisition, PurchaseRequisitionItem, GoodsReceivedNote, SupplierInvoice, SupplierInvoiceItem],
//   INVENTORY: [StockMovement, StockAdjustment],
//   SYSTEM: [Plugin],
// } as const;

/**
 * Entity metadata for documentation and tooling
 */
export const ENTITY_METADATA = {
  User: {
    description: 'System users with role-based access control',
    features: ['authentication', 'authorization', 'audit_tracking'],
    relationships: ['sales_orders', 'purchase_orders', 'stock_adjustments', 'payments'],
  },
  Category: {
    description: 'Hierarchical product categorization system',
    features: ['tree_structure', 'materialized_path', 'nested_categories'],
    relationships: ['products'],
  },
  Product: {
    description: 'Product catalog with multi-level pricing and inventory tracking',
    features: ['multi_level_pricing', 'inventory_tracking', 'stock_management'],
    relationships: ['category', 'sales_items', 'purchase_items', 'stock_movements'],
  },
  Customer: {
    description: 'Customer management with credit tracking and price levels',
    features: ['credit_management', 'price_levels', 'address_management'],
    relationships: ['sales_orders', 'invoices', 'payments'],
  },
  Supplier: {
    description: 'Supplier management with performance tracking',
    features: ['performance_metrics', 'rating_system', 'delivery_tracking'],
    relationships: ['purchase_orders', 'goods_received_notes'],
  },
  SalesOrder: {
    description: 'Sales order management with comprehensive tracking',
    features: ['order_lifecycle', 'shipping_tracking', 'financial_calculations'],
    relationships: ['customer', 'items', 'invoices', 'created_by_user'],
  },
  SalesOrderItem: {
    description: 'Individual line items in sales orders',
    features: ['quantity_tracking', 'pricing_history', 'profit_analysis'],
    relationships: ['sales_order', 'product'],
  },
  Invoice: {
    description: 'Customer invoicing with payment tracking',
    features: ['payment_tracking', 'overdue_management', 'tax_calculations'],
    relationships: ['customer', 'sales_order', 'payments'],
  },
  Payment: {
    description: 'Payment recording with multiple payment methods',
    features: ['multi_currency', 'payment_processors', 'refund_handling'],
    relationships: ['customer', 'invoice', 'recorded_by_user'],
  },
  PurchaseOrder: {
    description: 'Purchase order management with approval workflow',
    features: ['approval_workflow', 'delivery_tracking', 'financial_calculations'],
    relationships: ['supplier', 'items', 'goods_received_notes', 'created_by_user'],
  },
  PurchaseOrderItem: {
    description: 'Individual line items in purchase orders',
    features: ['quality_inspection', 'delivery_performance', 'cost_tracking'],
    relationships: ['purchase_order', 'product'],
  },
  GoodsReceivedNote: {
    description: 'Goods receipt tracking with quality inspection',
    features: ['quality_inspection', 'delivery_validation', 'batch_tracking'],
    relationships: ['purchase_order', 'supplier', 'received_by_user'],
  },
  StockMovement: {
    description: 'Comprehensive inventory movement tracking',
    features: ['movement_types', 'audit_trail', 'batch_tracking', 'valuation'],
    relationships: ['product', 'moved_by_user'],
  },
  StockAdjustment: {
    description: 'Manual stock corrections with approval workflow',
    features: ['approval_workflow', 'physical_count', 'variance_analysis'],
    relationships: ['product', 'adjusted_by_user', 'approved_by_user'],
  },
  Plugin: {
    description: 'Plugin system for ERP extensibility',
    features: ['lifecycle_management', 'configuration', 'performance_monitoring'],
    relationships: [],
  },
} as const;

/**
 * Database performance indexes summary
 * Key indexes for optimal query performance
 */
export const PERFORMANCE_INDEXES = {
  // Most critical indexes for query performance
  CRITICAL: [
    'users.email',
    'users.username', 
    'products.sku',
    'customers.customerCode',
    'suppliers.supplierCode',
    'sales_orders.orderNumber',
    'purchase_orders.orderNumber',
    'invoices.invoiceNumber',
    'payments.paymentNumber',
  ],
  
  // Important indexes for common queries
  IMPORTANT: [
    'products.categoryId_status_isActive',
    'sales_orders.customerId_status',
    'purchase_orders.supplierId_status',
    'stock_movements.productId_movementType',
    'invoices.customerId_status_dueDate',
    'payments.customerId_invoiceId',
  ],
  
  // Useful indexes for reporting and analytics
  ANALYTICS: [
    'sales_orders.orderDate',
    'purchase_orders.orderDate',
    'stock_movements.movementDate',
    'invoices.invoiceDate_dueDate',
    'products.stockQuantity_reorderLevel',
  ],
} as const;

/**
 * Entity validation rules summary
 * Common validation patterns used across entities
 */
export const VALIDATION_PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/,
  SKU: /^[A-Z0-9\-_]{3,50}$/,
  ORDER_NUMBER: /^[A-Z]{2,3}-[A-Z0-9\-]+$/,
} as const;

// export default ALL_ENTITIES; // Temporarily commented out due to compilation issues