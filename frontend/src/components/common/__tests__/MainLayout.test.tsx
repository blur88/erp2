import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
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

const ScrollOptInPage = () => {
  useLayoutScroll(true)
  return <div>Scrollable route</div>
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

  it('allows routed pages to opt in to main content scrolling', async () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route index element={<ScrollOptInPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>
    )

    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveStyle({ overflow: 'auto' })
    })
  })
})
