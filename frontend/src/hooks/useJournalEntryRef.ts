import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'

export interface JournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useJournalEntryRef(
  sources: Array<{ sourceType: string; sourceId: string | undefined }>,
): {
  journalEntryRef: JournalEntryRef | null
  journalEntryRefLoading: boolean
  navigateToJournalEntry: () => void
} {
  const navigate = useNavigate()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [journalEntryRef, setJournalEntryRef] = useState<JournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const validSources = sources.filter(
    (s): s is { sourceType: string; sourceId: string } => Boolean(s.sourceId),
  )

  const sourcesKey = validSources.map((s) => `${s.sourceType}:${s.sourceId}`).join(',')

  useEffect(() => {
    if (validSources.length === 0) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        for (const source of validSources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            limit: 1,
            sortOrder: 'DESC',
          }).unwrap()

          if (cancelled) return

          const entry = response.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }
        if (!cancelled) setJournalEntryRef(null)
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJournalEntries, sourcesKey])

  const navigateToJournalEntry = useCallback(() => {
    if (!journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`,
    )
  }, [journalEntryRef, navigate])

  return { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry }
}
