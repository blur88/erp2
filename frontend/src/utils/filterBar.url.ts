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
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'category' ||
      field.type === 'price-list'

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
      field.type === 'select' ||
      field.type === 'customer' ||
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'category' ||
      field.type === 'price-list'

    if (isSingleValueField) {
      const raw = searchParams.get(key)
      if (raw === null) {
        result[fieldKey] = defaultValue ?? null
      } else if (field.type === 'select') {
        // An in-flight options query yields `options: []`, and an empty allow-list
        // rejects every value — which silently dropped valid URL filters (#1017).
        // While the option set is not authoritative, preserve a non-empty value and
        // let useFilterBar revalidate it once the real list arrives.
        //
        // `raw === ''` is normalized immediately regardless: there is nothing to
        // preserve, so it does not wait on options.
        if (field.optionsReady === false && raw !== '') {
          result[fieldKey] = raw
        } else {
          const allowed = field.options.map((option) => option.value)
          result[fieldKey] = allowed.includes(raw) ? raw : (defaultValue ?? null)
        }
      } else if (field.type === 'payment-status') {
        const VALID_PAYMENT_STATUS = ['unpaid', 'partial', 'paid', 'overpaid', 'UNPAID', 'PARTIAL', 'PAID', 'OVERPAID']
        result[fieldKey] = VALID_PAYMENT_STATUS.includes(raw) ? raw : (defaultValue ?? null)
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
