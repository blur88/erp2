import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIdleTimer } from '../useIdleTimer'

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const TIMEOUT = 12 * 60 * 60 * 1000 // 12 hours
  const WARNING = 5 * 60 * 1000 // 5 minutes
  const IDLE_DELAY = TIMEOUT - WARNING

  it('calls onIdle after timeout - warningTime ms of inactivity', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, onIdle, enabled: true }))

    act(() => { vi.advanceTimersByTime(IDLE_DELAY - 1) })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(1) })
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('calls onTimeout after full timeout ms of inactivity', () => {
    const onTimeout = vi.fn()
    renderHook(() => useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, onTimeout, enabled: true }))

    act(() => { vi.advanceTimersByTime(TIMEOUT) })
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('calls onActive and resets timer when activity occurs during warning', () => {
    const onIdle = vi.fn()
    const onActive = vi.fn()
    const { result } = renderHook(() =>
      useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, onIdle, onActive, enabled: true })
    )

    // Trigger idle state
    act(() => { vi.advanceTimersByTime(IDLE_DELAY) })
    expect(onIdle).toHaveBeenCalledOnce()

    // Simulate user activity
    act(() => { result.current.reset() })
    expect(onActive).toHaveBeenCalledOnce()
    expect(result.current.remainingTime).toBe(0)
  })

  it('does not fire when disabled', () => {
    const onIdle = vi.fn()
    const onTimeout = vi.fn()
    renderHook(() =>
      useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, onIdle, onTimeout, enabled: false })
    )

    act(() => { vi.advanceTimersByTime(TIMEOUT + 1000) })
    expect(onIdle).not.toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
