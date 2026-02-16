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

  it('renders reports as a parent group in analytics section', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.queryByText('Sales Reports')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reports' }))

    expect(screen.getByText('Sales Reports')).toBeInTheDocument()
  })

  it('renders accounting reports as a parent group after accounting', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const accountingButton = screen.getByRole('button', { name: 'Accounting' })
    const accountingReportsButton = screen.getByRole('button', { name: 'Accounting Reports' })

    expect(
      accountingButton.compareDocumentPosition(accountingReportsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    expect(screen.queryByText('Trial Balance')).not.toBeInTheDocument()
    await user.click(accountingReportsButton)
    expect(screen.getByText('Trial Balance')).toBeInTheDocument()
  })
})
