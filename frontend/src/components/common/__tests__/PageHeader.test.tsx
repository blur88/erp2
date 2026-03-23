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
})
