import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import AccountMappingsPage from '../AccountMappingsPage'
import { MappingType } from '@/types/accountMapping'

const mockedApi = vi.hoisted(() => ({
  useGetAccountMappingsQuery: vi.fn(),
  useValidateAccountMappingsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useDeleteAccountMappingMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingDialog', () => ({ default: () => null }))

describe('AccountMappingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({ data: [{ id: '1', mappingType: MappingType.SALES_REVENUE, accountId: 'acc-1', description: 'Sales revenue account', isActive: true, account: { id: 'acc-1', code: '4000', name: 'Sales Revenue', accountType: 'Revenue' }, createdAt: '2024-01-01', updatedAt: '2024-01-01' }], isLoading: false, error: undefined, refetch: vi.fn() })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({ data: { isValid: true, missingMappings: [], configuredMappings: [], totalRequired: 0, totalConfigured: 0 }, refetch: vi.fn() })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({ data: { data: [] } })
    mockedApi.useDeleteAccountMappingMutation.mockReturnValue([vi.fn()])
  })

  it('renders title and mapping rows', async () => {
    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)
    await waitFor(() => {
      expect(screen.getByText('Account Mappings')).toBeInTheDocument()
      expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
    })
  })
})
