import type {
  FilterBarConfig,
  FilterFieldConfig,
} from './filterBar.types'

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

  for (const field of config.quick) {
    keys.push(effectiveKey(field))
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

  for (const field of config.quick) {
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

  for (const field of config.quick) {
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
  }

  return result as TFilters
}
