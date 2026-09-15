import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useBalanceSheetGroupsDraft } from '../useBalanceSheetGroupsDraft'
import type { BalanceSheetGroupRow } from '@/types'

const row = (
  accountId: string,
  group: BalanceSheetGroupRow['group'],
  over: Partial<BalanceSheetGroupRow> = {},
): BalanceSheetGroupRow => ({
  accountId,
  group,
  accountCode: accountId.toUpperCase(),
  accountName: accountId,
  status: 'ok',
  invalidReason: null,
  ...over,
})

describe('useBalanceSheetGroupsDraft — loading', () => {
  it('reports clean and empty while the query is still loading', () => {
    const { result } = renderHook(() => useBalanceSheetGroupsDraft(undefined))
    expect(result.current.isDirty).toBe(false)
    expect(result.current.payload).toEqual([])
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual([])
  })

  it('seeds from the server rows once they arrive, still clean', () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useBalanceSheetGroupsDraft(rows),
      { initialProps: { rows: undefined as BalanceSheetGroupRow[] | undefined } },
    )
    expect(result.current.isDirty).toBe(false)

    rerender({ rows: [row('cimb', 'BANK_BALANCE'), row('atome', 'OTHER_CURRENT_ASSETS')] })

    expect(result.current.isDirty).toBe(false)
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual(['cimb'])
    expect(result.current.accountsIn('OTHER_CURRENT_ASSETS')).toEqual(['atome'])
  })

  it('re-seeds when the server rows change (a save or refetch rebases the draft)', () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useBalanceSheetGroupsDraft(rows),
      { initialProps: { rows: [row('cimb', 'BANK_BALANCE')] } },
    )
    act(() => result.current.setAssignment('maybank', 'BANK_BALANCE'))
    expect(result.current.isDirty).toBe(true)

    // The post-save cache write: the draft must rebase onto it and report
    // clean, not keep comparing against the pre-save baseline.
    rerender({ rows: [row('cimb', 'BANK_BALANCE'), row('maybank', 'BANK_BALANCE')] })
    expect(result.current.isDirty).toBe(false)
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual(['cimb', 'maybank'])
  })

  it('does NOT clobber an in-progress edit when an identical refetch lands', () => {
    const rows = [row('cimb', 'BANK_BALANCE')]
    const { result, rerender } = renderHook(
      ({ rows: r }) => useBalanceSheetGroupsDraft(r),
      { initialProps: { rows } },
    )
    act(() => result.current.setAssignment('maybank', 'BANK_BALANCE'))

    // A NEW array with the SAME content, as RTK Query hands back on any
    // re-render. Re-seeding on reference identity would discard the edit.
    rerender({ rows: [row('cimb', 'BANK_BALANCE')] })
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual(['cimb', 'maybank'])
    expect(result.current.isDirty).toBe(true)
  })
})

describe('useBalanceSheetGroupsDraft — dirty state', () => {
  const initial = [row('cimb', 'BANK_BALANCE'), row('atome', 'OTHER_CURRENT_ASSETS')]

  it('adding an account makes it dirty', () => {
    const { result } = renderHook(() => useBalanceSheetGroupsDraft(initial))
    act(() => result.current.setAssignment('maybank', 'BANK_BALANCE'))
    expect(result.current.isDirty).toBe(true)
  })

  it('a there-and-back edit reports CLEAN', () => {
    // Dirty is a value comparison, not a mutation count — the point of the
    // complete-map shape.
    const { result } = renderHook(() => useBalanceSheetGroupsDraft(initial))
    act(() => result.current.setAssignment('maybank', 'BANK_BALANCE'))
    act(() => result.current.remove('maybank'))
    expect(result.current.isDirty).toBe(false)
  })

  it('a removal-then-readd of a persisted account reports CLEAN', () => {
    const { result } = renderHook(() => useBalanceSheetGroupsDraft(initial))
    act(() => result.current.remove('cimb'))
    expect(result.current.isDirty).toBe(true)
    act(() => result.current.setAssignment('cimb', 'BANK_BALANCE'))
    expect(result.current.isDirty).toBe(false)
  })

  it('MOVING an account between groups is dirty', () => {
    const { result } = renderHook(() => useBalanceSheetGroupsDraft(initial))
    act(() => result.current.setAssignment('atome', 'BANK_BALANCE'))
    expect(result.current.isDirty).toBe(true)
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual(['cimb', 'atome'])
    expect(result.current.accountsIn('OTHER_CURRENT_ASSETS')).toEqual([])
  })

  it('reset discards edits and returns to the server rows', () => {
    const { result } = renderHook(() => useBalanceSheetGroupsDraft(initial))
    act(() => result.current.setAssignment('maybank', 'BANK_BALANCE'))
    act(() => result.current.remove('atome'))
    expect(result.current.isDirty).toBe(true)

    act(() => result.current.reset())
    expect(result.current.isDirty).toBe(false)
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual(['cimb'])
    expect(result.current.accountsIn('OTHER_CURRENT_ASSETS')).toEqual(['atome'])
  })
})

describe('useBalanceSheetGroupsDraft — removals', () => {
  it('removing every account is dirty and yields an EMPTY payload', () => {
    /*
     * The case a sparse overlay cannot express. An empty payload is a real,
     * user-authored value meaning "clear both groups and re-arm the
     * fallbacks" — distinct from "nothing staged", which reports clean.
     */
    const { result } = renderHook(() =>
      useBalanceSheetGroupsDraft([row('cimb', 'BANK_BALANCE')]),
    )
    act(() => result.current.remove('cimb'))
    expect(result.current.isDirty).toBe(true)
    expect(result.current.payload).toEqual([])
  })

  it('removing one member leaves the others in place', () => {
    const { result } = renderHook(() =>
      useBalanceSheetGroupsDraft([
        row('cimb', 'BANK_BALANCE'),
        row('maybank', 'BANK_BALANCE'),
      ]),
    )
    act(() => result.current.remove('cimb'))
    expect(result.current.accountsIn('BANK_BALANCE')).toEqual(['maybank'])
  })

  it('removing an account not in any group is a no-op', () => {
    const { result } = renderHook(() =>
      useBalanceSheetGroupsDraft([row('cimb', 'BANK_BALANCE')]),
    )
    act(() => result.current.remove('ghost'))
    expect(result.current.isDirty).toBe(false)
  })
})

describe('useBalanceSheetGroupsDraft — payload', () => {
  it('sends the COMPLETE set, not just the changes', () => {
    // Replacement semantics: an untouched member must still be in the body, or
    // saving an addition would silently delete everything else.
    const { result } = renderHook(() =>
      useBalanceSheetGroupsDraft([row('cimb', 'BANK_BALANCE')]),
    )
    act(() => result.current.setAssignment('atome', 'OTHER_CURRENT_ASSETS'))
    expect(result.current.payload).toEqual([
      { accountId: 'cimb', group: 'BANK_BALANCE' },
      { accountId: 'atome', group: 'OTHER_CURRENT_ASSETS' },
    ])
  })
})
