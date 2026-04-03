import { PERIOD_KEYS } from '@/constants/periods'
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

    if (field.type === 'select') {
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

    if (field.type === 'select') {
      const raw = searchParams.get(key)
      if (raw === null) {
        result[fieldKey] = defaultValue ?? null
      } else {
        const valid = field.options.find((option) => option.value === raw)
        result[fieldKey] = valid ? raw : (defaultValue ?? null)
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
      }
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
    }
  }

  return result as TFilters
}
