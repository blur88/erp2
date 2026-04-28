import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { JournalEntryRef } from './useJournalEntryRef'

interface JournalEntryRefWithId extends JournalEntryRef {
  id: string
}

export function useJournalEntryRefs(
  sources: Array<{ sourceType: string; sourceId: string | undefined }>,
): {
  journalEntryRefs: JournalEntryRef[]
  journalEntryRefsLoading: boolean
  navigateToJournalEntries: () => void
} {
  const navigate = useNavigate()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [journalEntryRefs, setJournalEntryRefs] = useState<JournalEntryRefWithId[]>([])
  const [journalEntryRefsLoading, setJournalEntryRefsLoading] = useState(false)

  const validSources = sources.filter(
    (s): s is { sourceType: string; sourceId: string } => Boolean(s.sourceId),
  )

  const sourcesKey = validSources.map((s) => `${s.sourceType}:${s.sourceId}`).join(',')

  useEffect(() => {
    if (validSources.length === 0) {
      setJournalEntryRefs([])
      setJournalEntryRefsLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefsLoading(true)

    ;(async () => {
      try {
        const collected: JournalEntryRefWithId[] = []
        for (const source of validSources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
          }).unwrap()

          if (cancelled) return

          const entries = response.data ?? []
          for (const entry of entries) {
            collected.push({
              id: entry.id,
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
          }
        }
        if (!cancelled) setJournalEntryRefs(collected)
      } catch {
        if (!cancelled) setJournalEntryRefs([])
      } finally {
        if (!cancelled) setJournalEntryRefsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJournalEntries, sourcesKey])

  const navigateToJournalEntries = useCallback(() => {
    if (journalEntryRefs.length === 0) return
    if (journalEntryRefs.length === 1) {
      const ref = journalEntryRefs[0]
      navigate(
        `/accounting/journal-entries?sourceType=${ref.sourceType}&sourceId=${ref.sourceId}`,
      )
      return
    }

    const ids = journalEntryRefs.map((r) => r.id).join(',')
    navigate(`/accounting/journal-entries?ids=${ids}`)
  }, [journalEntryRefs, navigate])

  return { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries }
}
