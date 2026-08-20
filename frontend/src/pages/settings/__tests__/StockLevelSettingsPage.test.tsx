import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import StockLevelSettingsPage from '../StockLevelSettingsPage'

const mockedSettingsApi = vi.hoisted(() => ({
  useGetRegionalSettingsQuery: vi.fn(),
  useUpdateRegionalSettingsMutation: vi.fn(),
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockedSettingsApi.useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation: mockedSettingsApi.useUpdateRegionalSettingsMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

describe('StockLevelSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSettingsApi.useUpdateRegionalSettingsMutation.mockReturnValue([vi.fn(), {}])
  })

  it('renders loading spinner while fetching', () => {
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    render(<StockLevelSettingsPage />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders the threshold input with the saved value', () => {
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: {
        id: '1',
        currency: 'MYR',
        costingMethod: 'AVERAGE',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        numberFormat: '1,234.56',
        timezone: 'Asia/Kuala_Lumpur',
        lowStockThreshold: 15,
        createdAt: '',
        updatedAt: '',
        isActive: true,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<StockLevelSettingsPage />)

    const input = screen.getByLabelText(/low stock threshold/i)
    expect(input).toBeInTheDocument()
    // Compact field size (#1100). Structural only: MUI puts
    // MuiInputBase-sizeSmall on the InputBase root for size="small" and omits
    // it for the medium default. Pixel height is browser-only (no jsdom layout).
    expect(
      input.closest('.MuiInputBase-root')?.classList.contains('MuiInputBase-sizeSmall'),
    ).toBe(true)
  })

  it('renders error alert when fetch fails', () => {
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
      refetch: vi.fn(),
    })

    render(<StockLevelSettingsPage />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
