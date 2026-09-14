import { useCallback, useMemo, useState } from 'react'

type DraftMap = Record<string, string | null>

interface DraftRow {
  paymentMethodId: string
  accountId: string | null
}

/**
 * Staged payment-method mapping edits, as a SPARSE overlay over the server rows.
 *
 * Only edited methods are keys, so `isDirty` is a key count rather than a deep
 * comparison, and an untouched method is indistinguishable from one that was
 * never rendered.
 *
 * Every read goes through `Object.hasOwn`, never `??`. `null` is a valid draft
 * value meaning "clear this mapping", and `draft[id] ?? row.accountId` would
 * render the persisted mapping for exactly that case — presenting a staged
 * clear as though nothing had changed.
 */
export function usePaymentMethodMappingDraft() {
  const [draft, setDraft] = useState<DraftMap>({})

  const setMapping = useCallback(
    (paymentMethodId: string, next: string | null, persisted: string | null) => {
      setDraft((prev) => {
        const copy = { ...prev }
        if (next === persisted) {
          // An edit that returns to the persisted value is not a change.
          // Deleting the key — rather than storing an equal value — is what
          // makes a there-and-back edit report clean.
          delete copy[paymentMethodId]
        } else {
          copy[paymentMethodId] = next
        }
        return copy
      })
    },
    [],
  )

  const isRowDirty = useCallback(
    (paymentMethodId: string) => Object.hasOwn(draft, paymentMethodId),
    [draft],
  )

  const valueFor = useCallback(
    (row: DraftRow) =>
      Object.hasOwn(draft, row.paymentMethodId) ? draft[row.paymentMethodId] : row.accountId,
    [draft],
  )

  /*
   * The mutation body, changed methods only. The DTO rejects an empty array,
   * so the page guards the save on `isDirty`; this list is never empty when it
   * is sent.
   */
  const payload = useMemo(
    () =>
      Object.entries(draft).map(([paymentMethodId, accountId]) => ({
        paymentMethodId,
        accountId,
      })),
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
    payload,
    reset,
  }
}
