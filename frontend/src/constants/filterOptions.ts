import type { FilterOption } from '@/types/filterBar.types'

type Options = readonly Readonly<FilterOption>[]

export const STATUS_OPTIONS: Options = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

export const USER_STATUS_OPTIONS: Options = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
] as const

export const CUSTOMER_TYPE_OPTIONS: Options = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
] as const

export const SUPPLIER_TYPE_OPTIONS: Options = [
  { value: 'local', label: 'Local' },
  { value: 'international', label: 'International' },
] as const

export const ROLE_OPTIONS: Options = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales_staff', label: 'Sales Staff' },
  { value: 'inventory_staff', label: 'Inventory Staff' },
  { value: 'procurement_staff', label: 'Procurement Staff' },
] as const

export const STOCK_ADJUSTMENT_STATUS_OPTIONS: Options = [
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
] as const

export const STOCK_STATUS_OPTIONS: Options = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
] as const

export const ORDER_STATUS_OPTIONS: Options = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Ready' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

export const FULFILLMENT_STATUS_OPTIONS: Options = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
] as const

export const PURCHASE_ORDER_STATUS_OPTIONS: Options = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Ready' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

export const PURCHASING_ACTIVITY_STATUS_OPTIONS: Options = [
  { value: 'received', label: 'Received' },
  { value: 'pending', label: 'Pending' },
] as const

export const ACCOUNT_TYPE_OPTIONS: Options = [
  { value: 'Asset', label: 'Asset' },
  { value: 'Liability', label: 'Liability' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Income', label: 'Income' },
  { value: 'Expense', label: 'Expense' },
] as const

/**
 * Mirrors the backend AccountingSourceType enum, in declaration order. Shared
 * by Journal Entries and the General Ledger: both filter the same source types,
 * so a second copy only drifts (#1142 -- EXPENSE was missing here for both).
 */
export const JOURNAL_SOURCE_TYPE_OPTIONS: Options = [
  { value: 'SALES_ORDER', label: 'Sales Order' },
  { value: 'PURCHASE_ORDER', label: 'Purchase Order' },
  { value: 'STOCK_ADJUSTMENT', label: 'Stock Adjustment' },
  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'OWNER_EQUITY', label: 'Owner Equity' },
] as const

export const JOURNAL_STATUS_OPTIONS: Options = [
  { value: 'Posted', label: 'Posted' },
  { value: 'Reversed', label: 'Reversed' },
] as const

export const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'Previous Period' },
  { value: 'last_month', label: 'Same Period Last Month' },
  { value: 'last_year', label: 'Same Period Last Year' },
]
