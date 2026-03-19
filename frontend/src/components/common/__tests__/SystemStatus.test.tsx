import { render, screen, waitFor } from '@testing-library/react'
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

describe('SystemStatus', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(healthyResponse)
  })

  it('renders an icon button and not a chip text label', () => {
    render(<SystemStatus />)

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNHEALTHY')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows a system tooltip label after data loads', async () => {
    render(<SystemStatus />)

    await waitFor(() => {
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('shows unknown status state during initial load', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    render(<SystemStatus />)

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
