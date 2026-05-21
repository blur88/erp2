import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'

export interface JournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
  // IDs of all related JEs (original + reversal) for navigation
  relatedIds: string[]
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
          // Fetch all JEs for this source (not just 1) so we can collect all related IDs
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          }).unwrap()

          if (cancelled) return

          const entries = response.data ?? []
          if (entries.length === 0) continue

          // Collect IDs: source entries + any reversal entries pointed to by reversedById
          const relatedIds = new Set<string>()
          for (const e of entries) {
            relatedIds.add(e.id)
            if (e.reversedById) relatedIds.add(e.reversedById)
          }

          // The most recent source entry tells us the display reference.
          // If it has been reversed, show the reversal entry's reference instead
          // (the reversal is the active POSTED entry).
          const newest = entries[0]
          let displayRef = newest.referenceNumber

          if (newest.reversedById) {
            // Fetch the reversal entry by ID to get its reference number
            const reversalResponse = await fetchJournalEntries({
              ids: newest.reversedById,
            }).unwrap()
            if (!cancelled) {
              const reversalEntry = reversalResponse.data?.[0]
              if (reversalEntry) {
                displayRef = reversalEntry.referenceNumber
                relatedIds.add(reversalEntry.id)
              }
            }
          }

          if (cancelled) return

          setJournalEntryRef({
            referenceNumber: displayRef,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            relatedIds: [...relatedIds],
          })
          return
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
    if (journalEntryRef.relatedIds.length > 1) {
      navigate(`/accounting/journal-entries?ids=${journalEntryRef.relatedIds.join(',')}`)
    } else {
      navigate(
        `/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`,
      )
    }
  }, [journalEntryRef, navigate])

  return { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry }
}
