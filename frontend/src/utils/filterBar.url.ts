import { PERIOD_KEYS, type PeriodKey } from '@/constants/periods'
import { JournalEntryStatus } from '@/types'
import type {
  FilterBarConfig,
  FilterFieldConfig,
  PeriodValue,
} from '@/types/filterBar.types'

function prefixed(key: string, namespace?: string): string {
  return namespace ? `${namespace}_${key}` : key
}

function effectiveKey<TFilters>(field: FilterFieldConfig<TFilters>, namespace?: string): string {
  const base = field.paramKey ?? String(field.field)
  return prefixed(base, namespace)
}

export function getManagedParamKeys<TFilters>(
  config: FilterBarConfig<TFilters>,
): string[] {
  const ns = config.namespace
  const keys: string[] = []

  if (config.search) {
    keys.push(prefixed(config.search.paramKey ?? 'search', ns))
  }

  for (const field of config.fields) {
    const key = effectiveKey(field, ns)
    keys.push(key)
    if (field.type === 'period') {
      keys.push(`${key}_from`)
      keys.push(`${key}_to`)
    }
  }

  return keys
}

export function serializeFilters<TFilters extends object>(
  filters: TFilters,
  config: FilterBarConfig<TFilters>,
  currentSearchParams: URLSearchParams,
): URLSearchParams {
  const ns = config.namespace
  const result = new URLSearchParams(currentSearchParams)

  for (const key of getManagedParamKeys(config)) {
    result.delete(key)
  }

  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const orderedEntries: Array<[string, string]> = []

  if (config.search) {
    const searchKey = prefixed(config.search.paramKey ?? 'search', ns)
    const searchValue = ((filters as Record<string, unknown>).search as string | undefined) ?? ''
    const defaultSearch = (defaults.search as string | undefined) ?? ''
    if (searchValue && searchValue !== defaultSearch) {
      orderedEntries.push([searchKey, searchValue])
    }
  }

  for (const field of config.fields) {
    const key = effectiveKey(field, ns)
    const value = filters[field.field]
    const defaultValue = defaults[String(field.field)]
    const isSingleValueField =
      field.type === 'status' ||
      field.type === 'user-status' ||
      field.type === 'customer-type' ||
      field.type === 'supplier-type' ||
      field.type === 'role' ||
      field.type === 'stock-adjustment-status' ||
      field.type === 'customer' ||
      field.type === 'order-status' ||
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'purchasing-status' ||
      field.type === 'category' ||
      field.type === 'product-type' ||
      field.type === 'stock-status' ||
      field.type === 'price-list' ||
      field.type === 'transaction-status' ||
      field.type === 'vendor-payment-status' ||
      field.type === 'journal-entry-status' ||
      field.type === 'journal-entry-type' ||
      field.type === 'expense-status' ||
      field.type === 'owner-equity-type' ||
      field.type === 'fiscal-period-status' ||
      field.type === 'bank-reconciliation-status' ||
      field.type === 'settlement-status' ||
      field.type === 'fund-transfer-status' ||
      field.type === 'account-type'

    if (isSingleValueField) {
      if (value !== null && value !== undefined && value !== defaultValue) {
        orderedEntries.push([key, String(value)])
      }
      continue
    }

    if (field.type === 'period') {
      const period = value as PeriodValue | undefined
      const defaultPeriod = defaultValue as PeriodValue | undefined
      const defaultKey = defaultPeriod?.key ?? null
      const defaultFrom = defaultPeriod?.from ?? null
      const defaultTo = defaultPeriod?.to ?? null
      const isDefault =
        !period ||
        (period.key === defaultKey && period.from === defaultFrom && period.to === defaultTo)
      if (isDefault) continue
      if (period.key === null) continue
      orderedEntries.push([key, period.key])
      if (period.key === 'custom' && period.from && period.to) {
        orderedEntries.push([`${key}_from`, period.from])
        orderedEntries.push([`${key}_to`, period.to])
      }
      continue
    }

    if (field.type === 'compare') {
      if (value !== null && value !== undefined) {
        orderedEntries.push([key, String(value)])
      }
      continue
    }
  }

  for (const [key, value] of orderedEntries) {
    result.append(key, value)
  }

  return result
}

