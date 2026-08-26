import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import EntityTable from './EntityTable'

interface Item {
  id: string
  name: string
  amount: number
}

const rows: Item[] = [
  { id: '1', name: 'Alpha', amount: 100 },
  { id: '2', name: 'Beta', amount: 200 },
]

const columns = [
  { key: 'name', render: (row: Item) => row.name },
  { key: 'amount', render: (row: Item) => `$${row.amount}`, width: 80 },
]

describe('EntityTable', () => {
  it('renders skeleton rows when loading with no data', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={true}
        total={0}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(document.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0)
  })

  it('renders empty state when not loading and no rows', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={false}
        total={0}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('No Items found')).toBeInTheDocument()
  })

  it('renders all rows', () => {
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('$200')).toBeInTheDocument()
  })

  it('shows count in header', () => {
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('Items (2)')).toBeInTheDocument()
  })

  it('calls onSelect when row clicked', async () => {
    const onSelect = vi.fn()

    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={onSelect}
        listRef={{ current: null }}
      />,
    )

    await userEvent.click(screen.getByText('Alpha'))
    expect(onSelect).toHaveBeenCalledWith(rows[0])
  })

  it('applies selected background to selected row', () => {
    const { container } = render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={2}
        label="Items"
        selectedId="1"
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    const selectedRow = container.querySelector('[data-index="0"]')
    expect(selectedRow).toBeInTheDocument()
  })

  it('shows Searching indicator when loading with existing rows', () => {
    render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={true}
        total={2}
        label="Items"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('Searching...')).toBeInTheDocument()
  })

  it('uses emptyLabel for the empty state when provided', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={false}
        total={0}
        label="Stock Adjustments"
        emptyLabel="adjustments"
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('No adjustments found')).toBeInTheDocument()
    expect(screen.queryByText('No Stock Adjustments found')).not.toBeInTheDocument()
  })

  it('shows filtered empty state when hasActiveFilters and emptyFilteredLabel provided', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={false}
        total={0}
        label="Stock Adjustments"
        emptyFilteredLabel="adjustments"
        hasActiveFilters={true}
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('No adjustments match filters')).toBeInTheDocument()
    expect(screen.queryByText('No adjustments found')).not.toBeInTheDocument()
  })

  it('shows unfiltered empty state when hasActiveFilters is false', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={false}
        total={0}
        label="Stock Adjustments"
        emptyLabel="adjustments"
        emptyFilteredLabel="adjustments"
        hasActiveFilters={false}
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('No adjustments found')).toBeInTheDocument()
    expect(screen.queryByText('No adjustments match filters')).not.toBeInTheDocument()
  })

  it('falls back to emptyLabel for filtered copy when emptyFilteredLabel is omitted', () => {
    render(
      <EntityTable
        rows={[]}
        columns={columns}
        loading={false}
        total={0}
        label="Stock Adjustments"
        emptyLabel="adjustments"
        hasActiveFilters={true}
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
      />,
    )

    expect(screen.getByText('No adjustments match filters')).toBeInTheDocument()
  })
})

describe('EntityTable column alignment', () => {
  const alignedColumns = [
    { key: 'name', render: (row: Item) => row.name },
    { key: 'amount', render: (row: Item) => `$${row.amount}`, align: 'right' as const },
  ]

  function renderAligned(overrides: { rows?: Item[]; loading?: boolean } = {}) {
    return render(
      <EntityTable
        rows={overrides.rows ?? rows}
        columns={alignedColumns}
        loading={overrides.loading ?? false}
        total={(overrides.rows ?? rows).length}
        label="Items"
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
        headers={['Name', 'Amount']}
      />,
    )
  }

  it('right-aligns a body cell whose column declares align="right"', () => {
    renderAligned()
    const cell = screen.getByText('$100').closest('td')!
    expect(cell.className).toMatch(/alignRight/)
  })

  it('right-aligns the matching header cell', () => {
    renderAligned()
    const header = screen.getByText('Amount').closest('th')!
    expect(header.className).toMatch(/alignRight/)
  })

  it('leaves a column without align at the default alignment', () => {
    renderAligned()
    const cell = screen.getByText('Alpha').closest('td')!
    expect(cell.className).not.toMatch(/alignRight/)
  })

  it('right-aligns skeleton cells so alignment does not shift when data lands', () => {
    const { container } = renderAligned({ rows: [], loading: true })
    const cells = container.querySelectorAll('tbody tr')[0].querySelectorAll('td')
    expect(cells[1].className).toMatch(/alignRight/)
    expect(cells[0].className).not.toMatch(/alignRight/)
  })
})
