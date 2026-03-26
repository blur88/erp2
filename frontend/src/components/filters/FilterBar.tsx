import { useState } from 'react'
import { Button, Stack } from '@mui/material'

import { ActiveFilterChips } from './ActiveFilterChips'
import { AdvancedFiltersDrawer } from './AdvancedFiltersDrawer'
import { FilterDateRange } from './FilterDateRange'
import { FilterSearch } from './FilterSearch'
import { FilterSelect } from './FilterSelect'
import { FilterToggle } from './FilterToggle'
import { MoreFiltersButton } from './MoreFiltersButton'
import type {
  ActiveChip,
  DateRangeValue,
  FilterBarConfig,
  FilterBarHandlers,
  NumberRangeValue,
} from './filterBar.types'

interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  activeChips: ActiveChip<keyof TFilters>[]
  hasActiveFilters: boolean
  hasUnappliedChanges: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['quick'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
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

  if (field.type === 'date-range') {
    return (
      <FilterDateRange
        key={String(field.field)}
        label={field.label}
        value={value as DateRangeValue}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'number-range') {
    return null
  }

  return (
    <FilterToggle
      key={String(field.field)}
      label={field.label}
      value={value as boolean | null}
      onChange={onChange}
    />
  )
}

export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  activeChips,
  hasActiveFilters,
  hasUnappliedChanges,
  searchInputRef,
}: Props<TFilters>) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const advancedFields = new Set(config.advanced.map((field) => String(field.field)))
  const activeAdvancedCount = activeChips.filter((chip) => advancedFields.has(String(chip.field))).length

  return (
    <Stack spacing={0}>
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
        {config.quick.map((field) => renderQuickField(field, draftFilters, handlers))}
        {config.advanced.length > 0 ? (
          <MoreFiltersButton activeCount={activeAdvancedCount} onClick={() => setDrawerOpen(true)} />
        ) : null}
        {hasActiveFilters ? (
          <Button size="small" variant="outlined" color="inherit" sx={{ ml: 1 }} onClick={handlers.onClearAll}>
            Reset
          </Button>
        ) : null}
      </Stack>

      <ActiveFilterChips chips={activeChips} onRemove={handlers.onClearField} />

      {config.advanced.length > 0 ? (
        <AdvancedFiltersDrawer
          open={drawerOpen}
          config={config}
          draftFilters={draftFilters}
          handlers={handlers}
          hasUnappliedChanges={hasUnappliedChanges}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </Stack>
  )
}
