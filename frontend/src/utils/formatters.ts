/**
 * Common formatting utilities
 * Date/time/number formats are read from localStorage (set by Regional Settings)
 */

import { formatCurrency as formatCurrencyUtil } from './currency'

/**
 * Format currency using the existing currency utility
 */
export const formatCurrency = formatCurrencyUtil

const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY'

/**
 * Apply a date format string (e.g. 'DD/MM/YYYY') to a Date object.
 * Returns formatted string.
 */
const applyDateFormat = (dateObj: Date, fmt: string): string => {
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = String(dateObj.getFullYear())
  const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const MONTHS_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const monthFull = MONTHS_FULL[dateObj.getMonth()]
  const monthShort = MONTHS_SHORT[dateObj.getMonth()]

  return fmt
    .replace('MMMM', monthFull)
    .replace('MMM', monthShort)
    .replace('MM', month)
    .replace('DD', day)
    .replace('YYYY', year)
}

const getSavedDateFormat = (): string => localStorage.getItem('dateFormat') || DEFAULT_DATE_FORMAT

const parseDateInput = (date: Date | string): Date => {
  if (date instanceof Date) {
    return date
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match) {
    const [, year, month, day] = match
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  return new Date(date)
}

const getMonthYearFormat = (fmt: string): string => {
  const withoutDay = fmt
    .replace(/(^|[\s/.,-])DD([\s/.,-]|$)/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return withoutDay.replace(/^[\s/.,-]+|[\s/.,-]+$/g, '') || 'MM/YYYY';
}

export const toMuiDatePickerFormat = (fmt: string): string =>
  fmt
    .replace(/YYYY/g, 'yyyy')
    .replace(/DD/g, 'dd')

export const formatSalesPeriodLabel = (
  period: string,
  groupBy: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'day',
): string => {
  if (groupBy === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return formatDate(period)
  }

  if (groupBy === 'month' && /^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-').map(Number)
    return applyDateFormat(new Date(year, month - 1, 1), getMonthYearFormat(getSavedDateFormat()))
  }

  if (groupBy === 'week' && /^\d{4}-\d{2}$/.test(period)) {
    const [year, week] = period.split('-')
    return `Week ${week}, ${year}`
  }

  if (groupBy === 'quarter' && /^\d{4}-Q\d$/.test(period)) {
    const [year, quarter] = period.split('-')
    return `${quarter} ${year}`
  }

  return period
}

/**
 * Apply a time format ('24h' or '12h') to a Date object.
 * Returns formatted time string.
 */
const applyTimeFormat = (dateObj: Date, fmt: string): string => {
  const hours24 = dateObj.getHours()
  const minutes = String(dateObj.getMinutes()).padStart(2, '0')

  if (fmt === '12h') {
    const period = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 % 12 || 12
    return `${hours12}:${minutes} ${period}`
  }

  return `${String(hours24).padStart(2, '0')}:${minutes}`
}

/**
 * Format date to a readable string.
 * Reads dateFormat from localStorage (default: 'DD/MM/YYYY').
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = parseDateInput(date)

  if (isNaN(dateObj.getTime())) return '-'

  const fmt = getSavedDateFormat()
  return applyDateFormat(dateObj, fmt)
}

/**
 * Format date and time to a readable string.
 * Reads dateFormat and timeFormat from localStorage.
 */
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = parseDateInput(date)

  if (isNaN(dateObj.getTime())) return '-'

  const dateFmt = getSavedDateFormat()
  const timeFmt = localStorage.getItem('timeFormat') || '24h'

  const datePart = applyDateFormat(dateObj, dateFmt)
  const timePart = applyTimeFormat(dateObj, timeFmt)

  return `${datePart} ${timePart}`
}

/**
 * Format number with thousand separators.
 * Reads numberFormat from localStorage (default: '1,234.56').
 * '1,234.56' = comma thousands, dot decimal
 * '1234.56'  = no thousands separator
 */
export const formatNumber = (num: number | string | null | undefined): string => {
  if (num === null || num === undefined) return '-'

  const numericValue = typeof num === 'string' ? parseFloat(num) : num

  if (isNaN(numericValue)) return '-'

  const fmt = localStorage.getItem('numberFormat') || '1,234.56'

  if (fmt === '1234.56') {
    return numericValue.toString()
  }

  // Default: comma thousands, dot decimal (en-MY / en-US style)
  return numericValue.toLocaleString('en-MY')
}

/**
 * Format quantities as whole numbers for list/table display.
 */
export const formatWholeQuantity = (quantity: number | string | null | undefined): string => {
  if (quantity === null || quantity === undefined) return '-'

  const numericValue = typeof quantity === 'string' ? parseFloat(quantity) : quantity

  if (isNaN(numericValue)) return '-'

  return Math.trunc(numericValue).toString()
}

/**
 * Format percentage
 */
const formatPercentage = (value: number | string | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined) return '-'

  const numericValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numericValue)) return '-'

  return `${numericValue.toFixed(decimals)}%`
}

const getAppTimezone = (): string => localStorage.getItem('timezone') || 'Asia/Kuala_Lumpur'

/**
 * Get current date in the selected application timezone as YYYY-MM-DD string
 * Use this instead of new Date().toISOString().split('T')[0] for form defaults
 */
export const getCurrentDate = (): string => {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

/**
 * True only for a YYYY-MM-DD string naming a real calendar date.
 * The UTC round-trip is load-bearing: a bare regex accepts 2026-02-31,
 * which Date would silently roll over to March 3.
 */
export const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  )
}

/**
 * Convert a backend calendar-date value into a YYYY-MM-DD string for a
 * MUI X date picker. Calendar dates are timezone-free:
 * a date-only string is passed through unchanged (NEVER reparsed via
 * `new Date()`, which would apply the runtime timezone). A Date/timestamp
 * (legacy rows written as UTC midnight) is reduced to its UTC calendar date.
 * Do not use this for genuine instants — see getCurrentDate for "today".
 */
export const toDateInputValue = (
  date: Date | string | null | undefined,
): string => {
  if (date === null || date === undefined || date === '') {
    return ''
  }
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get date N days ago in the selected application timezone as YYYY-MM-DD string
 */
const getDateDaysAgo = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: getAppTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}
