import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SystemStatus from '../SystemStatus'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

const healthyResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: 3600,
  environment: 'test',
  services: {
    backend: { status: 'healthy', message: 'OK' },
    database: { status: 'healthy', message: 'OK' },
    redis: { status: 'healthy', message: 'OK' },
  },
}

function renderSystemStatus(anchorEl: HTMLElement | null = null) {
  const onOpen = vi.fn()
  const onClose = vi.fn()
  render(<SystemStatus anchorEl={anchorEl} onOpen={onOpen} onClose={onClose} />)
  return { onOpen, onClose }
}

describe('SystemStatus', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(healthyResponse)
  })

  it('renders an icon button and not a chip text label', () => {
    renderSystemStatus()

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNHEALTHY')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows a system tooltip label after data loads', async () => {
    renderSystemStatus()

    await waitFor(() => {
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('shows unknown status state during initial load', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    renderSystemStatus()

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onOpen when the icon button is clicked', () => {
    const { onOpen } = renderSystemStatus()

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalled()
  })

  it('shows the unable to fetch message when health check fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const anchorEl = document.createElement('button')
    document.body.appendChild(anchorEl)
    renderSystemStatus(anchorEl)

    await waitFor(() => {
      expect(screen.getByText(/unable to fetch system health information/i)).toBeInTheDocument()
    })

    document.body.removeChild(anchorEl)
  })
})
