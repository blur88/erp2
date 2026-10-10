import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import StorageWaitingScreen from '../StorageWaitingScreen'

describe('StorageWaitingScreen', () => {
  it('renders the message and a Try again button, and nothing about reloading or site data', () => {
    render(<StorageWaitingScreen onRetry={vi.fn()} />)
    expect(
      screen.getByText('Still waiting for this browser’s session storage. Another tab may be busy.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(screen.queryByText(/cannot store your session/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument()
    expect(document.querySelector('form')).toBeNull()
  })

  it('Try again asks once and is disabled until the answer', async () => {
    let finish: () => void = () => undefined
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<StorageWaitingScreen onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /trying/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /trying/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish()
    })
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })

  describe('retrying by itself', () => {
    let visibility: DocumentVisibilityState = 'visible'
    const setVisibility = (next: DocumentVisibilityState) => {
      visibility = next
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }

    afterEach(() => {
      vi.useRealTimers()
      visibility = 'visible'
      Reflect.deleteProperty(document, 'visibilityState')
    })

    it('asks again every ten seconds while the tab is visible', async () => {
      vi.useFakeTimers()
      const onRetry = vi.fn(async () => undefined)
      render(<StorageWaitingScreen onRetry={onRetry} />)

      await act(() => vi.advanceTimersByTimeAsync(9_999))
      expect(onRetry).not.toHaveBeenCalled()
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(onRetry).toHaveBeenCalledTimes(1)
      await act(() => vi.advanceTimersByTimeAsync(10_000))
      expect(onRetry).toHaveBeenCalledTimes(2)
    })

    it('does not ask while hidden, and asks at once when visible again', async () => {
      vi.useFakeTimers()
      const onRetry = vi.fn(async () => undefined)
      render(<StorageWaitingScreen onRetry={onRetry} />)

      setVisibility('hidden')
      await act(() => vi.advanceTimersByTimeAsync(60_000))
      expect(onRetry).not.toHaveBeenCalled()

      setVisibility('visible')
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(onRetry).toHaveBeenCalledTimes(1)
      // And the ten seconds are counted from then.
      await act(() => vi.advanceTimersByTimeAsync(9_999))
      expect(onRetry).toHaveBeenCalledTimes(1)
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(onRetry).toHaveBeenCalledTimes(2)
    })

    it('a screen mounted hidden starts no timer until it is visible', async () => {
      vi.useFakeTimers()
      setVisibility('hidden')
      const onRetry = vi.fn(async () => undefined)
      render(<StorageWaitingScreen onRetry={onRetry} />)
      expect(vi.getTimerCount()).toBe(0)
      await act(() => vi.advanceTimersByTimeAsync(60_000))
      expect(onRetry).not.toHaveBeenCalled()
    })

    it('automatic and manual retries share one request, and an automatic one leaves the button alone', async () => {
      vi.useFakeTimers()
      let finish: () => void = () => undefined
      const onRetry = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      render(<StorageWaitingScreen onRetry={onRetry} />)

      // An automatic retry is under way. The button neither changes nor is
      // disabled: nobody pressed it, and disabling it would take the focus
      // from someone who is on it, every ten seconds.
      await act(() => vi.advanceTimersByTimeAsync(10_000))
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
      // The next tick and a return to the tab do not ask again while it is unanswered.
      await act(() => vi.advanceTimersByTimeAsync(10_000))
      setVisibility('hidden')
      setVisibility('visible')
      expect(onRetry).toHaveBeenCalledTimes(1)

      // Pressing the button now joins that request and says so.
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: /trying/i })).toBeDisabled()

      await act(async () => {
        finish()
      })
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()

      // A manual retry under way holds back the automatic one the same way.
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(onRetry).toHaveBeenCalledTimes(2)
      await act(() => vi.advanceTimersByTimeAsync(10_000))
      expect(onRetry).toHaveBeenCalledTimes(2)
    })

    it('unmounting stops the timer and the visibility listener', async () => {
      vi.useFakeTimers()
      const onRetry = vi.fn(async () => undefined)
      const { unmount } = render(<StorageWaitingScreen onRetry={onRetry} />)
      expect(vi.getTimerCount()).toBe(1)

      unmount()

      expect(vi.getTimerCount()).toBe(0)
      setVisibility('hidden')
      setVisibility('visible')
      await act(() => vi.advanceTimersByTimeAsync(60_000))
      expect(onRetry).not.toHaveBeenCalled()
    })

    it('an automatic retry that fails leaves the screen as it was', async () => {
      vi.useFakeTimers()
      const onRetry = vi.fn(async () => {
        throw new Error('no')
      })
      render(<StorageWaitingScreen onRetry={onRetry} />)
      await act(() => vi.advanceTimersByTimeAsync(10_000))
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    })
  })
})
