import { useState, useEffect } from 'react'
import { useGetDefaultCurrencyQuery } from '@/store/api/settingsApi'

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

  const { data, isLoading: loading } = useGetDefaultCurrencyQuery()

  useEffect(() => {
    if (data) {
      const newCurrency = data.currency || 'RM'
      console.log('Fetched currency:', newCurrency)
      setCurrency(newCurrency)
      localStorage.setItem('defaultCurrency', newCurrency)
    }
  }, [data])

  return { currency, loading }
}

/**
 * Get currency symbol synchronously from cache
 * Use this for utilities that can't be hooks
 */
const getCachedCurrency = (): string => {
  return localStorage.getItem('defaultCurrency') || 'RM'
}

/**
 * Refresh currency cache (call this when settings change)
 */
const refreshCurrencyCache = async (): Promise<string> => {
  // Force reload to update all components
  window.dispatchEvent(new Event('currencyChanged'))
  return getCachedCurrency()
}
