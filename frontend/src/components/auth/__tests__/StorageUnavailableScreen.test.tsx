import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StorageUnavailableScreen from '../StorageUnavailableScreen'

describe('StorageUnavailableScreen', () => {
  it('renders the message and a reload button', () => {
    render(<StorageUnavailableScreen />)
    expect(
      screen.getByText(
        'This browser cannot store your session safely. Allow site data for this address, then reload.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('the reload button reloads the page', () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })
    render(<StorageUnavailableScreen />)
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reload).toHaveBeenCalled()
    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })
})
