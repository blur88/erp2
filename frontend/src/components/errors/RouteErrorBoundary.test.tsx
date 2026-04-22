import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { darkTheme } from '@/styles/theme'
import RouteErrorBoundary from './RouteErrorBoundary'

function renderWithError(error: unknown) {
  function ThrowingComponent() {
    throw error
  }

  const router = createMemoryRouter([
    {
      path: '/',
      element: <ThrowingComponent />,
      errorElement: <RouteErrorBoundary />,
    },
  ])

  return render(
    <ThemeProvider theme={darkTheme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

describe('RouteErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('chunk-load error state', () => {
    it('renders "App Updated" heading', () => {
      renderWithError(new Error('Importing a module script failed'))
      expect(screen.getByRole('heading', { name: /app updated/i })).toBeInTheDocument()
    })

    it('renders "Refresh Page" button', () => {
      renderWithError(new Error('Importing a module script failed'))
      expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument()
    })

    it('renders "Go to Dashboard" button', () => {
      renderWithError(new Error('Importing a module script failed'))
      expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()
    })
  })

  describe('generic error state', () => {
    it('renders "Something Went Wrong" heading', () => {
      renderWithError(new Error('something broke'))
      expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    })

    it('renders "Reload Page" button', () => {
      renderWithError(new Error('something broke'))
      expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
    })

    it('renders "Go Home" button', () => {
      renderWithError(new Error('something broke'))
      expect(screen.getByRole('button', { name: /go home/i })).toBeInTheDocument()
    })
  })
})
