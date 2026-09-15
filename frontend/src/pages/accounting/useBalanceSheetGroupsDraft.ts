import { useCallback, useEffect, useMemo, useState } from 'react'

import type { BalanceSheetGroupName, BalanceSheetGroupRow } from '@/types'

/** accountId -> group. Absence of a key means the account is ungrouped. */
export type GroupAssignments = Record<string, BalanceSheetGroupName>

const toAssignments = (rows: BalanceSheetGroupRow[]): GroupAssignments => {
  const next: GroupAssignments = {}
  for (const row of rows) next[row.accountId] = row.group
  return next
}

/**
 * Staged Balance Sheet group edits (#1239).
 *
 * A COMPLETE assignment map, not a sparse overlay like
 * usePaymentMethodMappingDraft — the endpoint has replacement semantics, so the
 * payload is the whole set and removal is expressed by an account's absence
 * rather than by a null value. A sparse overlay cannot express "this account is
 * no longer grouped" without inventing a tombstone.
 *
 * Seeded from the server rows once they arrive and re-seeded whenever they
 * change identity, so a save (or a refetch) rebases the draft rather than
 * leaving it comparing against a stale baseline.
 */
export function useBalanceSheetGroupsDraft(rows: BalanceSheetGroupRow[] | undefined) {
  const persisted = useMemo(() => toAssignments(rows ?? []), [rows])

  /*
   * `null` means "not yet seeded". It is distinct from `{}`, which is a real,
   * user-authored empty set (every group cleared). Collapsing the two would
   * make a cleared-everything draft look unseeded and silently re-seed it from
   * the server on the next render, discarding the edit.
   */
  const [draft, setDraft] = useState<GroupAssignments | null>(null)

  // Re-seed when the SERVER rows change — initial load, refetch, or the
  // post-save cache write. Keyed on the serialized persisted map so an
  // identical refetch does not clobber an in-progress edit.
  const persistedKey = useMemo(
    () =>
      Object.entries(persisted)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, group]) => `${id}:${group}`)
        .join('|'),
    [persisted],
  )
  useEffect(() => {
    if (rows === undefined) return
    setDraft(toAssignments(rows))
    // persistedKey is the identity of `rows` for this purpose; `rows` itself is
    // a new array reference on every render of a fresh query result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedKey, rows === undefined])

  const current = draft ?? persisted

  /** Assigns an account to a group, or removes it when `group` is null. */
  const setAssignment = useCallback(
    (accountId: string, group: BalanceSheetGroupName | null) => {
      setDraft((prev) => {
        const base = prev ?? persisted
        const copy = { ...base }
        if (group === null) delete copy[accountId]
        else copy[accountId] = group
        return copy
      })
    },
    [persisted],
  )

  const remove = useCallback(
    (accountId: string) => setAssignment(accountId, null),
    [setAssignment],
  )

  const accountsIn = useCallback(
    (group: BalanceSheetGroupName) =>
      Object.entries(current)
        .filter(([, g]) => g === group)
        .map(([accountId]) => accountId),
    [current],
  )

  /*
   * Dirty by VALUE comparison against the persisted set, not by a mutation
   * count. Adding an account and removing it again must report clean, and with
   * a complete map that is a set comparison rather than a key count.
   */
  const isDirty = useMemo(() => {
    const a = Object.keys(current)
    const b = Object.keys(persisted)
    if (a.length !== b.length) return true
    return a.some((id) => current[id] !== persisted[id])
  }, [current, persisted])

  /** The mutation body: the complete set, which may legitimately be empty. */
  const payload = useMemo(
    () =>
      Object.entries(current).map(([accountId, group]) => ({ accountId, group })),
    [current],
  )

  const reset = useCallback(() => setDraft(toAssignments(rows ?? [])), [rows])

  return {
    assignments: current,
    isDirty,
    setAssignment,
    remove,
    accountsIn,
    payload,
    reset,
  }
}
