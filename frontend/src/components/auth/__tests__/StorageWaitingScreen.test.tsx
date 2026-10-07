import { describe, it, expect, vi } from 'vitest'
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
})
