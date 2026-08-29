// Core types for the ERP system

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  phoneNumber?: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'suspended';
  isActive: boolean;
  lastLoginAt?: Date | string;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date | string;
  isLocked?: boolean;
  notes?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type UserRole =
  | 'admin'
  | 'manager'
  | 'sales_staff'
  | 'inventory_staff'
  | 'procurement_staff';

// Product and Inventory types
export interface Product {
  id: string;
  slug: string;
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
  priceListItems?: ProductPriceListItem[];
  // Stock status indicators
  isOutOfStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  isEnabled: boolean;
  description?: string;
  level: number;
  parentId?: string | null;
  fullPath: string;
  isRoot: boolean;
  hasChildren: boolean;
  children?: Category[];
  parent?: Partial<Category>;
  productCount?: number; // Number of products in this category
  isActive: boolean; // Soft delete flag from BaseEntity
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null; // For soft-deleted categories
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
  // Owner Equity (#1022). Paired: the reversal is a positive compensating
  // movement, not a reverseMovement(). Both carry referenceType 'owner_equity'.
  OWNER_DRAWING = 'owner_drawing',
  OWNER_DRAWING_REVERSAL = 'owner_drawing_reversal',
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
  liveStock?: number;
  stockBefore?: number | null;
  stockAfter?: number | null;
}

/**
 * Request-side item shape. Distinct from StockAdjustmentItem (the response),
 * which also carries the server-derived newQuantity. `difference` is the
 * command; the server derives newQuantity as oldQuantity + difference.
 */
export interface StockAdjustmentItemRequest {
  productId: string;
  oldQuantity: number;
  difference: number;
  unitCost?: number;
  notes?: string;
}

export interface CreateStockAdjustmentRequest {
  adjustmentDate: string;
  notes?: string;
  items: StockAdjustmentItemRequest[];
}

export interface UpdateStockAdjustmentRequest {
  adjustmentDate?: string;
  notes?: string;
  items?: StockAdjustmentItemRequest[];
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  adjustmentDate: string;
  status: 'draft' | 'completed';
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

export interface Customer {
  id: string;
  slug: string;
  type: CustomerType;
  name: string;
  phone?: string;
  email?: string;
  // Billing Address
  billingStreetAddress?: string;
  billingStreetAddress2?: string;
  billingCity?: string;
  billingState?: string;
  billingPostalCode?: string;
  billingCountry?: string;
  // Shipping Address
  shippingStreetAddress?: string;
  shippingStreetAddress2?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  // Business Information
  isActive: boolean;
  // Price List (normalized pricing system - January 2026)
  priceListId?: string;
  priceList?: PriceList;
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
  status: 'DRAFT' | 'READY' | 'FULFILLED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';
  orderNumber: string;
  customer?: Customer;
  customerId: string;
  items?: SalesOrderItem[];
  totalAmount: string;
  paidAmount: string;
  balanceDue?: string;
  isFulfilled?: boolean;
  isPaidInFull?: boolean;
  canFulfill?: boolean;
  canUnfulfill?: boolean;
  orderDate: Date;
  requiredDate?: Date;
  shippedDate?: Date;
  deliveredDate?: Date;
  fulfilledDate?: Date;
  fulfilledAt?: Date;
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
  subtotal?: number;
  shippingAmount?: number;
  // Legacy compatibility
  total?: number;
  discount?: number;
  deliveryDate?: Date;
  payments?: {
    id: string;
    amount: string;
    paymentDate: Date | string;
  }[];
}

export interface SalesOrderItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  totalAmount: number;
  discountType?: string;
  discountPercent?: number;
  discountAmount?: number;
  notes?: string;
}

