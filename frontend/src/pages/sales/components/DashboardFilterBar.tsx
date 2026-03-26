import { Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip, Typography } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { parseISO } from 'date-fns'
import type { DashboardCompare, DashboardPeriod } from '../hooks/useDashboardFilters'

interface DashboardFilterBarProps {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  isFetching: boolean
  isDefault: boolean
  onPeriodChange: (period: DashboardPeriod) => void
  onCompareChange: (compare: DashboardCompare) => void
  onCustomRangeChange: (from: string, to: string) => void
  onReset: () => void
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Today',
  last_7_days: 'Last 7 Days',
  this_month: 'This Month',
  last_month: 'Last Month',
  custom: 'Custom Range',
}

const COMPARE_LABELS: Record<NonNullable<DashboardCompare>, string> = {
  previous_period: 'Previous Period',
  last_month: 'Same Period Last Month',
  last_year: 'Same Period Last Year',
}

function contextLabel(period: DashboardPeriod, compareWith: DashboardCompare): string {
  const periodLabel = PERIOD_LABELS[period]
  if (!compareWith) {
    return ''
  }
  return `Showing: ${periodLabel} vs ${COMPARE_LABELS[compareWith]}`
}

export function DashboardFilterBar({
  period,
  compareWith,
  customFrom,
  customTo,
  isFetching,
  isDefault,
  onPeriodChange,
  onCompareChange,
  onCustomRangeChange,
  onReset,
}: DashboardFilterBarProps) {
  const ctx = contextLabel(period, compareWith)
  const compareDisabled = period === 'today'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Period</InputLabel>
        <Select
          value={period}
          label="Period"
          onChange={(event) => onPeriodChange(event.target.value as DashboardPeriod)}
        >
          <MenuItem value="today">Today</MenuItem>
          <MenuItem value="last_7_days">Last 7 Days</MenuItem>
          <MenuItem value="this_month">This Month</MenuItem>
          <MenuItem value="last_month">Last Month</MenuItem>
          <MenuItem value="custom">Custom Range</MenuItem>
        </Select>
      </FormControl>

      {period === 'custom' && (
        <>
          <DatePicker
            label="From"
            value={customFrom ? parseISO(customFrom) : null}
            onChange={(value) => {
              if (value && customTo) {
                onCustomRangeChange(value.toISOString().slice(0, 10), customTo)
              }
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="To"
            value={customTo ? parseISO(customTo) : null}
            onChange={(value) => {
              if (value && customFrom) {
                onCustomRangeChange(customFrom, value.toISOString().slice(0, 10))
              }
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        </>
      )}

      <Tooltip title={compareDisabled ? 'Comparison is not available for Today' : ''} placement="top">
        <span>
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
            <InputLabel>Compare</InputLabel>
            <Select
              value={compareWith ?? ''}
              label="Compare"
              onChange={(event) => onCompareChange((event.target.value || null) as DashboardCompare)}
            >
              <MenuItem value="">No Comparison</MenuItem>
              <MenuItem value="previous_period">Previous Period</MenuItem>
              <MenuItem value="last_month">Same Period Last Month</MenuItem>
              <MenuItem value="last_year">Same Period Last Year</MenuItem>
            </Select>
          </FormControl>
        </span>
      </Tooltip>

      {ctx && (
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {ctx}
        </Typography>
      )}

      {isFetching && (
        <CircularProgress size={16} sx={{ ml: 'auto' }} />
      )}

      {!isDefault && (
        <Button variant="outlined" color="inherit" size="small" onClick={onReset}>
          Reset
        </Button>
      )}
    </Box>
  )
}
