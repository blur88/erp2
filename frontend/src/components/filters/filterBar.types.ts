export type DateRangeValue = { from: string | null; to: string | null }
export type NumberRangeValue = { min: number | null; max: number | null }

export type FilterOption = { value: string; label: string }

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'date-range'
  | 'number-range'
  | 'toggle'

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

export interface SelectFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'select' | 'multi-select'
  options: FilterOption[]
}

export interface DateRangeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'date-range'
}

export interface NumberRangeFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'number-range'
}

export interface ToggleFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'toggle'
}

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | DateRangeFilterFieldConfig<TFilters, keyof TFilters>
  | NumberRangeFilterFieldConfig<TFilters, keyof TFilters>
  | ToggleFilterFieldConfig<TFilters, keyof TFilters>

export interface FilterBarConfig<TFilters> {
  search?: {
    placeholder: string
    debounceMs?: number
    paramKey?: string
  }
  quick: FilterFieldConfig<TFilters>[]
  advanced: FilterFieldConfig<TFilters>[]
  defaults?: Partial<TFilters>
}

export interface ActiveChip<TField = string> {
  field: TField
  label: string
}

export interface FilterBarHandlers<TFilters> {
  onSearchChange: (value: string) => void
  onSearchCommit: () => void
  onQuickFilterChange: (field: keyof TFilters, value: unknown) => void
  onAdvancedDraftChange: (field: keyof TFilters, value: unknown) => void
  onAdvancedApply: () => void
  onAdvancedCancel: () => void
  onClearField: (field: keyof TFilters) => void
  onClearAll: () => void
}
