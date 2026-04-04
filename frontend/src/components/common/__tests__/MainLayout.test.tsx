import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, it, vi } from 'vitest'
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
})
