import { Box, Button, Divider, Drawer, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'

import { FilterDateRange } from './FilterDateRange'
import { FilterNumberRange } from './FilterNumberRange'
import { FilterSelect } from './FilterSelect'
import { FilterToggle } from './FilterToggle'
import type { DateRangeValue, FilterBarConfig, FilterBarHandlers, NumberRangeValue } from './filterBar.types'

interface Props<TFilters extends object> {
  open: boolean
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasUnappliedChanges: boolean
  onClose: () => void
}

function renderField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['advanced'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onAdvancedDraftChange(field.field, nextValue)

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
    return (
      <FilterNumberRange
        key={String(field.field)}
        label={field.label}
        value={value as NumberRangeValue}
        onChange={onChange}
      />
    )
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

export function AdvancedFiltersDrawer<TFilters extends object>({
  open,
  config,
  draftFilters,
  handlers,
  hasUnappliedChanges,
  onClose,
}: Props<TFilters>) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const handleApply = () => {
    handlers.onAdvancedApply()
    onClose()
  }

  const handleCancel = () => {
    handlers.onAdvancedCancel()
    onClose()
  }

  const handleReset = () => {
    for (const field of config.advanced) {
      handlers.onClearField(field.field)
    }
    onClose()
  }

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={handleCancel}
      PaperProps={{ sx: { width: isMobile ? '100%' : 360, p: 2 } }}
    >
      <Typography variant="h6" gutterBottom>
        Filters
      </Typography>
      <Divider sx={{ mb: 2 }} />

      <Stack spacing={2} sx={{ flex: 1, overflowY: 'auto' }}>
        {config.advanced.map((field) => renderField(field, draftFilters, handlers))}
      </Stack>

      <Box sx={{ pt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button size="small" onClick={handleReset}>
          Reset
        </Button>
        <Button size="small" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="small" variant="contained" disabled={!hasUnappliedChanges} onClick={handleApply}>
          Apply
        </Button>
      </Box>
    </Drawer>
  )
}
