import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import '@testing-library/jest-dom/vitest'
import MandatoryPasswordChangePage from '../MandatoryPasswordChangePage'
import authReducer from '../../../store/slices/authSlice'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

const renderPage = () => {
  const store = configureStore({ reducer: { auth: authReducer } })
  render(
    <Provider store={store}>
      <BrowserRouter>
        <MandatoryPasswordChangePage />
      </BrowserRouter>
    </Provider>
  )
}

describe('MandatoryPasswordChangePage', () => {
  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /password change required/i })).toBeInTheDocument()
  })

  it('does not apply a hardcoded gradient background', () => {
    renderPage()

    const allElements = document.querySelectorAll('*')
    const hasGradient = Array.from(allElements).some(el =>
      (el as HTMLElement).style?.background?.includes('667eea')
    )

    expect(hasGradient).toBe(false)
  })
})
