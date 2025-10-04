/**
 * Entity exports for Active ERP Modules
 * 
 * This file exports database entities for currently active modules only.
 * Organized by functional domains for better maintainability.
 * 
 * Active modules: UsersModule, InventoryModule, SalesModule, DashboardModule
 * Disabled modules: PurchasingModule, ReportsModule, PluginsModule
 */

// Base entity (used by all entities)
export { BaseEntity } from './base.entity';

// User Management (UsersModule)
export { User, UserRole, UserStatus } from './user.entity';

// Product Management (InventoryModule)
export { Category } from './category.entity';
export { Product, ProductType } from './product.entity';

// Customer Management (SalesModule, used by InventoryModule for pricing)
export { Customer, CustomerType, PriceLevel } from './customer.entity';

// Sales Management (SalesModule) - Temporarily disabled for startup
// export { SalesOrder, SalesOrderStatus, SalesOrderPriority } from './sales-order.entity';
// export { SalesOrderItem, SalesOrderItemStatus } from './sales-order-item.entity';

// Financial Management (SalesModule) - Temporarily disabled for startup
// export { Invoice, InvoiceStatus, InvoiceType } from './invoice.entity';
// export { Payment, PaymentMethod, PaymentStatus, PaymentType } from './payment.entity';

// Inventory Management (InventoryModule)
export { StockMovement, StockMovementType, StockMovementStatus } from './stock-movement.entity';

// Purchasing Management (PurchasingModule)
export { Supplier, SupplierType, SupplierStatus, SupplierRating } from './supplier.entity';
export { PurchaseOrder } from './purchase-order.entity';
export { PurchaseOrderItem } from './purchase-order-item.entity';
export { PurchaseRequisition } from './purchase-requisition.entity';
export { PurchaseRequisitionItem } from './purchase-requisition-item.entity';
export { GoodsReceivedNote } from './goods-received-note.entity';
export { SupplierInvoice } from './supplier-invoice.entity';
export { SupplierInvoiceItem } from './supplier-invoice-item.entity';

// Import entities for array construction
import { User } from './user.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { Customer } from './customer.entity';
// import { SalesOrder } from './sales-order.entity'; // Temporarily disabled for startup
// import { SalesOrderItem } from './sales-order-item.entity'; // Temporarily disabled for startup
// import { Invoice } from './invoice.entity'; // Temporarily disabled for startup
// import { Payment } from './payment.entity'; // Temporarily disabled for startup
import { StockMovement } from './stock-movement.entity';

/**
 * Array of active entity classes for TypeORM configuration
 * Use this array when configuring TypeORM in your application
 */
export const ACTIVE_ENTITIES = [
  // Core entities
  User,
  Category,
  Product,
  Customer,

  // Sales entities - Temporarily disabled for startup
  // SalesOrder,
  // SalesOrderItem,
  // Invoice,
  // Payment,

  // Inventory entities
  StockMovement,
] as const;

/**
 * Entity groups for active modules
 * Useful for feature-specific entity loading or testing
 */
export const ACTIVE_ENTITY_GROUPS = {
  CORE: [User, Category, Product, Customer],
  // SALES: [SalesOrder, SalesOrderItem, Invoice, Payment], // Temporarily disabled for startup
  INVENTORY: [StockMovement],
} as const;

/**
 * Entity metadata for active modules only
 * Used for documentation and tooling
 */
export const ACTIVE_ENTITY_METADATA = {
  User: {
    description: 'System users (authentication removed, audit only)',
    features: ['audit_tracking', 'user_management'],
    relationships: ['sales_orders', 'payments'],
    module: 'UsersModule',
  },
  Category: {
    description: 'Hierarchical product categorization (simplified)',
    features: ['tree_structure', 'hierarchy_path'],
    relationships: ['products'],
    module: 'InventoryModule',
  },
  Product: {
    description: 'Product catalog with barcode and inventory tracking',
    features: ['barcode_tracking', 'inventory_tracking', 'stock_management'],
    relationships: ['category', 'sales_items', 'stock_movements'],
    module: 'InventoryModule',
  },
  Customer: {
    description: 'Customer management with credit tracking and price levels',
    features: ['credit_management', 'price_levels', 'contact_management'],
    relationships: ['sales_orders', 'invoices', 'payments'],
    module: 'SalesModule',
  },
  SalesOrder: {
    description: 'Sales order management with comprehensive tracking',
    features: ['order_lifecycle', 'financial_calculations', 'status_tracking'],
    relationships: ['customer', 'items', 'invoices', 'created_by_user'],
    module: 'SalesModule',
  },
  SalesOrderItem: {
    description: 'Individual line items in sales orders',
    features: ['quantity_tracking', 'pricing_calculations', 'discount_support'],
    relationships: ['sales_order', 'product'],
    module: 'SalesModule',
  },
  Invoice: {
    description: 'Customer invoicing with payment tracking',
    features: ['payment_tracking', 'due_date_management', 'status_updates'],
    relationships: ['customer', 'sales_order', 'payments'],
    module: 'SalesModule',
  },
  Payment: {
    description: 'Payment recording with multiple payment methods',
    features: ['payment_methods', 'payment_tracking', 'receipt_generation'],
    relationships: ['customer', 'invoice', 'recorded_by_user'],
    module: 'SalesModule',
  },
  StockMovement: {
    description: 'Comprehensive inventory movement tracking',
    features: ['movement_types', 'audit_trail', 'quantity_tracking'],
    relationships: ['product', 'moved_by_user'],
    module: 'InventoryModule',
  },
} as const;

/**
 * Database performance indexes for active entities only
 * Key indexes for optimal query performance
 */
export const ACTIVE_PERFORMANCE_INDEXES = {
  // Most critical indexes for active entities
  CRITICAL: [
    'users.email',
    'users.username', 
    'products.barcode',
    'customers.customerCode',
    'sales_orders.orderNumber',
    'invoices.invoiceNumber',
    'payments.paymentNumber',
  ],
  
  // Important indexes for common queries in active modules
  IMPORTANT: [
    'products.categoryId_status_isActive',
    'sales_orders.customerId_status',
    'stock_movements.productId_movementType',
    'invoices.customerId_status_dueDate',
    'payments.customerId_invoiceId',
    'categories.parentId_isActive',
  ],
  
  // Analytics indexes for dashboard and reporting
  ANALYTICS: [
    'sales_orders.orderDate',
    'stock_movements.movementDate',
    'invoices.invoiceDate_dueDate',
    'payments.paymentDate',
    'products.createdAt_updatedAt',
  ],
} as const;

/**
 * Validation patterns for active entities
 * Common validation patterns used across active modules
 */
export const VALIDATION_PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/,
  BARCODE: /^[A-Z0-9\-_]{3,50}$/,  // Updated from SKU to BARCODE
  ORDER_NUMBER: /^[A-Z]{2,3}-[A-Z0-9\-]+$/,
  CUSTOMER_CODE: /^[A-Z]{2,4}-[0-9]{4,6}$/,
  INVOICE_NUMBER: /^INV-[A-Z0-9\-]+$/,
  PAYMENT_NUMBER: /^PAY-[A-Z0-9\-]+$/,
} as const;

// Export active entities as default for TypeORM configuration
export default ACTIVE_ENTITIES;