export interface SalesOrderPayment {
  id: string;
  salesOrderId: string;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    name: string;
  };
  referenceNumber?: string;
  amount: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  salesOrderId?: string;
  salesOrder?: {
    id: string;
    orderNumber: string;
  };
  customer?: Customer;
  customerId?: string;
  customerName?: string;
  amount: string;
  method?: 'cash' | 'card' | 'bank_transfer' | 'cheque';
  paymentMethodId?: string;
  paymentMethodEntity?: PaymentMethodConfig;
  paymentMethod?:
    | 'cash'
    | 'card'
    | 'bank_transfer'
    | 'check'
    | 'credit_card'
    | 'debit_card'
    | 'online_payment'
    | 'mobile_payment'
    | 'other';
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
  slug: string;
  type: 'local' | 'international';
  companyName: string;
  isActive: boolean;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  billingStreetAddress?: string | null;
  billingStreetAddress2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  shippingStreetAddress?: string | null;
  shippingStreetAddress2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingPostalCode?: string | null;
  shippingCountry?: string | null;
  totalPurchases: number;
  totalOrders: number;
  averageOrderValue: number;
  lastPurchaseDate?: Date | string | null;
  firstPurchaseDate?: Date | string | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}

export type PurchaseOrderStatus = 'DRAFT' | 'READY' | 'RECEIVED' | 'CANCELLED';
export type PurchaseOrderPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID';

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier?: Supplier;
  supplierId?: string;
  status: PurchaseOrderStatus;
  paymentStatus: PurchaseOrderPaymentStatus;
  items?: PurchaseOrderItem[];
  total?: number;
  paidAmount: string;
  subtotal?: number;
  discountAmount?: number;
  shippingAmount?: number;
  totalAmount: string;
  orderDate: Date;
  deletedAt?: Date | string;
  expectedDate?: Date;
  receivedDate?: Date | null;
  notes?: string;
  vendorPayments?: Partial<VendorPayment>[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrderItem {
  id: string;
  product?: Product;
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice?: number;
  unitCost?: number;
  discountPercent?: number;
  discountAmount?: number;
  total?: number;
  totalAmount?: number;
  receivedQuantity?: number;
  status?: string;
}

export interface VendorPayment {
  id: string;
  supplier: Supplier;
  supplierId: string;
  purchaseOrder?: PurchaseOrder;
  purchaseOrderId?: string;
  amount: string;
  paymentDate: Date | string;
  paymentMethodId?: string;
  paymentMethodEntity?: PaymentMethodConfig;
  referenceNumber?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
}

export interface PaymentMethodConfig {
  id: string;
  code: string;
  name: string;
  useForPurchases: boolean;
  accountingChannel: 'CASH' | 'BANK';
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}


// Common types
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
    total: number;
    page?: number;
    limit?: number;
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

// Notification types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
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

// Audit Log types
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
  BULK_DELETE = 'BULK_DELETE',
  BULK_RESTORE = 'BULK_RESTORE',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
}

export interface AuditLog {
  id: string;
  userId: string;
  username?: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
  isActive: boolean;
}

// Price List types
export interface PriceList {
  id: string;
  code: string;
  name: string;
  description?: string;
  isDefault: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive: boolean;
  items?: PriceListItem[];
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
  priority?: number;
}

export interface ProductPriceListItem {
  id: string;
  priceListId: string;
  priceList?: PriceList;
  price: number;
}

export interface PriceListItem {
  id: string;
  priceListId: string;
  priceList?: PriceList;
  productId: string;
  product?: Product;
  price: number;
  costBasis?: number;
  marginPercent?: number;
  minQuantity: number;
  maxQuantity?: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
}

// Accounting types
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  isSystem: boolean;
  isPostable: boolean;
  openingBalance: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface AccountTreeNode extends Account {
  balance: string;
  children: AccountTreeNode[];
}

export interface AccountingSettings {
  id: boolean;
  cashAccountId: string;
  bankAccountId: string;
  inventoryAccountId: string;
  supplierDepositAccountId: string;
  customerDepositAccountId: string;
  openingBalanceEquityAccountId: string;
  ownerCapitalAccountId: string;
  ownerDrawingsAccountId: string;
  salesRevenueAccountId: string;
  cogsAccountId: string;
  defaultExpenseAccountId: string;
}

export type JournalEntryStatus = 'Posted' | 'Reversed';
export type AccountingSourceType = 'SALES_ORDER' | 'PURCHASE_ORDER' | 'STOCK_ADJUSTMENT' | 'OPENING_BALANCE' | 'EXPENSE' | 'OWNER_EQUITY';

