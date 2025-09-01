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
  type: 'goods' | 'service';
  category?: Category;
  categoryId?: string;
  // Multi-level pricing
  baseCost: number;
  retailPrice: number;
  wholesalePrice: number;
  specialPrice: number;
  // Legacy price fields for backwards compatibility
  price?: number;
  cost?: number;
  // Stock management
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  optimalStockLevel: number;
  stockStatus: string;
  // Legacy stock fields for backwards compatibility
  stock?: number;
  minStock?: number;
  maxStock?: number;
  unit: string;
  isActive: boolean;
  // Additional properties
  weight?: number;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
  brand?: string;
  model?: string;
  imageUrl?: string;
  images?: string[];
  additionalImages?: string[];
  attributes?: ProductAttribute[] | Record<string, any>;
  notes?: string;
  // Stock status indicators
  isLowStock: boolean;
  isOutOfStock: boolean;
  // Margin calculations
  grossMarginRetail: number;
  grossMarginWholesale: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
  path?: string | null;
  level: number;
  parentId?: string | null;
  fullPath: string;
  isRoot: boolean;
  hasChildren: boolean;
  children?: Category[];
  parent?: Partial<Category>;
  productCount?: number;  // Number of products in this category
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reference?: string;
  reason?: string;
  createdAt: Date;
}

// Sales types
export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  taxId?: string;
  paymentTerms?: string;
  creditLimit?: number;
  currentBalance?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customer: Customer;
  items: SalesOrderItem[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  status: 'draft' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  orderDate: Date;
  deliveryDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
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
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  total: number;
}

export interface Payment {
  id: string;
  invoice?: Invoice;
  customer: Customer;
  amount: number;
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque';
  reference?: string;
  status: 'pending' | 'completed' | 'failed';
  paymentDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Purchasing types
export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  taxId?: string;
  paymentTerms?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: Supplier;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  status: 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled';
  orderDate: Date;
  expectedDate?: Date;
  receivedDate?: Date;
  notes?: string;
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
  status: 'draft' | 'completed';
  receivedDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GRNItem {
  id: string;
  product: Product;
  orderedQuantity: number;
  receivedQuantity: number;
  damagedQuantity?: number;
  notes?: string;
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