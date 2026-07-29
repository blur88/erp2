import { useMemo } from 'react'

import { useGetDocumentNumberSettingsQuery } from '@/store/api/settingsApi'

/**
 * Previews the next document number for `documentName` from Document Number
 * Settings, e.g. `EXP-26-001`.
 *
 * Display-only: it reads `nextNumber` and never reserves or increments the
 * sequence. The backend remains authoritative and issues the final number on
 * create, so a preview can go stale if another user creates a document first.
 *
 * Returns `null` when disabled (edit mode, where a saved number is shown
 * instead), `'Loading...'` while settings load, and `'Auto-generated'` when no
 * matching configuration exists.
 */
export function useDocumentNumberPreview(
  documentName: string,
  enabled = true,
): string | null {
  const { data: settings, isLoading } = useGetDocumentNumberSettingsQuery(undefined, {
    skip: !enabled,
  })

  return useMemo(() => {
    // Must precede the branches below: a skipped query reports isLoading false
    // and undefined data, which would otherwise yield 'Auto-generated'.
    if (!enabled) return null
    if (isLoading) return 'Loading...'
    const config = settings?.configurations?.find((c) => c.documentName === documentName)
    if (!config) return 'Auto-generated'
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const seq = String(config.nextNumber).padStart(config.paddingDigits, '0')
    return `${config.prefix}-${yy}-${seq}`
  }, [settings, documentName, enabled, isLoading])
}
