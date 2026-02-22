import { useEffect } from 'react'
import { settingsApi } from '@/services/settingsApi'

/**
 * Initialize regional settings from backend into localStorage on app startup.
 * These values are read by formatDate(), formatDateTime(), formatNumber().
 * Only fetches when the user is authenticated to avoid 401 redirect loops.
 */
export const useRegionalSettings = (isAuthenticated: boolean) => {
  useEffect(() => {
    if (!isAuthenticated) return
    const init = async () => {
      try {
        const settings = await settingsApi.getPriceCostingSettings()
        const s = settings as any
        if (s.dateFormat) localStorage.setItem('dateFormat', s.dateFormat)
        if (s.timeFormat) localStorage.setItem('timeFormat', s.timeFormat)
        if (s.numberFormat) localStorage.setItem('numberFormat', s.numberFormat)
        if (s.currency) localStorage.setItem('defaultCurrency', s.currency)
      } catch {
        // Silently keep existing localStorage values or defaults
      }
    }
    init()
  }, [isAuthenticated])
}
