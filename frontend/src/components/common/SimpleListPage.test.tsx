import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import SimpleListPage from './SimpleListPage'

const noop = () => {}
const filterConfig = { search: { placeholder: 'Search...' }, fields: [], defaults: {} }
const handlers = {
  onSearchChange: noop,
  onSearchCommit: noop,
  onQuickFilterChange: noop,
  onClearField: noop,
  onClearAll: noop,
}
const sort = { field: 'name', sortBy: 'name', sortOrder: 'asc' as const, onSort: noop }

const baseProps = {
  title: 'Customers',
  subtitle: 'Manage customer records',
  primaryAction: { label: 'New Customer', onClick: noop },
  filterConfig,
  draftFilters: {},
  handlers,
  hasActiveFilters: false,
  searchInputRef: { current: null },
  sort,
  tableSlot: <div data-testid="table-slot">Table</div>,
}

describe('SimpleListPage', () => {
  it('renders title and subtitle', () => {
    render(<SimpleListPage {...baseProps} />)
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('Manage customer records')).toBeInTheDocument()
  })

  it('renders the table slot', () => {
    render(<SimpleListPage {...baseProps} />)
    expect(screen.getByTestId('table-slot')).toBeInTheDocument()
  })

  it('renders pagination slot when provided', () => {
    render(
      <SimpleListPage
        {...baseProps}
        paginationSlot={<div data-testid="pagination">Pagination</div>}
      />,
    )
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })

  it('renders error alert when error is provided', () => {
    render(<SimpleListPage {...baseProps} error="Something went wrong" onErrorClose={noop} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('calls onErrorClose when alert is dismissed', () => {
    const onErrorClose = vi.fn()
    render(<SimpleListPage {...baseProps} error="Error" onErrorClose={onErrorClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onErrorClose).toHaveBeenCalled()
  })

  it('renders primary action button', () => {
    render(<SimpleListPage {...baseProps} />)
    expect(screen.getByRole('button', { name: 'New Customer' })).toBeInTheDocument()
  })

  it('renders dialogs slot when provided', () => {
    render(
      <SimpleListPage
        {...baseProps}
        dialogs={<div data-testid="dialogs">Dialogs</div>}
      />,
    )
    expect(screen.getByTestId('dialogs')).toBeInTheDocument()
  })

  it('shows a loading spinner in the filter bar when isFetching is true', () => {
    render(<SimpleListPage {...baseProps} isFetching={true} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('does not show a loading spinner when isFetching is false', () => {
    render(<SimpleListPage {...baseProps} isFetching={false} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders filterExtra inside the filter toolbar', () => {
    render(
      <SimpleListPage
        {...baseProps}
        filterExtra={<div data-testid="filter-extra">Sort by</div>}
      />,
    )
    const toolbar = screen.getByTestId('page-header-toolbar')
    expect(within(toolbar).getByTestId('filter-extra')).toBeInTheDocument()
  })
})
