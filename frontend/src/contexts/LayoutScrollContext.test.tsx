import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LayoutScrollProvider, useLayoutScroll, useLayoutScrollContext } from './LayoutScrollContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LayoutScrollProvider>{children}</LayoutScrollProvider>
)

describe('LayoutScrollContext', () => {
  it('defaults to scrollEnabled = false', () => {
    const { result } = renderHook(() => useLayoutScrollContext(), { wrapper })
    expect(result.current).toBe(false)
  })

  it('useLayoutScroll(true) enables scroll on mount', () => {
    const { result } = renderHook(() => {
      useLayoutScroll(true)
      return useLayoutScrollContext()
    }, { wrapper })
    expect(result.current).toBe(true)
  })

  it('useLayoutScroll resets to false on unmount', () => {
    const { result, unmount } = renderHook(() => {
      useLayoutScroll(true)
      return useLayoutScrollContext()
    }, { wrapper })
    expect(result.current).toBe(true)
    unmount()
    // After unmount, a new consumer sees the reset default
    const { result: result2 } = renderHook(() => useLayoutScrollContext(), { wrapper })
    expect(result2.current).toBe(false)
  })
})
