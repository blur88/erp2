import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useFieldDuplicateCheck } from '../useFieldDuplicateCheck'

describe('useFieldDuplicateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire checkFn before debounce delay', () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })

    renderHook(() => useFieldDuplicateCheck('hello', checkFn))

    expect(checkFn).not.toHaveBeenCalled()
  })

  it('fires checkFn after debounce delay', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })

    renderHook(() => useFieldDuplicateCheck('hello', checkFn))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(checkFn).toHaveBeenCalledWith('hello', undefined)
  })

  it('does not fire when skipCheck is true', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })

    renderHook(() => useFieldDuplicateCheck('hello', checkFn, { skipCheck: true }))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(checkFn).not.toHaveBeenCalled()
  })

  it('does not fire when value is shorter than minLength', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })

    renderHook(() => useFieldDuplicateCheck('a', checkFn, { minLength: 2 }))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(checkFn).not.toHaveBeenCalled()
  })

  it('sets hasDuplicate and error when checkFn returns exists: true', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: true, message: 'Already taken' })
    const { result } = renderHook(() => useFieldDuplicateCheck('taken', checkFn))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.hasDuplicate).toBe(true)
    expect(result.current.error).toBe('Already taken')
    expect(result.current.successMessage).toBeNull()
    expect(result.current.hasChecked).toBe(true)
  })

  it('sets successMessage when checkFn returns exists: false', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    const { result } = renderHook(() => useFieldDuplicateCheck('available', checkFn))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.hasDuplicate).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.successMessage).toBe('✓ Available')
    expect(result.current.hasChecked).toBe(true)
  })

  it('cancels pending debounce when value changes before delay elapses', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })
    const { rerender } = renderHook(
      ({ value }: { value: string }) => useFieldDuplicateCheck(value, checkFn),
      { initialProps: { value: 'abc' } },
    )

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    rerender({ value: 'abcd' })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(checkFn).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(checkFn).toHaveBeenCalledTimes(1)
    expect(checkFn).toHaveBeenCalledWith('abcd', undefined)
  })

  it('swallows checkFn errors silently', async () => {
    const checkFn = vi.fn().mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useFieldDuplicateCheck('hello', checkFn))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.hasDuplicate).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.hasChecked).toBe(false)
  })

  it('passes excludeId to checkFn', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: false })

    renderHook(() => useFieldDuplicateCheck('hello', checkFn, { excludeId: 'id-123' }))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(checkFn).toHaveBeenCalledWith('hello', 'id-123')
  })

  it('clears state when skipCheck becomes true', async () => {
    const checkFn = vi.fn().mockResolvedValue({ exists: true, message: 'Taken' })
    const { result, rerender } = renderHook(
      ({ skip }: { skip: boolean }) => useFieldDuplicateCheck('taken', checkFn, { skipCheck: skip }),
      { initialProps: { skip: false } },
    )

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.hasDuplicate).toBe(true)

    rerender({ skip: true })

    expect(result.current.hasDuplicate).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.hasChecked).toBe(false)
  })
})
