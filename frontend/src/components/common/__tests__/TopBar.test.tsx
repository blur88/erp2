import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import TopBar from '../TopBar'

vi.mock('../NotificationPanel', () => ({ default: () => null }))
vi.mock('../SystemStatus', () => ({ default: () => <div data-testid="system-status" /> }))
vi.mock('../SearchModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="search-modal" /> : null),
}))

const mockUseMatches = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useMatches: () => mockUseMatches(),
  }
})

function makeStore(unreadCount = 0) {
  return configureStore({
    reducer: {
      notifications: (state = { notifications: [], unreadCount }) => state,
    },
  })
}

function renderTopBar(path: string, collapsed = false) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[path]}>
        <TopBar collapsed={collapsed} onMobileMenuOpen={vi.fn()} />
      </MemoryRouter>
    </Provider>
  )
}

describe('TopBar breadcrumbs', () => {
  it('shows leaf segment for a known single-segment path', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])

    renderTopBar('/dashboard')

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows multi-segment breadcrumb for deep path', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Create Product' } }])

    renderTopBar('/inventory/products/create')

    expect(screen.getByText('Inventory')).toBeInTheDocument()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByText('Create Product')).toBeInTheDocument()
  })

  it('renders nothing in breadcrumb area for unmapped path', () => {
    mockUseMatches.mockReturnValue([])

    renderTopBar('/unknown/path')

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders ancestor breadcrumb segments as links for navigable paths', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Products' } }])

    renderTopBar('/inventory/products')

    const inventoryLink = screen.getByRole('link', { name: 'Inventory' })
    expect(inventoryLink).toBeInTheDocument()
    expect(inventoryLink).toHaveAttribute('href', '/inventory')
  })
})

describe('TopBar search', () => {
  it('opens search modal when search trigger is clicked', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])

    renderTopBar('/dashboard')
    const searchTrigger = screen.getByRole('button', { name: /open global search/i })

    fireEvent.click(searchTrigger)

    expect(screen.getByTestId('search-modal')).toBeInTheDocument()
  })

  it('opens search modal on Ctrl+K', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])

    renderTopBar('/dashboard')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByTestId('search-modal')).toBeInTheDocument()
  })

  it('does not open search modal when Ctrl+K fires inside an input', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])

    renderTopBar('/dashboard')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })

    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument()
    document.body.removeChild(input)
  })
})

describe('TopBar mobile layout', () => {
  it('shows leaf page title on mobile and hides search trigger', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Create Product' } }])

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    renderTopBar('/inventory/products/create')

    expect(screen.getByText('Create Product')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open drawer/i })).toBeInTheDocument()
  })
})
