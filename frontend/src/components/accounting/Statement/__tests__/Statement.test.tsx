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
    expect(screen.getByText('RM')).toBeInTheDocument()
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
    expect(screen.queryByTestId('row-s-fig0-frac')).not.toBeInTheDocument()
  })

  it('supports two figure columns without a second code path', () => {
    renderStatement(
      [row({ id: 'a', figures: ['10.0000', '20.0000'] })],
      ['Debit', 'Credit'],
    )
    expect(screen.getByTestId('row-a-fig0-int')).toHaveTextContent('10')
    expect(screen.getByTestId('row-a-fig1-int')).toHaveTextContent('20')
  })
})

describe('Statement visibility axes', () => {
  it('marks print-detail rows so print CSS can hide them', () => {
    renderStatement([row({ id: 'd', printDetail: true })])
    expect(screen.getByTestId('row-d')).toHaveClass('stmt-row--detail')
  })

  it('marks print-always rows so print CSS can reveal them', () => {
    renderStatement([row({ id: 'c', printAlways: true })])
    expect(screen.getByTestId('row-c')).toHaveClass('stmt-row--always')
  })

  it('keeps a screen-hidden row MOUNTED', () => {
    // Print CSS cannot reveal an unmounted row. A collapsed Form B cohort must
    // exist in the DOM, only visually hidden.
    renderStatement([row({ id: 'h', hiddenOnScreen: true, printAlways: true })])
    const el = screen.getByTestId('row-h')
    expect(el).toBeInTheDocument()
    expect(el).toHaveClass('acct-screen-hidden')
    expect(el).toHaveClass('stmt-row--always')
  })

  it('treats the three visibility axes as independent', () => {
    renderStatement([row({ id: 'x', printDetail: true, hiddenOnScreen: true })])
    const el = screen.getByTestId('row-x')
    expect(el).toHaveClass('stmt-row--detail')
    expect(el).toHaveClass('acct-screen-hidden')
    expect(el).not.toHaveClass('stmt-row--always')
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

  it('marks the expand control so print CSS hides it', () => {
    renderStatement([row({ id: 'g', expand: { expanded: false, onToggle: vi.fn() } })])
    expect(screen.getByTestId('stmt-expand-g')).toHaveClass('acct-print-control')
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
