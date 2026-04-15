import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import GenericListPage from './GenericListPage'

const noop = () => {}
const filterConfig = { search: { placeholder: 'Search...' }, fields: [], defaults: {} }
const handlers = {
  onSearchChange: noop,
  onSearchCommit: noop,
  onQuickFilterChange: noop,
  onClearField: noop,
  onClearAll: noop,
}
const sort = {
  field: 'name',
  sortBy: 'name',
  sortOrder: 'asc' as const,
  onSort: noop,
}

const baseProps = {
  title: 'Test Title',
  subtitle: 'Test subtitle',
  primaryAction: { label: 'New Item', onClick: noop },
  secondaryAction: { label: 'View Deleted', onClick: noop },
  filterConfig,
  draftFilters: {},
  handlers,
  hasActiveFilters: false,
  searchInputRef: { current: null },
  sort,
  listSlot: <div data-testid="list-slot">List</div>,
  headerSlot: <div data-testid="header-slot">Header</div>,
  workspaceSlot: <div data-testid="workspace-slot">Workspace</div>,
}

describe('GenericListPage', () => {
  it('renders title, subtitle, and all slots', () => {
    render(<GenericListPage {...baseProps} />)

    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByTestId('list-slot')).toBeInTheDocument()
    expect(screen.getByTestId('header-slot')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-slot')).toBeInTheDocument()
  })

  it('does not render error banner when error is null', () => {
    render(<GenericListPage {...baseProps} error={null} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders error banner when error is provided', () => {
    render(<GenericListPage {...baseProps} error="Something went wrong" onErrorClose={noop} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('calls onErrorClose when error banner is dismissed', () => {
    const onErrorClose = vi.fn()

    render(<GenericListPage {...baseProps} error="Error" onErrorClose={onErrorClose} />)

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onErrorClose).toHaveBeenCalled()
  })

  it('renders dialogs slot when provided', () => {
    render(<GenericListPage {...baseProps} dialogs={<div data-testid="dialogs">Dialogs</div>} />)

    expect(screen.getByTestId('dialogs')).toBeInTheDocument()
  })

  it('renders without a primary action when none is provided', () => {
    render(<GenericListPage {...baseProps} primaryAction={undefined} />)

    expect(screen.queryByRole('button', { name: 'New Item' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeInTheDocument()
  })

  it('renders filter extra content when provided', () => {
    render(<GenericListPage {...baseProps} filterExtra={<div>Filter Extra</div>} />)

    expect(screen.getByText('Filter Extra')).toBeInTheDocument()
  })

  it('renders content above the workspace when provided', () => {
    render(<GenericListPage {...baseProps} contentSlot={<div>Content Slot</div>} />)

    expect(screen.getByText('Content Slot')).toBeInTheDocument()
  })
})
