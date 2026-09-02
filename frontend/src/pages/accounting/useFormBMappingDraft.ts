import { useCallback, useMemo, useState } from 'react'

import type { FormBCategory } from '@/types'

type DraftMap = Record<string, FormBCategory | null>

interface DraftRow {
  accountId: string
  category: FormBCategory | null
}

/**
 * Staged Form B mapping edits, as a SPARSE overlay over the server rows.
 *
 * Only edited rows are keys, so `isDirty` is a key count rather than a deep
 * comparison, and an untouched row is indistinguishable from one that was
 * never rendered.
 *
 * Every read goes through `Object.hasOwn`, never `??`. `null` is a valid draft
 * value meaning "clear this mapping" — the one operation this section exists
 * to support — and `draft[id] ?? row.category` would render the persisted
 * mapping for exactly that case, presenting a staged clear as though nothing
 * had changed.
 */
export function useFormBMappingDraft() {
  const [draft, setDraft] = useState<DraftMap>({})

  const setMapping = useCallback(
    (accountId: string, next: FormBCategory | null, persisted: FormBCategory | null) => {
      setDraft((prev) => {
        const copy = { ...prev }
        if (next === persisted) {
          // An edit that returns to the persisted value is not a change.
          // Deleting the key — rather than storing an equal value — is what
          // makes a there-and-back edit report clean.
          delete copy[accountId]
        } else {
          copy[accountId] = next
        }
        return copy
      })
    },
    [],
  )

  const isRowDirty = useCallback(
    (accountId: string) => Object.hasOwn(draft, accountId),
    [draft],
  )

  const valueFor = useCallback(
    (row: DraftRow) =>
      Object.hasOwn(draft, row.accountId) ? draft[row.accountId] : row.category,
    [draft],
  )

  const changedItems = useCallback(
    () => Object.entries(draft).map(([accountId, category]) => ({ accountId, category })),
    [draft],
  )

  const reset = useCallback(() => setDraft({}), [])

  const dirtyCount = useMemo(() => Object.keys(draft).length, [draft])

  return {
    draft,
    isDirty: dirtyCount > 0,
    dirtyCount,
    setMapping,
    isRowDirty,
    valueFor,
    changedItems,
    reset,
  }
}
