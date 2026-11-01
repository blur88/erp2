// @vitest-environment jsdom

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

  it('calls onActive and resets timer when activity occurs during warning', async () => {
    const onIdle = vi.fn()
    const onActive = vi.fn()
    const { result } = renderHook(() =>
      useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, onIdle, onActive, enabled: true })
    )

    // Trigger idle state
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_DELAY) })
    expect(onIdle).toHaveBeenCalledOnce()

    // Simulate user activity
    act(() => { result.current.reset() })
    expect(onActive).toHaveBeenCalledOnce()
    expect(result.current.remainingTime).toBe(0)
  })

  it('persists the first activity and waits for the required stay-signed-in write', async () => {
    const onActivity = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, onActivity, enabled: true }))
    await act(async () => { await Promise.resolve() })
    expect(onActivity).toHaveBeenCalledOnce()
    let settled = false
    await act(async () => { await result.current.reset().then(() => { settled = true }) })
    expect(settled).toBe(true)
    expect(onActivity).toHaveBeenCalledTimes(2)
  })

  it('does not sign out when another tab has recent shared activity', async () => {
    const getLastActivity = vi.fn(async () => Date.now())
    const onIdle = vi.fn()
    const onIdleTimeout = vi.fn()
    renderHook(() => useIdleTimer({ timeout: TIMEOUT, warningTime: WARNING, getLastActivity, onIdle, onIdleTimeout, enabled: true }))
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_DELAY) })
    expect(onIdle).not.toHaveBeenCalled()
    expect(onIdleTimeout).not.toHaveBeenCalled()
    expect(getLastActivity).toHaveBeenCalledOnce()
  })

  it('uses the 12 hour default when no timeout override is supplied', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ warningTime: WARNING, onIdle, enabled: true }))
    act(() => { vi.advanceTimersByTime(12 * 60 * 60 * 1000 - WARNING - 1) })
    expect(onIdle).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000 - WARNING) })
    expect(onIdle).toHaveBeenCalledOnce()
  })

  it('supports a short test idle timeout with a smaller warning window', async () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleTimer({ timeout: 30_000, warningTime: 5_000, onIdle, enabled: true }))
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000) })
    expect(onIdle).toHaveBeenCalledOnce()
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
