import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import AccountMappingWarning from '../AccountMappingWarning'
import { MappingType } from '@/types/accountMapping'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    BrowserRouter: ({ children }: any) => <div>{children}</div>,
  }
})

const mockedApi = vi.hoisted(() => ({
  useValidateAccountMappingsQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useValidateAccountMappingsQuery: mockedApi.useValidateAccountMappingsQuery,
}))

const renderWithStore = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>{component}</BrowserRouter>
  )
}

describe('AccountMappingWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when mappings are valid', () => {
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: true,
        isComplete: true,
        missingMappings: [],
        configuredMappings: [
          MappingType.SALES_REVENUE,
          MappingType.SALES_AR,
          MappingType.SALES_COGS,
          MappingType.SALES_INVENTORY,
        ],
      },
    })

    const { container } = renderWithStore(<AccountMappingWarning context="system" />)

    expect(container.querySelector('.MuiAlert-root')).toBeNull()
  })

  it('shows error alert when mappings invalid (system context)', () => {
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: false,
        isComplete: false,
        missingMappings: [MappingType.SALES_REVENUE, MappingType.SALES_AR],
        configuredMappings: [],
      },
    })

    renderWithStore(<AccountMappingWarning context="system" />)

    expect(screen.getByText('Account Mappings Not Configured')).toBeInTheDocument()
    expect(
      screen.getByText(/Auto-posting is disabled. The following account mappings are missing/i)
    ).toBeInTheDocument()
  })

  it('shows warning alert when mappings invalid (transaction context)', () => {
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: false,
        isComplete: false,
        missingMappings: [MappingType.SALES_REVENUE],
        configuredMappings: [],
      },
    })

    renderWithStore(
      <AccountMappingWarning context="transaction" action="fulfill this order" />,
    )

    expect(
      screen.getByText(
        /You can fulfill this order, but accounting entry will not be created automatically/i
      )
    ).toBeInTheDocument()
  })

  it('displays missing mappings count', () => {
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: false,
        isComplete: false,
        missingMappings: [
          MappingType.SALES_REVENUE,
          MappingType.SALES_AR,
          MappingType.SALES_COGS,
        ],
        configuredMappings: [],
      },
    })

    renderWithStore(<AccountMappingWarning context="system" />)

    expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
    expect(screen.getByText('Sales - Accounts Receivable')).toBeInTheDocument()
    expect(screen.getByText('Sales - Cost of Goods Sold')).toBeInTheDocument()
  })

  it('navigates to account mappings page when button clicked', async () => {
    const user = userEvent.setup()
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: false,
        isComplete: false,
        missingMappings: [MappingType.SALES_REVENUE],
        configuredMappings: [],
      },
    })

    renderWithStore(<AccountMappingWarning context="system" />)

    const configureButton = screen.getByRole('button', {
      name: /Configure Account Mappings/i,
    })
    await user.click(configureButton)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/account-mappings')
  })

  it('uses custom action text', () => {
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: false,
        isComplete: false,
        missingMappings: [MappingType.SALES_REVENUE],
        configuredMappings: [],
      },
    })

    renderWithStore(
      <AccountMappingWarning context="transaction" action="create this payment" />,
    )

    expect(
      screen.getByText(
        /You can create this payment, but accounting entry will not be created automatically/i
      )
    ).toBeInTheDocument()
  })
})
