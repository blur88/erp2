import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import MainLayout from '../MainLayout'

vi.mock('../Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }))
vi.mock('../TopBar', () => ({ default: () => <div data-testid="topbar" /> }))

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

  it('applies a 24px gap below the app bar', () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <MainLayout />
        </MemoryRouter>
      </Provider>
    )

    expect(screen.getByRole('main')).toHaveStyle({ paddingTop: '88px' })
  })

  it('constrains the main content area to the layout height', () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <MainLayout />
        </MemoryRouter>
      </Provider>
    )

    expect(screen.getByRole('main')).toHaveStyle({ height: '100%' })
  })

  it('exposes app-shell-root on the outer container', () => {
    // This Box is the 100vh flex container that owns the app shell's height.
    // No structural selector reaches it: RootLayout's own Box is `#root > *`,
    // so this sits one level below that and above `main` — the class is the
    // only handle anything has on it.
    const { container } = render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <MainLayout />
        </MemoryRouter>
      </Provider>
    )

    const shell = container.querySelector('.app-shell-root')
    expect(shell).not.toBeNull()
    expect(shell).toContainElement(screen.getByRole('main'))
  })
})
