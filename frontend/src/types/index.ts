// Core types for the ERP system

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}


export type UserRole = 'admin' | 'manager' | 'employee' | 'viewer';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
}

// Product and Inventory types
export interface Product {
  id: string;
  name: string;
  description?: string;
  barcode: string;
  type: 'Stocked Product' | 'Service';
  category?: Category;
  categoryId?: string;
  // Pricing
  baseCost: number;
  pricingTiers?: Record<string, number>; // Dynamic pricing tiers: { "Retail": 100.00, "Wholesale": 80.00, "VIP": 75.00 }
  // Stock management
  stockQuantity: number;
  isActive: boolean;
  notes?: string;
  // Stock status indicators
  isOutOfStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  path?: string | null;
  level: number;
  parentId?: string | null;
  fullPath: string;
  isRoot: boolean;
  hasChildren: boolean;
  children?: Category[];
  parent?: Partial<Category>;
  productCount?: number;  // Number of products in this category
  isActive: boolean;  // Soft delete flag from BaseEntity
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null; // For soft-deleted categories
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export enum StockMovementType {
  // Inward movements (increase stock)
  PURCHASE_RECEIPT = 'purchase_receipt',
  SALES_RETURN = 'sales_return',
  SALE_REVERSAL = 'sale_reversal', // Sales order unfulfillment
  PRODUCTION_RECEIPT = 'production_receipt',
  TRANSFER_IN = 'transfer_in',
  ADJUSTMENT_INCREASE = 'adjustment_increase',
  INITIAL_STOCK = 'initial_stock',
  // Outward movements (decrease stock)
  SALE = 'sale',
  PURCHASE_RETURN = 'purchase_return',
  PRODUCTION_CONSUMPTION = 'production_consumption',
  TRANSFER_OUT = 'transfer_out',
  ADJUSTMENT_DECREASE = 'adjustment_decrease',
  DAMAGE = 'damage',
  EXPIRY = 'expiry',
  THEFT = 'theft',
  LOSS = 'loss',
}

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  movementType: StockMovementType;
  movementDate: Date;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  unitValue?: number;
  totalValue?: number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  reason?: string;
  notes?: string;
  isInward: boolean;
  isOutward: boolean;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum StockAdjustmentStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface StockAdjustmentItem {
  id: string;
  product: {
    id: string;
    name: string;
    barcode?: string;
  };
  oldQuantity: number;
  newQuantity: number;
  difference: number;
  unitCost?: number;
  totalValue?: number;
  notes?: string;
  isIncrease: boolean;
  isDecrease: boolean;
  absoluteDifference: number;
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  adjustmentDate: Date;
  status: StockAdjustmentStatus;
  notes?: string;
  itemCount: number;
  totalValue: number;
  adjustedByUser?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  items?: StockAdjustmentItem[];
  isEditable?: boolean;
  canComplete?: boolean;
  canCancel?: boolean;
  createdAt: Date;
  updatedAt: Date;
}


// Sales types
export enum CustomerType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}


/**
 * @deprecated Use pricingScheme string instead
 * Kept for backward compatibility
 */
export enum PriceLevel {
  RETAIL = 'retail',
  WHOLESALE = 'wholesale',
  SPECIAL = 'special',
}

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  phone?: string;
  // Business Information
  isActive: boolean;
  pricingScheme: string; // Dynamic pricing scheme name (e.g., "Retail", "Wholesale", "VIP")
  // Customer Metrics
  totalSales: number;
  totalOrders: number;
  lastPurchaseDate?: Date;
  firstPurchaseDate?: Date;
  // Additional Information
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date; // Soft delete timestamp from BaseEntity
  // Computed properties
  averageOrderValue: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customer?: Customer;
  customerId: string;
  items?: SalesOrderItem[];
  totalAmount: number;
  paidAmount?: number;
  balanceDue?: number;
  isFulfilled?: boolean;
  isPaidInFull?: boolean;
  canFulfill?: boolean;
  canUnfulfill?: boolean;
  orderDate: Date;
  requiredDate?: Date;
  shippedDate?: Date;
  deliveredDate?: Date;
  fulfilledDate?: Date;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  shippingMethod?: string;
  trackingNumber?: string;
  customerPoNumber?: string;
  notes?: string;
  internalNotes?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  isOverdue?: boolean;
  isShippable?: boolean;
  isCompleted?: boolean;
  fullShippingAddress?: string;
  // Legacy compatibility
  total?: number;
  discount?: number;
  deliveryDate?: Date;
  // Invoice information
  invoices?: {
    id: string;
    invoiceNumber: string;
    status: string;
    invoiceDate: Date;
    totalAmount: number;
    paidAmount: number;
  }[];
}

export interface SalesOrderItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: Customer;
  salesOrder?: SalesOrder;
  total: number;
  paidAmount: number;
  dueAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: Date;
  paidDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  discountType?: 'percentage' | 'amount';
  discountPercent?: number;
  discount: number;
  taxRate: number;
  total: number;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    items?: InvoiceItem[];
  };
  invoiceId?: string;
  customer?: Customer;
  customerId?: string;
  customerName?: string;
  amount: number;
  method?: 'cash' | 'card' | 'bank_transfer' | 'cheque';
  paymentMethod?: 'cash' | 'card' | 'bank_transfer' | 'check' | 'credit_card' | 'debit_card' | 'online_payment' | 'mobile_payment' | 'other';
  reference?: string;
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  paymentDate: Date | string;
  notes?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
}

// Purchasing types
export enum SupplierType {
  LOCAL = 'local',
  INTERNATIONAL = 'international',
}

export interface Supplier {
  id: string;
  type: SupplierType;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  // Metrics
  totalPurchases: number;
  totalOrders: number;
  lastPurchaseDate?: Date;
  firstPurchaseDate?: Date;
  // Additional
  notes?: string;
  // Computed
  averageOrderValue?: number;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: Supplier;
  items: PurchaseOrderItem[];
  total: number;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  totalAmount?: number;
  orderDate: Date;
  expectedDate?: Date;
  receivedDate?: Date;
  notes?: string;
  goodsReceivedNotes?: Array<{
    id: string;
    grnNumber: string;
    status: string;
    receivedDate?: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrderItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  purchaseOrder: PurchaseOrder;
  supplier: Supplier;
  items: GRNItem[];
  status: 'draft' | 'received';
  receivedDate: Date;
  totalQuantityReceived?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GRNItem {
  id: string;
  product: Product;
  productName?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  purchaseOrderItem?: {
    id: string;
    product?: Product;
  };
}

export interface VendorPayment {
  id: string;
  paymentNumber: string;
  supplier: Supplier;
  supplierId: string;
  purchaseOrder?: PurchaseOrder;
  purchaseOrderId?: string;
  amount: number;
  paymentDate: Date | string;
  paymentMethod: 'cash' | 'bank_transfer' | 'check' | 'card';
  referenceNumber?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
}

// Common types
export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface DashboardStats {
  totalSales: number;
  totalPurchases: number;
  totalCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  pendingOrders: number;
  revenueGrowth: number;
  profitMargin: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
  }[];
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
  isActive?: boolean;
  categoryId?: string;
}

// Theme types
export interface ThemeConfig {
  mode: 'light' | 'dark';
  primaryColor: string;
  secondaryColor: string;
}

// Notification types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// WebSocket types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
}

export interface RealtimeUpdate {
  entity: string;
  action: 'created' | 'updated' | 'deleted';
  data: any;
}