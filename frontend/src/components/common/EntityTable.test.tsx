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

import { TableCell, TableRow } from '@mui/material'

function renderTable(overrides: Partial<React.ComponentProps<typeof EntityTable<Item>>> = {}) {
  return render(
    <EntityTable
      rows={rows}
      columns={columns}
      loading={false}
      total={rows.length}
      label="Items"
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={vi.fn()}
      listRef={{ current: null }}
      {...overrides}
    />,
  )
}

describe('EntityTable tableFooter', () => {
  it('renders the footer node when there are rows', () => {
    renderTable({
      tableFooter: (
        <TableRow>
          <TableCell data-testid="footer-cell">Total</TableCell>
        </TableRow>
      ),
    })
    expect(screen.getByTestId('footer-cell')).toBeInTheDocument()
  })

  it('does not render the footer when there are no rows', () => {
    renderTable({
      rows: [],
      tableFooter: (
        <TableRow>
          <TableCell data-testid="footer-cell">Total</TableCell>
        </TableRow>
      ),
    })
    expect(screen.queryByTestId('footer-cell')).not.toBeInTheDocument()
  })

  it('renders the footer inside the table element', () => {
    renderTable({
      tableFooter: (
        <TableRow>
          <TableCell data-testid="footer-cell">Total</TableCell>
        </TableRow>
      ),
    })
    // A semantic <tfoot> inside <table> — not a sibling node after the card.
    const footer = screen.getByTestId('footer-cell').closest('tfoot')
    expect(footer).not.toBeNull()
    expect(footer!.closest('table')).not.toBeNull()
  })
})

describe('EntityTable row extensions', () => {
  it('does not call onSelect when the row is not selectable', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, isRowSelectable: () => false })
    await userEvent.click(screen.getByText('Alpha'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still calls onSelect when the row is selectable', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, isRowSelectable: () => true })
    await userEvent.click(screen.getByText('Alpha'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('applies role and tabIndex to selectable rows when selectableRowRole is set', () => {
    renderTable({ selectableRowRole: 'link' })
    const row = screen.getByText('Alpha').closest('tr')!
    expect(row).toHaveAttribute('role', 'link')
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('withholds role and tabIndex from non-selectable rows', () => {
    renderTable({ selectableRowRole: 'link', isRowSelectable: () => false })
    const row = screen.getByText('Alpha').closest('tr')!
    expect(row).not.toHaveAttribute('role', 'link')
    expect(row).not.toHaveAttribute('tabindex')
  })

  it('sets no role or tabIndex when selectableRowRole is omitted', () => {
    // Guards the twelve existing consumers: their DOM must not change.
    renderTable({})
    const row = screen.getByText('Alpha').closest('tr')!
    expect(row).not.toHaveAttribute('role', 'link')
    expect(row).not.toHaveAttribute('tabindex')
  })

  it('activates a link row on Enter but not on Space', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, selectableRowRole: 'link' })
    const row = screen.getByText('Alpha').closest('tr')!
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('activates a button row on Enter and on Space', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, selectableRowRole: 'button' })
    const row = screen.getByText('Alpha').closest('tr')!
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('does not activate a non-selectable row from the keyboard', async () => {
    const onSelect = vi.fn()
    renderTable({ onSelect, selectableRowRole: 'button', isRowSelectable: () => false })
    const row = screen.getByText('Alpha').closest('tr')!
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('applies getRowProps attributes to the row element', () => {
    renderTable({
      getRowProps: () => ({
        className: 'my-row-class',
        'data-testid': 'my-row',
        'data-zero': 'true',
      }),
    })
    const rows = screen.getAllByTestId('my-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveClass('my-row-class')
    expect(rows[0]).toHaveAttribute('data-zero', 'true')
  })

  it('applies tableClassName to the inner table element', () => {
    renderTable({ tableClassName: 'acct-print-table' })
    expect(screen.getByText('Alpha').closest('table')).toHaveClass('acct-print-table')
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

describe('EntityTable sticky header', () => {
  function renderWithHeaders() {
    return render(
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={rows.length}
        label="Items"
        focusedIndex={-1}
        onSelect={vi.fn()}
        listRef={{ current: null }}
        headers={['Name', 'Amount']}
      />,
    )
  }

  /*
   * jsdom has no layout engine and never resolves Emotion `sx` into computed
   * style, so neither the sticky offset nor the head-cell background is
   * observable here. These assertions pin the two structural facts that DO
   * reach the DOM — MUI's stickyHeader opt-in, and the head cells being the
   * element that carries it — and a browser pass remains the real gate.
   */
  it('opts the table into MUI stickyHeader', () => {
    const { container } = renderWithHeaders()
    const table = container.querySelector('table')!
    expect(table.className).toMatch(/stickyHeader/)
  })

  it('marks the column header cells as sticky, not the header row', () => {
    const { container } = renderWithHeaders()
    const headerCells = container.querySelectorAll('thead th')

    expect(headerCells).toHaveLength(2)
    headerCells.forEach((cell) => {
      expect(cell.className).toMatch(/stickyHeader/)
    })
    expect(container.querySelector('thead tr')!.className).not.toMatch(/stickyHeader/)
  })

  it('keeps the header cells inside the scroll container that owns body scrolling', () => {
    const { container } = renderWithHeaders()
    const scroller = container.querySelector('.entity-table-scroller')!

    // Sticky positions against the nearest scrolling ancestor; if the head ever
    // moved outside this element the header would be static again.
    expect(scroller.querySelector('thead th')).not.toBeNull()
  })
})
