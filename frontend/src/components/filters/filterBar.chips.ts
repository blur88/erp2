import type {
  ActiveChip,
  DateRangeValue,
  FilterBarConfig,
  FilterFieldConfig,
  NumberRangeValue,
} from './filterBar.types'

function defaultChipLabel<TFilters>(
  field: FilterFieldConfig<TFilters>,
  value: unknown,
  filters: TFilters,
): string | null {
  if (field.chipFormatter) {
    return field.chipFormatter(value as TFilters[keyof TFilters], filters)
  }

  if (field.type === 'select') {
    if (value === null || value === undefined) return null
    const option = field.options.find((item) => item.value === value)
    return option ? `${field.label}: ${option.label}` : null
  }

  if (field.type === 'multi-select') {
    const selected = (value as string[] | undefined) ?? []
    if (selected.length === 0) return null
    if (selected.length === 1) {
      const option = field.options.find((item) => item.value === selected[0])
      return `${field.label}: ${option?.label ?? selected[0]}`
    }
    return `${field.label}: ${selected.length} selected`
  }

  if (field.type === 'toggle') {
    if (value === null || value === undefined) return null
    return `${field.label}: ${value ? 'On' : 'Off'}`
  }

  if (field.type === 'date-range') {
    const range = value as DateRangeValue
    if (!range || (range.from === null && range.to === null)) return null
    if (range.from && range.to) return `${field.label}: ${range.from} - ${range.to}`
    if (range.from) return `${field.label}: from ${range.from}`
    if (range.to) return `${field.label}: to ${range.to}`
    return null
  }

  const range = value as NumberRangeValue
  if (!range || (range.min === null && range.max === null)) return null
  if (range.min !== null && range.max !== null) return `${field.label}: ${range.min} - ${range.max}`
  if (range.min !== null) return `${field.label}: >= ${range.min}`
  if (range.max !== null) return `${field.label}: <= ${range.max}`
  return null
}

export function deriveChips<TFilters extends object>(
  appliedFilters: TFilters,
  config: FilterBarConfig<TFilters>,
): ActiveChip<keyof TFilters>[] {
  const chips: ActiveChip<keyof TFilters>[] = []

  for (const field of [...config.quick, ...config.advanced]) {
    const chipLabel = defaultChipLabel(field, appliedFilters[field.field], appliedFilters)
    if (chipLabel) {
      chips.push({ field: field.field, label: chipLabel })
    }
  }

  return chips
}
