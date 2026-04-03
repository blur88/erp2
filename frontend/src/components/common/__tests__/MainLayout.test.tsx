import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import MainLayout from '../MainLayout'

vi.mock('../Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }))
vi.mock('../TopBar', () => ({ default: () => <div data-testid="topbar" /> }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
  }
})

function makeStore() {
  return configureStore({
    reducer: {
      notifications: (state = { notifications: [], unreadCount: 0 }) => state,
    },
  })
}

describe('MainLayout', () => {
  it('renders without crashing', () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <MainLayout />
        </MemoryRouter>
      </Provider>
    )
  })

  it('renders the routed content inside a shrinkable flex wrapper', () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <MainLayout />
        </MemoryRouter>
      </Provider>
    )

    const main = container.querySelector('main')
    const outlet = container.querySelector('[data-testid="outlet-content"]')
    const outletWrapper = outlet?.parentElement

    expect(main).not.toBeNull()
    expect(outletWrapper).not.toBeNull()
    const mainStyles = window.getComputedStyle(main as HTMLElement)
    const outletWrapperStyles = window.getComputedStyle(outletWrapper as HTMLElement)

    expect(mainStyles.display).toBe('flex')
    expect(mainStyles.flexDirection).toBe('column')
    expect(mainStyles.overflow).toBe('hidden')
    expect(outletWrapperStyles.display).toBe('flex')
    expect(outletWrapperStyles.flexDirection).toBe('column')
    expect(outletWrapperStyles.flexGrow).toBe('1')
    expect(outletWrapperStyles.minHeight).toBe('0px')
  })
})
