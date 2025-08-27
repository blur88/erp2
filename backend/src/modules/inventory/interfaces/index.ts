// Integration interfaces
export interface InventoryIntegration {
  // Sales order integration
  processSalesOrder(orderId: string, items: any[]): Promise<any>;
  fulfillSalesOrder(orderId: string, items: any[]): Promise<void>;
  
  // Purchase order integration
  processPurchaseOrder(orderId: string, items: any[]): Promise<any>;
  receivePurchaseOrder(orderId: string, items: any[]): Promise<void>;
  
  // Stock availability
  checkStockAvailability(items: any[]): Promise<any[]>;
  reserveStock(items: any[], reason: string): Promise<any>;
  releaseStock(items: any[], reason: string): Promise<void>;
}

// Pricing interfaces
export interface PricingCalculation {
  productId: string;
  basePrice: number;
  finalPrice: number;
  discounts: any[];
  priceType: 'retail' | 'wholesale' | 'special';
}

// Stock summary interfaces
export interface StockSummary {
  productId: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  reorderLevel: number;
  stockValue: number;
}

// Audit interfaces
export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}