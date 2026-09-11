import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { Statement } from '../Statement'
import type { StatementRow } from '../types'

beforeEach(() => {
  localStorage.setItem('defaultCurrency', 'RM')
})

const row = (over: Partial<StatementRow> & Pick<StatementRow, 'id'>): StatementRow => ({
  kind: 'line',
  depth: 0,
  label: 'Sales',
  figures: ['100.0000'],
  testId: `row-${over.id}`,
  ...over,
})

const renderStatement = (rows: StatementRow[], figureHeads = ['RM']) =>
  render(
    <MemoryRouter>
      <Statement rows={rows} figureHeads={figureHeads} label="Statement" />
    </MemoryRouter>,
  )

describe('Statement structure', () => {
  it('renders a table with an accessible name', () => {
    renderStatement([row({ id: 'a' })])
    expect(screen.getByRole('table', { name: 'Statement' })).toBeInTheDocument()
  })

  it('renders one row per StatementRow, addressable by testId', () => {
    renderStatement([row({ id: 'a' }), row({ id: 'b', label: 'Service' })])
    expect(screen.getByTestId('row-a')).toBeInTheDocument()
    expect(screen.getByTestId('row-b')).toBeInTheDocument()
  })

  it('puts the currency in the column head, not on every row', () => {
    renderStatement([row({ id: 'a' })])
    const head = screen.getByRole('table', { name: 'Statement' }).querySelector('thead')
    expect(head).toHaveTextContent('RM')
    expect(screen.getByTestId('row-a')).not.toHaveTextContent('RM')
  })

  it('applies a kind class so rule weight can express hierarchy', () => {
    renderStatement([
      row({ id: 's', kind: 'section', label: 'Revenue', figures: [] }),
      row({ id: 't', kind: 'subtotal', label: 'Total revenue' }),
      row({ id: 'n', kind: 'bottomLine', label: 'Net profit' }),
    ])
    expect(screen.getByTestId('row-s')).toHaveClass('stmt-row--section')
    expect(screen.getByTestId('row-t')).toHaveClass('stmt-row--subtotal')
    expect(screen.getByTestId('row-n')).toHaveClass('stmt-row--bottomLine')
  })

  it('renders a section head with no figure cells', () => {
    renderStatement([row({ id: 's', kind: 'section', label: 'Revenue', figures: [] })])
    expect(screen.getByTestId('row-s')).toHaveTextContent('Revenue')
    expect(screen.queryByTestId('row-s-fig0')).not.toBeInTheDocument()
  })

  it('supports two figure columns without a second code path', () => {
    renderStatement(
      [row({ id: 'a', figures: ['10.0000', '20.0000'] })],
      ['Debit', 'Credit'],
    )
    expect(screen.getByTestId('row-a-fig0')).toHaveTextContent('10.00')
    expect(screen.getByTestId('row-a-fig1')).toHaveTextContent('20.00')
  })

  it('gives every row the same column count', () => {
    // A short row would break the shared column grid the statement depends on.
    const { container } = renderStatement(
      [
        row({ id: 's', kind: 'section', label: 'Revenue', figures: [] }),
        row({ id: 'a', figures: ['10.0000', '20.0000'] }),
      ],
      ['Debit', 'Credit'],
    )
    const span = (tr: Element) =>
      [...tr.querySelectorAll('td, th')].reduce(
        (n, cell) => n + (Number(cell.getAttribute('colSpan') ?? cell.getAttribute('colspan')) || 1),
        0,
      )
    const rows = [...container.querySelectorAll('tbody tr')]
    expect(span(rows[0])).toBe(span(rows[1]))
    // 2 label columns + 2 figure columns.
    expect(span(rows[1])).toBe(4)

    const head = container.querySelector('thead tr')
    expect(head).not.toBeNull()
    expect(span(head as Element)).toBe(span(rows[1]))
  })
})

describe('Statement drill-down', () => {
  it('renders a real link when href is present', () => {
    renderStatement([row({ id: 'a', href: '/accounting/general-ledger?account=1' })])
    const link = within(screen.getByTestId('row-a')).getByRole('link')
    expect(link).toHaveAttribute('href', '/accounting/general-ledger?account=1')
  })

  it('renders no link when href is absent', () => {
    renderStatement([row({ id: 'a' })])
    expect(within(screen.getByTestId('row-a')).queryByRole('link')).toBeNull()
  })

  it('renders an expand control that calls onToggle', async () => {
    const onToggle = vi.fn()
    renderStatement([row({ id: 'g', expand: { expanded: false, onToggle } })])
    await userEvent.click(screen.getByTestId('stmt-expand-g'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('honours a report-supplied expand testid', () => {
    // Each report already has its own convention that existing suites assert;
    // Statement must not rename them.
    renderStatement([
      row({
        id: 'N37',
        expandTestId: 'bs-expand-N37',
        expand: { expanded: false, onToggle: vi.fn() },
      }),
    ])
    expect(screen.getByTestId('bs-expand-N37')).toBeInTheDocument()
    expect(screen.queryByTestId('stmt-expand-N37')).toBeNull()
  })
})

describe('Statement amounts', () => {
  it('exposes each amount as one accessible value', () => {
    renderStatement([row({ id: 'a', figures: ['-840.0000'] })])
    expect(screen.getByText('negative 840.00')).toBeInTheDocument()
  })

  it('marks zero rows for the muted token', () => {
    renderStatement([row({ id: 'z', figures: ['0.0000'], isZero: true })])
    expect(screen.getByTestId('row-z')).toHaveClass('stmt-row--zero')
  })
})

describe('Statement frame and header', () => {
  it('renders a real header row with Code and Description', () => {
    renderStatement([row({ id: 'a' })])
    const table = screen.getByRole('table', { name: 'Statement' })
    const head = table.querySelector('thead')
    expect(head).not.toBeNull()
    expect(head).toHaveTextContent('Code')
    expect(head).toHaveTextContent('Description')
    expect(head).toHaveTextContent('RM')
  })

  it('renders one header cell per column', () => {
    renderStatement([row({ id: 'a', figures: ['1.0000', '2.0000'] })], ['Debit', 'Credit'])
    const heads = screen.getByRole('table', { name: 'Statement' }).querySelectorAll('thead th')
    // Code + Description + Debit + Credit
    expect(heads).toHaveLength(4)
  })

  it('owns a scroll container so the header can stick', () => {
    // Structure only. jsdom has no layout engine, so stickiness itself is
    // browser-verified (STATEMENT_THEME_QA.md, ST-4).
    const { container } = renderStatement([row({ id: 'a' })])
    const scroller = container.querySelector('.stmt-scroller')
    expect(scroller).not.toBeNull()
    expect(scroller?.querySelector('table.stmt-table')).not.toBeNull()
  })

  it('keeps the accessible table name', () => {
    renderStatement([row({ id: 'a' })])
    expect(screen.getByRole('table', { name: 'Statement' })).toBeInTheDocument()
  })
})
