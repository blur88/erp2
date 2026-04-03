import { CircularProgress, FormControl, InputLabel, MenuItem, Select, Stack, Tooltip } from '@mui/material'

import { FilterPeriod } from './FilterPeriod'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
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
    const compareDisabled = periodValue?.key === 'today'
    const selectId = `${String(field.field)}-select`
    const labelId = `${String(field.field)}-label`

    return (
      <Tooltip
        key={String(field.field)}
        title={compareDisabled ? 'Comparison is not available for Today' : ''}
        placement="top"
      >
        <span>
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
            <InputLabel id={labelId}>{field.label}</InputLabel>
            <Select
              id={selectId}
              labelId={labelId}
              disabled={compareDisabled}
              value={(value as string | null) ?? ''}
              label={field.label}
              onChange={(event) => onChange((event.target.value || null) as string | null)}
            >
              <MenuItem value="">No Comparison</MenuItem>
              <MenuItem value="previous_period">Previous Period</MenuItem>
              <MenuItem value="last_month">Same Period Last Month</MenuItem>
              <MenuItem value="last_year">Same Period Last Year</MenuItem>
            </Select>
          </FormControl>
        </span>
      </Tooltip>
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
