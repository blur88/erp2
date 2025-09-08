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
 * Format percentage
 */
export const formatPercentage = (value: number | string | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined) return '-'
  
  const numericValue = typeof value === 'string' ? parseFloat(value) : value
  
  if (isNaN(numericValue)) return '-'
  
  return `${numericValue.toFixed(decimals)}%`
}