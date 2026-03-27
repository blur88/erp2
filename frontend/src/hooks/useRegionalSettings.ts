import { useEffect } from 'react'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'

/**
 * Initialize regional settings from backend into localStorage on app startup.
 * These values are read by formatDate(), formatDateTime(), formatNumber(), getCurrentDate().
 * Only fetches when the user is authenticated to avoid 401 redirect loops.
 */
export const useRegionalSettings = (isAuthenticated: boolean) => {
  const { data } = useGetRegionalSettingsQuery(undefined, { skip: !isAuthenticated })

  useEffect(() => {
    if (!isAuthenticated || !data) return
    const s = data as any
    if (s.dateFormat) localStorage.setItem('dateFormat', s.dateFormat)
    if (s.timeFormat) localStorage.setItem('timeFormat', s.timeFormat)
    if (s.numberFormat) localStorage.setItem('numberFormat', s.numberFormat)
    if (s.currency) localStorage.setItem('defaultCurrency', s.currency)
    if (s.timezone) localStorage.setItem('timezone', s.timezone)
  }, [isAuthenticated, data])
}
