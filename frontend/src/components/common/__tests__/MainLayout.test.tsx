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

  it('exposes the app-shell-root print hook on the outer container', () => {
    // This Box is a 100vh flex container, and it is the ancestor a non-portaled
    // print page (an analytical accounting report) must have released before it
    // can paginate. No structural selector reaches it: RootLayout's own Box is
    // `#root > *`, so this sits one level below that and above `main`.
    // accountingReportPrint.css targets `.app-shell-root` by name — renaming it
    // here silently truncates every printed report to one page, which no test
    // can catch because jsdom does not evaluate @media print.
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
