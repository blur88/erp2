import { PERIOD_KEYS, type PeriodKey } from '@/constants/periods'
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
      field.type === 'select' ||
      field.type === 'customer' ||
      field.type === 'order-status' ||
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'purchasing-status' ||
      field.type === 'category' ||
      field.type === 'product-type' ||
      field.type === 'stock-status'

    if (isSingleValueField) {
      if (value !== null && value !== undefined && value !== defaultValue) {
        orderedEntries.push([key, String(value)])
      }
      continue
    }

    if (field.type === 'multi-select') {
      for (const item of (value as string[] | undefined) ?? []) {
        orderedEntries.push([key, item])
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
      field.type === 'select' ||
      field.type === 'customer' ||
      field.type === 'order-status' ||
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'purchasing-status' ||
      field.type === 'category' ||
      field.type === 'product-type' ||
      field.type === 'stock-status'

    if (isSingleValueField) {
      const raw = searchParams.get(key)
      if (raw === null) {
        result[fieldKey] = defaultValue ?? null
      } else if (field.type === 'select') {
        // Validate against declared options so stale/hand-crafted URLs can't inject unknown values.
        const valid = field.options.find((option) => option.value === raw)
        result[fieldKey] = valid ? raw : (defaultValue ?? null)
      } else if (field.type === 'order-status') {
        // Fixed value set — validate to prevent bogus URL values reaching the API.
        const VALID_ORDER_STATUS = ['fulfilled', 'unfulfilled']
        result[fieldKey] = VALID_ORDER_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'purchasing-status') {
        const VALID_PURCHASING_STATUS = ['pending', 'received']
        result[fieldKey] = VALID_PURCHASING_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else if (field.type === 'payment-status') {
        // Fixed value set — validate to prevent bogus URL values reaching the API.
        const VALID_PAYMENT_STATUS = ['unpaid', 'partial', 'paid', 'overpaid']
        result[fieldKey] = VALID_PAYMENT_STATUS.includes(raw) ? raw : (defaultValue ?? null)
      } else {
        // These field types are free-form identifiers or page-level mapped values with no option list to validate against.
        result[fieldKey] = raw
      }
      continue
    }

    if (field.type === 'multi-select') {
      const validOptions = new Set(field.options.map((option) => option.value))
      result[fieldKey] = searchParams.getAll(key).filter((value) => validOptions.has(value))
      continue
    }

    if (field.type === 'period') {
      const defaultPeriod = (defaultValue as PeriodValue | undefined) ?? {
        key: null,
        from: null,
        to: null,
      } satisfies PeriodValue
      const raw = searchParams.get(key)
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
