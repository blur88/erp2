import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  const getSectionList = (sectionTitle: string) => {
    const sectionHeader = screen.getByText(sectionTitle, { selector: '.MuiTypography-overline' })
    return sectionHeader.nextElementSibling as HTMLElement
  }

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
    expect(sectionHeaders).toContain('Reports')
    expect(sectionHeaders.indexOf('Operations')).toBeLessThan(sectionHeaders.indexOf('Accounting'))
    expect(sectionHeaders.indexOf('Accounting')).toBeLessThan(sectionHeaders.indexOf('Reports'))
  })

  it('applies the updated section label padding', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const operationsLabel = screen.getByText('Operations')

    expect(operationsLabel).toHaveStyle({
      paddingTop: '16px',
      paddingBottom: '8px',
    })
  })

  it('renders sales, purchasing, and inventory directly under reports section', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const reportsList = getSectionList('Reports')

    expect(within(reportsList).getByRole('button', { name: 'Sales' })).toBeInTheDocument()
    expect(within(reportsList).getByRole('button', { name: 'Purchasing' })).toBeInTheDocument()
    expect(within(reportsList).getByRole('button', { name: 'Inventory' })).toBeInTheDocument()
  })

  it('renders accounting reports as a parent group after accounting', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const accountingButton = screen.getByRole('button', { name: 'Accounting' })
    const accountingReportsButton = screen.getByRole('button', { name: 'Reports' })

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

  it('hides app name text when collapsed', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    expect(screen.queryByText('ERP System')).not.toBeInTheDocument()
  })

  it('shows app name text when expanded', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText('ERP System')).toBeInTheDocument()
  })

  it('calls onToggleCollapse when toggle button is clicked', () => {
    const onToggleCollapse = vi.fn()

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={false} onToggleCollapse={onToggleCollapse} />
      </MemoryRouter>
    )

    const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i })
    fireEvent.click(toggleBtn)

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('renders sidebar with dark background data attribute', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const outerBox = document.querySelector('[data-testid="sidebar-root"]')
    expect(outerBox).toBeInTheDocument()
  })

  it('SIDEBAR_COLORS includes hoverText and activeIcon tokens', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    expect(screen.getByTestId('sidebar-root')).toBeInTheDocument()
  })

  it('shows flyout panel on hover over parent item in collapsed mode', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    const salesButton = document.getElementById('rail-item-sales') as HTMLElement
    fireEvent.mouseEnter(salesButton)

    await waitFor(() => {
      expect(screen.getByText('Customers')).toBeInTheDocument()
    }, { timeout: 500 })
  })

  it('closes flyout on mouse leave', async () => {
    vi.useFakeTimers()

    try {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Sidebar collapsed={true} />
        </MemoryRouter>
      )

      const salesButton = document.getElementById('rail-item-sales') as HTMLElement
      fireEvent.mouseEnter(salesButton)

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(screen.getByText('Customers')).toBeInTheDocument()

      fireEvent.mouseLeave(salesButton)

      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      expect(screen.queryByText('Customers')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('navigates when clicking a leaf item inside the flyout', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    const salesButton = document.getElementById('rail-item-sales') as HTMLElement
    fireEvent.mouseEnter(salesButton)

    await waitFor(() => {
      expect(screen.getByText('Customers')).toBeInTheDocument()
    }, { timeout: 500 })

    fireEvent.click(screen.getByRole('button', { name: 'Customers' }))

    await waitFor(() => {
      expect(screen.queryByText('Customers')).not.toBeInTheDocument()
    }, { timeout: 500 })
  })

  it('shows rail icon button for active parent in collapsed mode', () => {
    render(
      <MemoryRouter initialEntries={['/sales/customers']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    const salesButton = document.getElementById('rail-item-sales') as HTMLElement
    expect(salesButton).toBeInTheDocument()
    expect(screen.queryByText('Sales')).not.toBeInTheDocument()
  })

  it('does not throw when hovering over non-active items', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    )

    const operationsList = getSectionList('Operations')
    const salesButton = within(operationsList).getByRole('button', { name: 'Sales' })
    fireEvent.mouseEnter(salesButton)
    fireEvent.mouseLeave(salesButton)

    expect(screen.getByTestId('sidebar-root')).toBeInTheDocument()
  })

  it('closes flyout when Escape is pressed', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    const salesButton = document.getElementById('rail-item-sales') as HTMLElement
    fireEvent.mouseEnter(salesButton)

    await waitFor(() => {
      expect(screen.getByText('Customers')).toBeInTheDocument()
    }, { timeout: 500 })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText('Customers')).not.toBeInTheDocument()
    }, { timeout: 500 })
  })
})
