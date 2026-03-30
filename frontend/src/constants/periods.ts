export const PERIOD_KEYS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'last_year',
  'last_7_days',
  'last_30_days',
  'last_365_days',
  'custom',
] as const

export type PeriodKey = (typeof PERIOD_KEYS)[number]

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_year: 'This Year',
  last_year: 'Last Year',
  last_7_days: 'Last 7 Days',
  last_30_days: 'Last 30 Days',
  last_365_days: 'Last 365 Days',
  custom: 'Custom Range',
}

export const PERIOD_GROUPS: PeriodKey[][] = [
  ['today', 'this_week', 'this_month', 'this_year'],
  ['yesterday', 'last_week', 'last_month', 'last_year'],
  ['last_7_days', 'last_30_days', 'last_365_days'],
  ['custom'],
]