export function parseFilters<TFilters extends object>(
  searchParams: URLSearchParams,
  config: FilterBarConfig<TFilters>,
): TFilters {
  const ns = config.namespace
  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if (config.search) {
    const searchKey = prefixed(config.search.paramKey ?? 'search', ns)
    result.search = searchParams.get(searchKey) ?? (defaults.search ?? '')
  }

  for (const field of config.fields) {
    const key = effectiveKey(field, ns)
    const fieldKey = String(field.field)
    const defaultValue = defaults[fieldKey]
    const isSingleValueField =
      field.type === 'status' ||
      field.type === 'user-status' ||
      field.type === 'customer-type' ||
      field.type === 'supplier-type' ||
      field.type === 'role' ||
      field.type === 'stock-adjustment-status' ||
      field.type === 'customer' ||
      field.type === 'order-status' ||
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'purchasing-status' ||
      field.type === 'category' ||
      field.type === 'product-type' ||
      field.type === 'stock-status' ||
      field.type === 'price-list' ||
      field.type === 'transaction-status' ||
      field.type === 'vendor-payment-status' ||
      field.type === 'journal-entry-status' ||
      field.type === 'journal-entry-type' ||
      field.type === 'expense-status' ||
      field.type === 'owner-equity-type' ||
      field.type === 'fiscal-period-status' ||
      field.type === 'bank-reconciliation-status' ||
      field.type === 'settlement-status' ||
      field.type === 'fund-transfer-status' ||
      field.type === 'account-type'

    if (isSingleValueField) {
      const raw = searchParams.get(key)
      if (raw === null) {
        result[fieldKey] = defaultValue ?? null
      } else if (field.type === 'status') {
        const VALID_STATUS = ['active', 'inactive']
        result[fieldKey] = VALID_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'user-status') {
        const VALID_USER_STATUS = ['active', 'inactive', 'suspended']
        result[fieldKey] = VALID_USER_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'customer-type') {
        const VALID_CUSTOMER_TYPE = ['individual', 'business']
        result[fieldKey] = VALID_CUSTOMER_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'supplier-type') {
        const VALID_SUPPLIER_TYPE = ['local', 'international']
        result[fieldKey] = VALID_SUPPLIER_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'role') {
        const VALID_ROLE = ['admin', 'manager', 'sales_staff', 'inventory_staff', 'procurement_staff']
        result[fieldKey] = VALID_ROLE.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'stock-adjustment-status') {
        const VALID_STOCK_ADJUSTMENT_STATUS = ['draft', 'completed']
        result[fieldKey] = VALID_STOCK_ADJUSTMENT_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'order-status') {
        const VALID_ORDER_STATUS = fieldKey === 'status'
          ? ['DRAFT', 'READY', 'FULFILLED', 'CANCELLED']
          : ['fulfilled', 'unfulfilled']
        result[fieldKey] = VALID_ORDER_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'purchasing-status') {
        const VALID_PURCHASING_STATUS = ['DRAFT', 'READY', 'RECEIVED', 'CANCELLED', 'draft', 'received']
        result[fieldKey] = VALID_PURCHASING_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'vendor-payment-status') {
        const VALID_VENDOR_PAYMENT_STATUS = ['pending', 'completed', 'cancelled']
        result[fieldKey] = VALID_VENDOR_PAYMENT_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'payment-status') {
        const VALID_PAYMENT_STATUS = ['unpaid', 'partial', 'paid', 'overpaid', 'UNPAID', 'PARTIAL', 'PAID', 'OVERPAID']
        result[fieldKey] = VALID_PAYMENT_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'product-type') {
        const VALID_PRODUCT_TYPE = ['goods', 'service']
        result[fieldKey] = VALID_PRODUCT_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'stock-status') {
        const VALID_STOCK_STATUS = ['in_stock', 'low_stock', 'out_of_stock']
        result[fieldKey] = VALID_STOCK_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'transaction-status') {
        const VALID_TRANSACTION_STATUS = ['completed', 'pending', 'failed', 'cancelled', 'refunded']
        result[fieldKey] = VALID_TRANSACTION_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'journal-entry-status') {
        const VALID_JOURNAL_ENTRY_STATUS = ['draft', 'posted', 'reversed', JournalEntryStatus.DRAFT, JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED]
        result[fieldKey] = VALID_JOURNAL_ENTRY_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'journal-entry-type') {
        const VALID_JOURNAL_ENTRY_TYPE = ['manual', 'sales_order', 'payment', 'settlement', 'goods_received_note', 'vendor_payment', 'stock_adjustment', 'owner_equity_transaction', 'expense', 'opening_balance', 'fund_transfer']
        result[fieldKey] = VALID_JOURNAL_ENTRY_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'expense-status') {
        const VALID_EXPENSE_STATUS = ['draft', 'posted']
        result[fieldKey] = VALID_EXPENSE_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'owner-equity-type') {
        const VALID_OWNER_EQUITY_TYPE = ['capital_injection', 'owner_drawing']
        result[fieldKey] = VALID_OWNER_EQUITY_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'fiscal-period-status') {
        const VALID_FISCAL_PERIOD_STATUS = ['open', 'closed', 'OPEN', 'CLOSED']
        result[fieldKey] = VALID_FISCAL_PERIOD_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'bank-reconciliation-status') {
        const VALID_BANK_RECONCILIATION_STATUS = ['in_progress', 'completed']
        result[fieldKey] = VALID_BANK_RECONCILIATION_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'settlement-status') {
        const VALID_SETTLEMENT_STATUS = ['draft', 'posted', 'reversed']
        result[fieldKey] = VALID_SETTLEMENT_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'fund-transfer-status') {
        const VALID_FUND_TRANSFER_STATUS = ['ACTIVE', 'CANCELLED']
        result[fieldKey] = VALID_FUND_TRANSFER_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'account-type') {
        const VALID_ACCOUNT_TYPE = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
        result[fieldKey] = VALID_ACCOUNT_TYPE.includes(raw) ? raw : (defaultValue ?? null)
      } else {
        result[fieldKey] = raw
      }
      continue
    }

    if (field.type === 'period') {
      const defaultPeriod = (defaultValue as PeriodValue | undefined) ?? {
        key: null,
        from: null,
        to: null,
      } satisfies PeriodValue
      const raw = searchParams.get(key)
      if (raw === '') {
        result[fieldKey] = { key: null, from: null, to: null } satisfies PeriodValue
        continue
      }
      if (raw === null || !(PERIOD_KEYS as readonly string[]).includes(raw)) {
        result[fieldKey] = defaultPeriod
        continue
      }

      const periodKey = raw as PeriodKey
      if (periodKey === 'custom') {
        result[fieldKey] = {
          key: 'custom',
          from: searchParams.get(`${key}_from`) ?? null,
          to: searchParams.get(`${key}_to`) ?? null,
        } satisfies PeriodValue
      } else {
        result[fieldKey] = { key: periodKey, from: null, to: null } satisfies PeriodValue
      }
      continue
    }

    if (field.type === 'compare') {
      const validCompares = ['previous_period', 'last_month', 'last_year']
      const raw = searchParams.get(key)
      result[fieldKey] = raw && validCompares.includes(raw) ? raw : (defaultValue ?? null)
    }
  }

  return result as TFilters
}