export interface JournalEntry {
  id: string;
  journalNo: string;
  date: string;
  sourceRef: string | null;
  description: string | null;
  debit: string;
  credit: string;
  status: JournalEntryStatus;
}

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface JournalEntryDetail {
  id: string;
  journalNo: string;
  status: JournalEntryStatus;
  entryDate: string;
  sourceType: AccountingSourceType;
  sourceDocumentId: string | null;
  sourceRef: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  lines: JournalEntryLine[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
}

export interface GeneralLedgerAccount {
  id: string;
  code: string;
  name: string;
}

export interface GeneralLedgerMovement {
  /** Journal line id — stable row identity across pages. */
  id: string;
  date: string;
  journalEntryId: string;
  journalNo: string;
  description: string | null;
  debit: string;
  credit: string;
  balance: string;
  sourceType: AccountingSourceType;
  sourceDocumentId: string | null;
  sourceRef: string | null;
}

export interface GeneralLedgerResponse {
  account: GeneralLedgerAccount;
  /** Window-scoped: the whole filtered period, unaffected by pagination. */
  openingBalance: string;
  movements: GeneralLedgerMovement[];
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  /** Balance carried into `movements[0]`. Equals openingBalance when unpaginated. */
  pageOpeningBalance: string;
  /** Page-scoped totals. Deliberately NOT the window totals. */
  pageTotals: { debit: string; credit: string };
  meta: { total: number; page?: number; limit?: number };
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
}

export interface TrialBalanceResponse {
  rows: TrialBalanceRow[]
  totalDebit: string
  totalCredit: string
  difference: string
  balanced: boolean
}

export type PlSectionKey = 'revenue' | 'cogs' | 'otherIncome' | 'expenses'
export type PlMovementComponent = 'ordinary' | 'stockAdjustment'

export interface PlAccountRow {
  rowId: string
  accountId: string
  code: string
  name: string
  isPostable: boolean
  amount: string
  children: PlAccountRow[]
}

export interface PlSection {
  rowId: string
  key: PlSectionKey
  label: string
  rows: PlAccountRow[]
  total: string
  totalRowId: string
}

export interface PlAssignmentAnomaly {
  accountId: string
  code: string
  name: string
  component: PlMovementComponent
  count: number
}

export interface PlStructuralFault {
  kind: 'missingConfiguredAccount' | 'danglingParent' | 'parentCycle'
  settingKey: string | null
  accounts: Array<{ accountId: string; code: string; name: string }>
}

export interface PlIntegrity {
  anomalies: PlAssignmentAnomaly[]
  structuralFaults: PlStructuralFault[]
  tieOutOk: boolean
  independentNetProfit: string
}

export interface ProfitAndLossResponse {
  year: number
  availableYears: number[]
  sections: PlSection[]
  inventoryAdjustments: string
  inventoryAdjustmentsRowId: string
  /** Cost of Sales section total PLUS adjustments — render THIS, not section.total. */
  totalCostOfSales: string
  totalCostOfSalesRowId: string
  grossProfit: string
  netProfit: string
  integrity: PlIntegrity
}

export {
  type Expense,
  type ExpenseDocumentStatus,
  type ExpensePaymentStatus,
  type ExpensePaymentRow,
} from './expense.types'
// The Owner Equity block below is re-exported complete and stays that way.
// `src/types` is this app's public type surface: 124 files import from
// '@/types' and none import '@/types/ownerEquity.types' directly, so the
// barrel — not the source file — is what consumers see. Knip correctly
// reports that four of these twelve have no external consumer yet; that is an
// API-design exception, not a false positive, and it is suppressed narrowly
// via `ignoreIssues: { "src/types/index.ts": ["types"] }` in knip.json rather
// than by trimming the block. Re-exporting a partial set would leave an
// arbitrary hole that the next contributor fills back in. Keep this block
// mirroring ./ownerEquity.types in full.
export {
  type OwnerEquityDocument,
  type OwnerEquityDocumentStatus,
  type OwnerEquitySettlement,
  type OwnerEquitySettlementStatus,
  type OwnerEquityType,
  type OwnerEquityListParams,
  type CreateOwnerEquityRequest,
  type UpdateOwnerEquityRequest,
  type OwnerEquitySettlementLine,
  type SettleOwnerEquityRequest,
  type OwnerEquityRefundLine,
  type RefundOwnerEquityRequest,
} from './ownerEquity.types'
