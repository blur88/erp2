import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import InventoryCostingPage from '../InventoryCostingPage'

const mockedSettingsApi = vi.hoisted(() => ({
  useGetRegionalSettingsQuery: vi.fn(),
  useUpdateRegionalSettingsMutation: vi.fn(),
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockedSettingsApi.useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation: mockedSettingsApi.useUpdateRegionalSettingsMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/services/api', () => ({ ApiService: { post: vi.fn() } }))

describe('InventoryCostingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: { costingMethod: 'AVERAGE' },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockedSettingsApi.useUpdateRegionalSettingsMutation.mockReturnValue([vi.fn(), {}])
  })

  it('offers only Average Cost and FIFO', () => {
    render(<InventoryCostingPage />)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /inventory costing method/i }))

    const listbox = within(screen.getByRole('listbox'))
    expect(listbox.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Average Cost',
      'FIFO (First In, First Out)',
    ])
  })
})
