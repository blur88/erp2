/**
 * Common formatting utilities
 */

import { formatCurrency as formatCurrencyUtil } from './currency'

/**
 * Format currency using the existing currency utility
 */
export const formatCurrency = formatCurrencyUtil

/**
 * Format date to a readable string
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '-'
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) return '-'
  
  return dateObj.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Format date and time to a readable string
 */
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '-'
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) return '-'
  
  return dateObj.toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format number with thousand separators
 */
export const formatNumber = (num: number | string | null | undefined): string => {
  if (num === null || num === undefined) return '-'
  
  const numericValue = typeof num === 'string' ? parseFloat(num) : num
  
  if (isNaN(numericValue)) return '-'
  
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
export const formatPercentage = (value: number | string | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined) return '-'

  const numericValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numericValue)) return '-'

  return `${numericValue.toFixed(decimals)}%`
}

/**
 * Application timezone constant
 */
export const APP_TIMEZONE = 'Asia/Kuala_Lumpur'

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
  // Using 'en-CA' locale gives YYYY-MM-DD format
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

/**
 * Get date N days ago in Asia/Kuala_Lumpur timezone as YYYY-MM-DD string
 */
export const getDateDaysAgo = (days: number): string => {
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
