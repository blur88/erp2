import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import MainLayout from '../MainLayout'

vi.mock('../Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }))
vi.mock('../NotificationPanel', () => ({ default: () => null }))
vi.mock('../SystemStatus', () => ({ default: () => null }))

const mockUseMatches = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useMatches: () => mockUseMatches(),
  }
})

function makeStore() {
  return configureStore({
    reducer: {
      auth: (
        state = {
          user: { firstName: 'Test', lastName: 'User', role: 'admin' },
          isAuthenticated: true,
          refreshToken: null,
        }
      ) => state,
      notifications: (state = { notifications: [], unreadCount: 0 }) => state,
    },
  })
}

function renderMainLayout() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <MainLayout />
      </MemoryRouter>
    </Provider>
  )
}

describe('MainLayout AppBar title', () => {
  beforeEach(() => {
    mockUseMatches.mockReturnValue([])
  })

  it('shows handle.title from the deepest matched route', () => {
    mockUseMatches.mockReturnValue([
      { id: '0', pathname: '/', params: {}, data: null, handle: null },
      { id: '1', pathname: '/inventory/products', params: {}, data: null, handle: { title: 'Products' } },
    ])

    renderMainLayout()

    expect(screen.getByText('Products')).toBeInTheDocument()
  })

  it('uses title from non-leaf match when leaf has no handle', () => {
    mockUseMatches.mockReturnValue([
      { id: '0', pathname: '/', params: {}, data: null, handle: { title: 'Inventory' } },
      { id: '1', pathname: '/inventory/products', params: {}, data: null, handle: null },
    ])

    renderMainLayout()

    expect(screen.getByText('Inventory')).toBeInTheDocument()
  })

  it('falls back to ERP System when no route has a handle.title', () => {
    mockUseMatches.mockReturnValue([{ id: '0', pathname: '/', params: {}, data: null, handle: null }])

    renderMainLayout()

    expect(screen.getByText('ERP System')).toBeInTheDocument()
  })

  it('falls back to ERP System when match chain is empty', () => {
    mockUseMatches.mockReturnValue([])

    renderMainLayout()

    expect(screen.getByText('ERP System')).toBeInTheDocument()
  })
})
