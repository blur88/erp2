import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, expect, it, vi } from 'vitest'

import PageHeader from '../PageHeader'

const theme = createTheme()

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('PageHeader', () => {
  it('renders title', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.getByText('Sales Orders')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    renderWithTheme(<PageHeader title="Sales Orders" subtitle="Manage your orders" />)
    expect(screen.getByText('Manage your orders')).toBeInTheDocument()
  })

  it('does not render subtitle when omitted', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.queryByText(/manage/i)).not.toBeInTheDocument()
  })

  it('renders primary action button when provided', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Create Order' })).toBeInTheDocument()
  })

  it('renders secondary action button when provided', () => {
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeInTheDocument()
  })

  it('calls onClick when primary button is clicked', () => {
    const onClick = vi.fn()
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Order' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('calls onClick when secondary button is clicked', () => {
    const onClick = vi.fn()
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'View Deleted' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders disabled primary button correctly', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick: vi.fn(), disabled: true }} />)
    expect(screen.getByRole('button', { name: 'Create Order' })).toBeDisabled()
  })

  it('renders disabled secondary button correctly', () => {
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick: vi.fn(), disabled: true }} />)
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeDisabled()
  })

  it('does not render actions box when neither action is provided', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders only primary button when only primaryAction is provided', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick: vi.fn() }} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Create Order' })).toBeInTheDocument()
  })

  it('renders only secondary button when only secondaryAction is provided', () => {
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick: vi.fn() }} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeInTheDocument()
  })

  it('does not crash when button onClick is omitted', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order' }} />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Create Order' }))).not.toThrow()
  })

  it('shows divider by default', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.getByTestId('page-header-divider')).toBeInTheDocument()
  })

  it('hides divider when showDivider is false', () => {
    renderWithTheme(<PageHeader title="Create Sales Order" showDivider={false} />)
    expect(screen.queryByTestId('page-header-divider')).not.toBeInTheDocument()
  })

  it('renders children when provided', () => {
    renderWithTheme(
      <PageHeader title="T">
        <span>extra content</span>
      </PageHeader>
    )
    expect(screen.getByText('extra content')).toBeInTheDocument()
  })

  describe('slot rendering', () => {
    it('renders meta when provided', () => {
      renderWithTheme(
        <PageHeader title="T" meta={<span data-testid="meta-content">Meta</span>} />
      )
      expect(screen.getByTestId('meta-content')).toBeInTheDocument()
    })

    it('does not render meta wrapper when meta is not provided', () => {
      renderWithTheme(<PageHeader title="T" />)
      expect(screen.queryByTestId('page-header-meta')).not.toBeInTheDocument()
    })

    it('renders toolbar when provided', () => {
      renderWithTheme(
        <PageHeader title="T" toolbar={<span data-testid="toolbar-content">Toolbar</span>} />
      )
      expect(screen.getByTestId('toolbar-content')).toBeInTheDocument()
    })

    it('does not render toolbar wrapper when toolbar is not provided', () => {
      renderWithTheme(<PageHeader title="T" />)
      expect(screen.queryByTestId('page-header-toolbar')).not.toBeInTheDocument()
    })

    it('does not render children wrapper when children is not provided', () => {
      renderWithTheme(<PageHeader title="T" />)
      expect(screen.queryByTestId('page-header-children')).not.toBeInTheDocument()
    })

    it('renders meta before toolbar in the DOM', () => {
      renderWithTheme(
        <PageHeader
          title="T"
          meta={<span data-testid="meta-content">Meta</span>}
          toolbar={<span data-testid="toolbar-content">Toolbar</span>}
        />
      )
      const meta = screen.getByTestId('meta-content')
      const toolbar = screen.getByTestId('toolbar-content')
      expect(meta.compareDocumentPosition(toolbar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('renders toolbar before children in the DOM', () => {
      renderWithTheme(
        <PageHeader title="T" toolbar={<span data-testid="toolbar-content">Toolbar</span>}>
          <span data-testid="children-content">Children</span>
        </PageHeader>
      )
      const toolbar = screen.getByTestId('toolbar-content')
      const children = screen.getByTestId('children-content')
      expect(toolbar.compareDocumentPosition(children)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('accepts variant prop without error', () => {
      expect(() =>
        renderWithTheme(<PageHeader title="T" variant="report" />)
      ).not.toThrow()
    })
  })

  it('keeps the desktop header row on a single line while allowing the title block to shrink', () => {
    const { container } = renderWithTheme(
      <PageHeader
        title="A very long page title that should be allowed to shrink within the left column"
        subtitle="Subtitle"
        primaryAction={{ label: 'Primary', onClick: vi.fn() }}
        secondaryAction={{ label: 'Secondary', onClick: vi.fn() }}
      />
    )

    const boxes = Array.from(container.querySelectorAll('.MuiBox-root'))
    const topRow = boxes.find((box) => window.getComputedStyle(box).justifyContent === 'space-between')
    expect(topRow).toBeTruthy()
    expect(window.getComputedStyle(topRow as HTMLElement).flexWrap).toBe('nowrap')

    const title = screen.getByText(
      'A very long page title that should be allowed to shrink within the left column'
    )
    const titleBlock = title.closest('.MuiBox-root')
    expect(titleBlock).toBeTruthy()
    expect(window.getComputedStyle(titleBlock as HTMLElement).flex).toBe('1 1 auto')
  })
})
