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

const mockedWorkspace = vi.hoisted(() => ({
  useEntityWorkspace: vi.fn(),
}))

const mockDispatch = vi.fn()

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingDialog', () => ({ default: () => null }))
vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => null,
}))
vi.mock('@/hooks/useEntityWorkspace', () => mockedWorkspace)

const configuredMapping = {
  id: '1',
  mappingType: MappingType.SALES_REVENUE,
  accountId: 'acc-1',
  description: 'Sales revenue account',
  isActive: true,
  account: { id: 'acc-1', code: '4000', name: 'Sales Revenue', accountType: 'Revenue' },
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

const workspaceDefaults = {
  focusedIndex: -1,
  listRef: { current: null },
  searchInputRef: { current: null },
  handleSelect: vi.fn(),
  setFocusedIndex: vi.fn(),
  deleteConfirmOpen: false,
  setDeleteConfirmOpen: vi.fn(),
  deletedEntitiesDialogOpen: false,
  setDeletedEntitiesDialogOpen: vi.fn(),
  setShouldPreserveSearchFocus: vi.fn(),
  handleDelete: vi.fn(),
  handleCancelDelete: vi.fn(),
  handleNavigateUp: vi.fn(),
  handleNavigateDown: vi.fn(),
  handleEnterAction: vi.fn(),
  handleEscapeAction: vi.fn(),
  handlePageUpNavigation: vi.fn(),
  handlePageDownNavigation: vi.fn(),
  handleNavigateToFirst: vi.fn(),
  handleNavigateToLast: vi.fn(),
}

describe('AccountMappingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({ data: [configuredMapping], isLoading: false, error: undefined, refetch: vi.fn() })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({ data: { isValid: true, missingMappings: [], configuredMappings: [], totalRequired: 0, totalConfigured: 0 }, refetch: vi.fn() })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({ data: { data: [] } })
    mockedApi.useDeleteAccountMappingMutation.mockReturnValue([vi.fn()])
    mockedWorkspace.useEntityWorkspace.mockReturnValue(workspaceDefaults)
  })

  it('renders title and mapping rows', async () => {
    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)
    await waitFor(() => {
      expect(screen.getByText('Account Mappings')).toBeInTheDocument()
      expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
    })
  })

  it('shows Edit and Clear buttons when a configured row is focused', async () => {
    mockedWorkspace.useEntityWorkspace.mockReturnValue({ ...workspaceDefaults, focusedIndex: 0 })

    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
    })
  })

  it('shows Configure button without Clear when an unconfigured row is focused', async () => {
    mockedWorkspace.useEntityWorkspace.mockReturnValue({ ...workspaceDefaults, focusedIndex: 1 })

    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /configure/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
    })
  })
})
