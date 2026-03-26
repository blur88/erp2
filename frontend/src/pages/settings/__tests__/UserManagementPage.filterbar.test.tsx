import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserManagementPage from '../UserManagementPage'
import authReducer from '@/store/slices/authSlice'

const { useGetUsersQuery } = vi.hoisted(() => ({
  useGetUsersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/userManagementApi', () => ({
  useGetUsersQuery,
  useGetStatisticsQuery: vi.fn(() => ({ data: undefined })),
  useDeactivateUserMutation: vi.fn(() => [vi.fn(), {}]),
  useUnlockUserMutation: vi.fn(() => [vi.fn(), {}]),
  useUpdateUserMutation: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/settings/UserFormDialog', () => ({
  default: () => <div>UserFormDialog</div>,
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 'u1',
          username: 'admin',
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          status: 'active',
          isActive: true,
          failedLoginAttempts: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        accessToken: 'tok',
        refreshToken: 'refresh',
        isAuthenticated: true,
        loading: false,
        error: null,
        lastActivityTime: null,
        inactivityTimeoutMinutes: 30,
        rememberMe: false,
      },
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <UserManagementPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('UserManagementPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name, email, or username/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes to query', () => {
    renderPage('/?role=manager&status=active&search=john')
    expect(useGetUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ role: 'manager', status: 'active', search: 'john' }),
    )
  })

  it('does not render More Filters button (no advanced filters)', () => {
    renderPage()
    expect(screen.queryByText(/more filters/i)).not.toBeInTheDocument()
  })
})
