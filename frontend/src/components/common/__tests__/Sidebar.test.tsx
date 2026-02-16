import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import Sidebar from '../Sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('collapses expanded groups when navigating to a route without a parent group', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/sales/customers']}>
        <Sidebar />
      </MemoryRouter>
    )

    expect(screen.getByText('Customers')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))

    await waitFor(() => {
      expect(screen.queryByText('Customers')).not.toBeInTheDocument()
    })
  })

  it('renders accounting as its own top-level section', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const sectionHeaders = Array.from(document.querySelectorAll('.MuiTypography-overline')).map(
      element => element.textContent
    )

    expect(sectionHeaders).toContain('Operations')
    expect(sectionHeaders).toContain('Accounting')
    expect(sectionHeaders).toContain('Analytics')
    expect(sectionHeaders.indexOf('Operations')).toBeLessThan(sectionHeaders.indexOf('Accounting'))
    expect(sectionHeaders.indexOf('Accounting')).toBeLessThan(sectionHeaders.indexOf('Analytics'))
  })
})
