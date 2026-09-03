import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useFormBMappingDraft } from '../useFormBMappingDraft'

const row = (accountId: string, category: any = null) => ({ accountId, category })

describe('useFormBMappingDraft', () => {
  it('starts clean', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    expect(result.current.isDirty).toBe(false)
    expect(result.current.changedItems()).toEqual([])
  })

  it('stages an edit without touching the persisted row', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', 'RENT_LEASE' as any, null))

    expect(result.current.isDirty).toBe(true)
    expect(result.current.isRowDirty('a1')).toBe(true)
    expect(result.current.valueFor(row('a1', null))).toBe('RENT_LEASE')
    expect(result.current.changedItems()).toEqual([
      { accountId: 'a1', category: 'RENT_LEASE' },
    ])
  })

  it('treats a staged null as a real value, not as absent', () => {
    // The regression this hook exists to prevent: `draft[id] ?? row.category`
    // would render the persisted mapping for a staged clear.
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', null, 'RENT_LEASE' as any))

    expect(result.current.isRowDirty('a1')).toBe(true)
    expect(result.current.valueFor(row('a1', 'RENT_LEASE'))).toBeNull()
    expect(result.current.changedItems()).toEqual([
      { accountId: 'a1', category: null },
    ])
  })

  it('reports clean when an edit returns to the persisted value', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', 'COMMISSION' as any, 'RENT_LEASE' as any))
    act(() => result.current.setMapping('a1', 'RENT_LEASE' as any, 'RENT_LEASE' as any))

    expect(result.current.isDirty).toBe(false)
    expect(result.current.isRowDirty('a1')).toBe(false)
    expect(result.current.changedItems()).toEqual([])
  })

  it('reports clean when a staged clear is undone', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', null, null))
    expect(result.current.isDirty).toBe(false)
  })

  it('falls through to the persisted value for an untouched row', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', 'RENT_LEASE' as any, null))

    expect(result.current.valueFor(row('b1', 'COMMISSION' as any))).toBe('COMMISSION')
    expect(result.current.isRowDirty('b1')).toBe(false)
  })

  it('tracks several rows and counts them', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', 'RENT_LEASE' as any, null))
    act(() => result.current.setMapping('b1', null, 'COMMISSION' as any))

    expect(result.current.dirtyCount).toBe(2)
    expect(result.current.changedItems()).toHaveLength(2)
  })

  it('reset discards every staged edit', () => {
    const { result } = renderHook(() => useFormBMappingDraft())
    act(() => result.current.setMapping('a1', 'RENT_LEASE' as any, null))
    act(() => result.current.reset())

    expect(result.current.isDirty).toBe(false)
    expect(result.current.valueFor(row('a1', null))).toBeNull()
  })
})
