import { useEffect, useState } from 'react'
import { settingsApi } from '@/services/settingsApi'

/**
 * Hook to get the default currency from settings
 * Caches the currency in localStorage for better performance
 */
export const useCurrency = () => {
  const [currency, setCurrency] = useState<string>(() => {
    // Try to get from localStorage first
    const cached = localStorage.getItem('defaultCurrency')
    return cached || 'RM' // Fallback to RM
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchCurrency = async () => {
      try {
        setLoading(true)
        const response = await settingsApi.getDefaultCurrency()

        // Handle both wrapped and direct response formats
        const newCurrency = response?.data?.currency || response?.currency || 'RM'

        console.log('Fetched currency:', newCurrency, 'from response:', response)

        // Update state and cache
        setCurrency(newCurrency)
        localStorage.setItem('defaultCurrency', newCurrency)
      } catch (error) {
        console.error('Failed to fetch default currency:', error)
        // Keep using cached or fallback value
      } finally {
        setLoading(false)
      }
    }

    fetchCurrency()
  }, [])

  return { currency, loading }
}

/**
 * Get currency symbol synchronously from cache
 * Use this for utilities that can't be hooks
 */
export const getCachedCurrency = (): string => {
  return localStorage.getItem('defaultCurrency') || 'RM'
}

/**
 * Refresh currency cache (call this when settings change)
 */
export const refreshCurrencyCache = async (): Promise<string> => {
  try {
    const response = await settingsApi.getDefaultCurrency()
    // Handle both wrapped and direct response formats
    const currency = response?.data?.currency || response?.currency || 'RM'
    console.log('Refreshed currency cache:', currency)
    localStorage.setItem('defaultCurrency', currency)

    // Force reload to update all components
    window.dispatchEvent(new Event('currencyChanged'))

    return currency
  } catch (error) {
    console.error('Failed to refresh currency cache:', error)
    return getCachedCurrency()
  }
}
