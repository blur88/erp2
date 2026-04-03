import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'period'
  | 'compare'

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

export interface PeriodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'period'
}

export interface CompareFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'compare'
}

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>

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
