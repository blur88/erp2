import { CircularProgress, Stack } from '@mui/material'

import { FilterCompare } from './FilterCompare'
import { FilterCategory } from './FilterCategory'
import { FilterCustomer } from './FilterCustomer'
import { FilterOrderStatus } from './FilterOrderStatus'
import { FilterPaymentStatus } from './FilterPaymentStatus'
import { FilterPeriod } from './FilterPeriod'
import { FilterPriceList } from './FilterPriceList'
import { FilterProductType } from './FilterProductType'
import { FilterPurchasingStatus } from './FilterPurchasingStatus'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import { FilterStockStatus } from './FilterStockStatus'
import { FilterSupplier } from './FilterSupplier'
import { AppButton } from '@/components/common/AppButton'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterBarSortConfig,
  PeriodValue,
} from '@/types/filterBar.types'

interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  sort?: FilterBarSortConfig
  isFetching?: boolean
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['fields'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
  config: FilterBarConfig<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onQuickFilterChange(field.field, nextValue)

  if (field.type === 'select' || field.type === 'multi-select') {
    return (
      <FilterSelect
        key={String(field.field)}
        field={String(field.field)}
        label={field.label}
        type={field.type}
        value={value as string | null | string[]}
        options={field.options}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={String(field.field)}
        value={periodValue.key}
        customFrom={periodValue.from}
        customTo={periodValue.to}
        onChange={(key, from, to) =>
          onChange({ key, from: from ?? null, to: to ?? null } as PeriodValue)
        }
      />
    )
  }

  if (field.type === 'compare') {
    const periodField = config.fields.find((configField) => configField.type === 'period')
    const periodValue = periodField ? (draftFilters[periodField.field] as PeriodValue) : null

    return (
      <FilterCompare
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
        periodValue={periodValue}
      />
    )
  }

  if (field.type === 'customer') {
    return (
      <FilterCustomer
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'order-status') {
    return (
      <FilterOrderStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'payment-status') {
    return (
      <FilterPaymentStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
        includeOverpaid={field.includeOverpaid}
      />
    )
  }

  if (field.type === 'supplier') {
    return (
      <FilterSupplier
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'price-list') {
    return (
      <FilterPriceList
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange as (value: string | null) => void}
      />
    )
  }

  if (field.type === 'purchasing-status') {
    return (
      <FilterPurchasingStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'category') {
    return (
      <FilterCategory
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'product-type') {
    return (
      <FilterProductType
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'stock-status') {
    return (
      <FilterStockStatus
        key={String(field.field)}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  return null
}

export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  isFetching,
}: Props<TFilters>) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      {config.search ? (
        <FilterSearch
          value={((draftFilters as Record<string, unknown>).search as string | undefined) ?? ''}
          placeholder={config.search.placeholder}
          onChange={handlers.onSearchChange}
          onCommit={handlers.onSearchCommit}
          inputRef={searchInputRef}
        />
      ) : null}
      {config.fields.map((field) => renderQuickField(field, draftFilters, handlers, config))}
      {sort ? (
        <AppButton
          size="filter"
          sortConfig={{ field: sort.field, sortBy: sort.sortBy, sortOrder: sort.sortOrder }}
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </AppButton>
      ) : null}
      {hasActiveFilters ? (
        <AppButton size="filter" variant="outlined" onClick={handlers.onClearAll}>
          Reset
        </AppButton>
      ) : null}
      {isFetching ? <CircularProgress size={16} /> : null}
    </Stack>
  )
}
