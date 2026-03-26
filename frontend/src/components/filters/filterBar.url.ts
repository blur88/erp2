import type {
  DateRangeValue,
  FilterBarConfig,
  FilterFieldConfig,
  NumberRangeValue,
} from './filterBar.types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime())
}

function effectiveKey<TFilters>(field: FilterFieldConfig<TFilters>): string {
  return field.paramKey ?? String(field.field)
}

export function getManagedParamKeys<TFilters>(
  config: FilterBarConfig<TFilters>,
): string[] {
  const keys: string[] = []

  if (config.search) {
    keys.push(config.search.paramKey ?? 'search')
  }

  for (const field of [...config.quick, ...config.advanced]) {
    const key = effectiveKey(field)
    if (field.type === 'date-range') {
      keys.push(`${key}_from`, `${key}_to`)
      continue
    }
    if (field.type === 'number-range') {
      keys.push(`${key}_min`, `${key}_max`)
      continue
    }
    keys.push(key)
  }

  return keys
}

export function serializeFilters<TFilters extends object>(
  filters: TFilters,
  config: FilterBarConfig<TFilters>,
  currentSearchParams: URLSearchParams,
): URLSearchParams {
  const result = new URLSearchParams(currentSearchParams)

  for (const key of getManagedParamKeys(config)) {
    result.delete(key)
  }

  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const orderedEntries: Array<[string, string]> = []

  if (config.search) {
    const searchKey = config.search.paramKey ?? 'search'
    const searchValue = ((filters as Record<string, unknown>).search as string | undefined) ?? ''
    const defaultSearch = (defaults.search as string | undefined) ?? ''
    if (searchValue && searchValue !== defaultSearch) {
      orderedEntries.push([searchKey, searchValue])
    }
  }

  for (const field of [...config.quick, ...config.advanced]) {
    const key = effectiveKey(field)
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

    if (field.type === 'toggle') {
      if (value !== null && value !== undefined) {
        orderedEntries.push([key, String(value)])
      }
      continue
    }

    if (field.type === 'date-range') {
      const range = value as DateRangeValue | undefined
      if (range?.from) orderedEntries.push([`${key}_from`, range.from])
      if (range?.to) orderedEntries.push([`${key}_to`, range.to])
      continue
    }

    const range = value as NumberRangeValue | undefined
    if (range?.min !== null && range?.min !== undefined) {
      orderedEntries.push([`${key}_min`, String(range.min)])
    }
    if (range?.max !== null && range?.max !== undefined) {
      orderedEntries.push([`${key}_max`, String(range.max)])
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
  const defaults = (config.defaults ?? {}) as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if (config.search) {
    const searchKey = config.search.paramKey ?? 'search'
    result.search = searchParams.get(searchKey) ?? (defaults.search ?? '')
  }

  for (const field of [...config.quick, ...config.advanced]) {
    const key = effectiveKey(field)
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

    if (field.type === 'toggle') {
      const raw = searchParams.get(key)
      if (raw === 'true') result[fieldKey] = true
      else if (raw === 'false') result[fieldKey] = false
      else result[fieldKey] = defaultValue ?? null
      continue
    }

    if (field.type === 'date-range') {
      const from = searchParams.get(`${key}_from`)
      const to = searchParams.get(`${key}_to`)
      result[fieldKey] = {
        from: from && isValidDate(from) ? from : null,
        to: to && isValidDate(to) ? to : null,
      } satisfies DateRangeValue
      continue
    }

    const minRaw = searchParams.get(`${key}_min`)
    const maxRaw = searchParams.get(`${key}_max`)
    const min = minRaw === null ? null : Number(minRaw)
    const max = maxRaw === null ? null : Number(maxRaw)
    result[fieldKey] = {
      min: min !== null && !Number.isNaN(min) ? min : null,
      max: max !== null && !Number.isNaN(max) ? max : null,
    } satisfies NumberRangeValue
  }

  return result as TFilters
}
