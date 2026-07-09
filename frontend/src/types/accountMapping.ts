export interface AccountMapping {
  id: string;
  mappingType: string;
  accountId: string;
  description?: string;
  isActive: boolean;
  account?: {
    id: string;
    code: string;
    name: string;
    accountType: string;
  };
  createdAt: string;
  updatedAt: string;
}

export enum MappingType {
  SALES_REVENUE = 'sales_revenue',
  SALES_AR = 'sales_ar',
  SALES_COGS = 'sales_cogs',
  SALES_INVENTORY = 'sales_inventory',
  PURCHASE_INVENTORY = 'purchase_inventory',
  PURCHASE_AP = 'purchase_ap',
  PAYMENT_AR = 'payment_ar',
  VENDOR_PAYMENT_AP = 'vendor_payment_ap',
  EQUITY_OWNERS_EQUITY = 'equity_owners_equity',
  EQUITY_DRAWINGS = 'equity_drawings',
  INVENTORY_ASSET = 'inventory_asset',
  INVENTORY_ADJUSTMENT_GAIN = 'inventory_adjustment_gain',
  INVENTORY_ADJUSTMENT_LOSS = 'inventory_adjustment_loss',
  OPENING_BALANCE_EQUITY = 'opening_balance_equity',
}

export interface CreateAccountMappingDto {
  mappingType: string;
  accountId: string;
  description?: string;
}

export interface UpdateAccountMappingDto {
  accountId?: string;
  description?: string;
  isActive?: boolean;
}

export interface AccountMappingValidationResult {
  isValid: boolean;
  missingMappings: string[];
  configuredMappings: string[];
  totalRequired: number;
  totalConfigured: number;
}
