import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import AccountMappingWarning from '../AccountMappingWarning'
import { MappingType } from '@/types/accountMapping'
import accountMappingsReducer from '@/store/slices/accountMappingsSlice'

// Mock react-router-dom
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    BrowserRouter: ({ children }: any) => <div>{children}</div>,
  }
})

const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      accountMappings: accountMappingsReducer,
    },
    preloadedState: initialState,
  })
}

const renderWithStore = (component: React.ReactElement, initialState = {}) => {
  const store = createMockStore(initialState)
  return render(
    <Provider store={store}>
      <BrowserRouter>{component}</BrowserRouter>
    </Provider>
  )
}

describe('AccountMappingWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when mappings are valid', () => {
    const initialState = {
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: true,
        validationResult: {
          isComplete: true,
          missingMappings: [],
          configuredMappings: [
            MappingType.SALES_REVENUE,
            MappingType.SALES_AR,
            MappingType.SALES_COGS,
            MappingType.SALES_INVENTORY,
          ],
        },
      },
    }

    const { container } = renderWithStore(<AccountMappingWarning context="system" />, initialState)

    expect(container.querySelector('.MuiAlert-root')).toBeNull()
  })

  it('shows error alert when mappings invalid (system context)', async () => {
    const initialState = {
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: false,
        validationResult: {
          isComplete: false,
          missingMappings: [MappingType.SALES_REVENUE, MappingType.SALES_AR],
          configuredMappings: [],
        },
      },
    }

    renderWithStore(<AccountMappingWarning context="system" />, initialState)

    await waitFor(() => {
      expect(screen.getByText('Account Mappings Not Configured')).toBeInTheDocument()
      expect(
        screen.getByText(/Auto-posting is disabled. The following account mappings are missing/i)
      ).toBeInTheDocument()
    })
  })

  it('shows warning alert when mappings invalid (transaction context)', async () => {
    const initialState = {
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: false,
        validationResult: {
          isComplete: false,
          missingMappings: [MappingType.SALES_REVENUE],
          configuredMappings: [],
        },
      },
    }

    renderWithStore(
      <AccountMappingWarning context="transaction" action="fulfill this order" />,
      initialState
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          /You can fulfill this order, but accounting entry will not be created automatically/i
        )
      ).toBeInTheDocument()
    })
  })

  it('displays missing mappings count', async () => {
    const initialState = {
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: false,
        validationResult: {
          isComplete: false,
          missingMappings: [
            MappingType.SALES_REVENUE,
            MappingType.SALES_AR,
            MappingType.SALES_COGS,
          ],
          configuredMappings: [],
        },
      },
    }

    renderWithStore(<AccountMappingWarning context="system" />, initialState)

    await waitFor(() => {
      expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
      expect(screen.getByText('Sales - Accounts Receivable')).toBeInTheDocument()
      expect(screen.getByText('Sales - Cost of Goods Sold')).toBeInTheDocument()
    })
  })

  it('navigates to account mappings page when button clicked', async () => {
    const user = userEvent.setup()
    const initialState = {
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: false,
        validationResult: {
          isComplete: false,
          missingMappings: [MappingType.SALES_REVENUE],
          configuredMappings: [],
        },
      },
    }

    renderWithStore(<AccountMappingWarning context="system" />, initialState)

    const configureButton = await screen.findByRole('button', {
      name: /Configure Account Mappings/i,
    })
    await user.click(configureButton)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/account-mappings')
  })

  it('uses custom action text', async () => {
    const initialState = {
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: false,
        validationResult: {
          isComplete: false,
          missingMappings: [MappingType.SALES_REVENUE],
          configuredMappings: [],
        },
      },
    }

    renderWithStore(
      <AccountMappingWarning context="transaction" action="create this payment" />,
      initialState
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          /You can create this payment, but accounting entry will not be created automatically/i
        )
      ).toBeInTheDocument()
    })
  })
})
