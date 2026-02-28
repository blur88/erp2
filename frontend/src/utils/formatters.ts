/**
 * Common formatting utilities
 * Date/time/number formats are read from localStorage (set by Regional Settings)
 */

import { formatCurrency as formatCurrencyUtil } from './currency'

/**
 * Format currency using the existing currency utility
 */
export const formatCurrency = formatCurrencyUtil

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

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const fmt = localStorage.getItem('dateFormat') || 'DD/MM/YYYY'
  return applyDateFormat(dateObj, fmt)
}

/**
 * Format date and time to a readable string.
 * Reads dateFormat and timeFormat from localStorage.
 */
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const dateFmt = localStorage.getItem('dateFormat') || 'DD/MM/YYYY'
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

/**
 * Application timezone constant
 */
const APP_TIMEZONE = 'Asia/Kuala_Lumpur'

/**
 * Get current date in Asia/Kuala_Lumpur timezone as YYYY-MM-DD string
 * Use this instead of new Date().toISOString().split('T')[0] for form defaults
 */
export const getCurrentDate = (): string => {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
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
 * Get date N days ago in Asia/Kuala_Lumpur timezone as YYYY-MM-DD string
 */
const getDateDaysAgo = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
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
