import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}

export type FilterFieldType =
  | 'status'
  | 'user-status'
  | 'customer-type'
  | 'supplier-type'
  | 'role'
  | 'stock-adjustment-status'
  | 'period'
  | 'compare'
  | 'customer'
  | 'order-status'
  | 'payment-status'
  | 'supplier'
  | 'purchasing-status'
  | 'category'
  | 'product-type'
  | 'stock-status'
  | 'price-list'
  | 'transaction-status'
  | 'vendor-payment-status'
  | 'payment-method'

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

export interface StatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'status'
}

export interface CustomerTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'customer-type'
}

export interface SupplierTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'supplier-type'
}

export interface UserStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'user-status'
}

export interface RoleFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'role'
}

export interface StockAdjustmentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'stock-adjustment-status'
}

export interface PeriodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'period'
}

export interface CompareFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'compare'
}

export interface CustomerFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'customer'
}

export interface OrderStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'order-status'
}

export interface PaymentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'payment-status'
  includeOverpaid?: boolean
  valueCase?: 'lower' | 'upper'
}

export interface SupplierFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'supplier'
}

export interface PurchasingStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'purchasing-status'
}

export interface CategoryFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'category'
}

export interface ProductTypeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'product-type'
}

export interface StockStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'stock-status'
}

export interface PriceListFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'price-list'
}

export interface TransactionStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'transaction-status'
}

export interface VendorPaymentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'vendor-payment-status'
}

export interface PaymentMethodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'payment-method'
}

export type FilterFieldConfig<TFilters> =
  | StatusFilterFieldConfig<TFilters, keyof TFilters>
  | UserStatusFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerTypeFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierTypeFilterFieldConfig<TFilters, keyof TFilters>
  | RoleFilterFieldConfig<TFilters, keyof TFilters>
  | StockAdjustmentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerFilterFieldConfig<TFilters, keyof TFilters>
  | OrderStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierFilterFieldConfig<TFilters, keyof TFilters>
  | PurchasingStatusFilterFieldConfig<TFilters, keyof TFilters>
  | CategoryFilterFieldConfig<TFilters, keyof TFilters>
  | ProductTypeFilterFieldConfig<TFilters, keyof TFilters>
  | StockStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PriceListFilterFieldConfig<TFilters, keyof TFilters>
  | TransactionStatusFilterFieldConfig<TFilters, keyof TFilters>
  | VendorPaymentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentMethodFilterFieldConfig<TFilters, keyof TFilters>

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  fields: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
  namespace?: string
}

export interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void
  onSearchCommit: () => void
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void
  onClearField: (field: keyof TFilters) => void
  onClearAll: () => void
}

export interface FilterBarSortConfig {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}
