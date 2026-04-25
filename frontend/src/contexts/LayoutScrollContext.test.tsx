import React, { useState } from 'react'
import { render, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
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
    // Render a parent that tracks the context value and conditionally mounts
    // a child that calls useLayoutScroll(true). Unmounting the child must
    // trigger cleanup and reset the context to false.
    let observedValue: boolean | null = null

    const Observer = () => {
      observedValue = useLayoutScrollContext()
      return null
    }

    const Controller = () => {
      useLayoutScroll(true)
      return null
    }

    const App = ({ showController }: { showController: boolean }) => (
      <LayoutScrollProvider>
        <Observer />
        {showController && <Controller />}
      </LayoutScrollProvider>
    )

    const { rerender } = render(<App showController={true} />)
    expect(observedValue).toBe(true)

    act(() => { rerender(<App showController={false} />) })
    expect(observedValue).toBe(false)
  })
})
