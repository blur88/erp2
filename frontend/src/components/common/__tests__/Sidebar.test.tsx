import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'

vi.mock('react-transition-group', async () => {
  const actual = await vi.importActual<typeof import('react-transition-group')>(
    'react-transition-group'
  )

  const InstantTransition = ({ in: isOpen, children }: { in?: boolean; children: any }) => {
    if (!isOpen) {
      return null
    }

    return typeof children === 'function' ? children('entered', {}) : children
  }

  return {
    ...actual,
    Transition: InstantTransition as any,
    CSSTransition: InstantTransition as any,
  }
})

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('collapses expanded groups when navigating to a route without a parent group', async () => {
    render(
      <MemoryRouter initialEntries={['/sales/customers']}>
        <Sidebar />
      </MemoryRouter>
    )

    expect(screen.getByText('Customers')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))

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
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.queryByText('Sales Reports')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))

    await waitFor(() => {
      expect(screen.getByText('Sales Reports')).toBeInTheDocument()
    })
  })

  it('renders accounting reports as a parent group after accounting', async () => {
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
    fireEvent.click(accountingReportsButton)
    await waitFor(() => {
      expect(screen.getByText('Trial Balance')).toBeInTheDocument()
    })
  })
})
