import { CircularProgress, Stack } from '@mui/material'

import { FilterCategory } from './FilterCategory'
import { FilterCompare } from './FilterCompare'
import { FilterCustomer } from './FilterCustomer'
import { FilterPaymentStatus } from './FilterPaymentStatus'
import { FilterPeriod } from './FilterPeriod'
import { FilterPriceList } from './FilterPriceList'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
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
  extra?: React.ReactNode
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['fields'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
  config: FilterBarConfig<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onQuickFilterChange(field.field, nextValue)
  const fieldKey = String(field.field)

  if (field.type === 'select') {
    return (
      <FilterSelect
        key={fieldKey}
        field={fieldKey}
        label={field.label}
        value={(value as string | null) ?? null}
        options={field.options}
        onChange={onChange}
        emptyLabel={field.emptyLabel}
        minWidth={field.minWidth}
        optionsReady={field.optionsReady}
        optionsLoading={field.optionsLoading}
      />
    )
  }

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={fieldKey}
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
        key={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
        periodValue={periodValue}
      />
    )
  }

  if (field.type === 'customer') {
    return (
      <FilterCustomer
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'payment-status') {
    return (
      <FilterPaymentStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
        includeOverpaid={field.includeOverpaid}
        valueCase={field.valueCase}
      />
    )
  }

  if (field.type === 'supplier') {
    return (
      <FilterSupplier
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'price-list') {
    return (
      <FilterPriceList
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange as (value: string | null) => void}
      />
    )
  }

  if (field.type === 'category') {
    return (
      <FilterCategory
        key={fieldKey}
        field={fieldKey}
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
  extra,
}: Props<TFilters>) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{
        alignItems: "center",
        flexWrap: "wrap"
      }}>
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
      {extra ?? null}
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
  );
}
