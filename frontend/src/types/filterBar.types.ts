import type { PeriodKey } from '@/constants/periods'

export type FilterOption = { value: string; label: string }

export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}

export type FilterFieldType =
  | 'select'
  | 'period'
  | 'compare'
  | 'customer'
  | 'payment-status'
  | 'supplier'
  | 'category'
  | 'price-list'
  | 'date'
  | 'boolean'

interface BaseFilterFieldConfig<TFilters, K extends keyof TFilters> {
  field: K
  label: string
  type: FilterFieldType
  paramKey?: string
  chipFormatter?: (value: TFilters[K], filters: TFilters) => string
}

export interface SelectFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'select'
  options: readonly Readonly<FilterOption>[]
  emptyLabel?: string
  /**
   * Whether the control offers an empty ("All") choice. Default `true`, so
   * every existing filter is unchanged.
   *
   * Set `false` for a field that has no meaningful empty state — a required
   * dimension the report always has a value for, such as Profit & Loss's Year.
   * Without this, selecting "All" stores `null`, the query falls back to a
   * default the control does not display, and `hasActiveFilters` turns on
   * because `null` differs from the configured default: the displayed value,
   * the queried value, the URL and the Reset button all disagree.
   */
  showEmptyOption?: boolean
  minWidth?: number
  /**
   * `options` is the complete, authoritative set — including when it is empty.
   * Default `true`, so static-option consumers need no change.
   *
   * While `false`, a non-empty URL value is preserved without allow-list
   * validation (issue #1017: an in-flight options query yields `[]`, and an
   * empty allow-list rejects every value, silently dropping valid filters).
   *
   * A query ERROR keeps this `false` — an error is not evidence that a value is
   * invalid. The value is retained until some later fetch succeeds.
   *
   * Validation only. For "is a fetch in flight", use `optionsLoading`.
   *
   * REQUIRED if `options` is derived from a query. It stays optional only so the
   * static-option consumers compile unchanged — the type system cannot tell the
   * two apart, so this comment is the only guard.
   *
   * Omitting it on a query-backed field does not merely disable preservation: it
   * declares an in-flight empty array authoritative, and useFilterBar's
   * revalidation effect will then actively clear the applied value and fire
   * `onApply` (resetting pagination) on every options transition.
   */
  optionsReady?: boolean
  /**
   * A fetch is in flight. Default `false`. Presentation only — it disables the
   * control and shows a placeholder.
   *
   * Deliberately independent of `optionsReady`: an errored query is
   * `optionsReady: false, optionsLoading: false`. Driving the disabled state off
   * `optionsReady` alone would leave an errored control permanently dead and
   * permanently reading "Loading…".
   */
  optionsLoading?: boolean
}

export interface PeriodFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'period'
}

export interface CompareFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'compare'
}

export interface CustomerFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'customer'
}

export interface PaymentStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'payment-status'
  includeOverpaid?: boolean
  /**
   * REQUIRED, no default (#1019). Analytics dashboard endpoints validate
   * lowercase unions; list endpoints validate uppercase enums. A default here
   * silently 400s any list page that forgets to opt in — which is exactly how
   * the Expenses Payment filter shipped broken. Declare it explicitly.
   */
  valueCase: 'lower' | 'upper'
}

export interface SupplierFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'supplier'
}

export interface CategoryFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'category'
}

export interface PriceListFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'price-list'
}

export interface DateFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'date'
  /**
   * Date to restore when the field is cleared. Required in practice for any
   * report that must always have a date — see FilterDate's `clearTo`. A
   * function, so a consumer whose fallback is "today" is not frozen to the
   * date the config object was built.
   */
  clearTo?: () => string | null
}

export interface BooleanFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'boolean'
}

export type FilterFieldConfig<TFilters> =
  | SelectFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierFilterFieldConfig<TFilters, keyof TFilters>
  | CategoryFilterFieldConfig<TFilters, keyof TFilters>
  | PriceListFilterFieldConfig<TFilters, keyof TFilters>
  | DateFilterFieldConfig<TFilters, keyof TFilters>
  | BooleanFilterFieldConfig<TFilters, keyof TFilters>

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
