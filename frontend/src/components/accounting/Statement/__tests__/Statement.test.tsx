import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { darkTheme } from '@/styles/theme'

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

  it('opts the table into MUI stickyHeader', () => {
    /*
     * The two things that must reach the DOM for a sticky header: the table's
     * stickyHeader opt-in, and the head cells being MUI head cells (MUI sets
     * `position: sticky` on THOSE, not on the row). Whether the header
     * actually stays put is browser-only — ST-4.
     */
    const { container } = renderStatement([row({ id: 'a' })])
    const table = container.querySelector('table.stmt-table')!
    expect(table.className).toMatch(/stickyHeader/)

    const heads = [...container.querySelectorAll('thead th')]
    expect(heads.length).toBeGreaterThan(0)
    for (const cell of heads) {
      expect(cell.className).toMatch(/MuiTableCell-stickyHeader/)
    }
    // A row background would scroll away, so stickiness must not live there.
    expect(container.querySelector('thead tr')!.className).not.toMatch(/stickyHeader/)
  })

  it('renders header cells as MUI head cells so the themed variant applies', () => {
    /*
     * This is the #1228 fix itself. Being a `.MuiTableCell-head` is what pulls
     * in the theme's MuiTableHead override — semibold, uppercase, the app font
     * — the same treatment EntityTable's headers get.
     *
     * It is NOT the whole story: the rendered size and tracking (0.8rem /
     * 0.5px) are pinned in Statement's `sx`, because EntityTable overrides the
     * theme variant inline and the theme alone lands at 0.75rem/0.08em. That
     * gap was invisible here and caught by measurement — see ST-10.
     *
     * Asserting the CLASS is what is reachable in jsdom; that the two headers
     * render identically is browser-measured.
     *
     * The old hand-rolled `.stmt-col-head` rule (weight 500, 0.04em, no
     * uppercase) was the divergence from SO/PO this issue reported.
     */
    const { container } = renderStatement([row({ id: 'a' })])
    const heads = [...container.querySelectorAll('thead th')]
    expect(heads).toHaveLength(3)
    for (const cell of heads) {
      expect(cell.className).toMatch(/MuiTableCell-head/)
    }
  })

  it('keeps the accessible table name', () => {
    renderStatement([row({ id: 'a' })])
    expect(screen.getByRole('table', { name: 'Statement' })).toBeInTheDocument()
  })

  it('renders every header through a Typography, as EntityTable does', () => {
    /*
     * #1231: the header text must be a real <Typography>, not bare text in the
     * cell. This asserts the WRAPPER exists; the test below asserts it carries
     * the right values. Both matter — a Typography that lost its sx would pass
     * this one and still render at the wrong size.
     */
    const { container } = renderStatement(
      [row({ id: 'a', figures: ['1.0000', '2.0000'] })],
      ['Debit', 'Credit'],
    )
    const heads = [...container.querySelectorAll('thead th')]
    expect(heads).toHaveLength(4)
    for (const cell of heads) {
      const typography = cell.querySelector('.MuiTypography-root')
      expect(typography).not.toBeNull()
      // The text lives INSIDE the Typography, not beside it.
      expect(typography).toHaveTextContent(/\S/)
      expect(cell.textContent).toBe(typography!.textContent)
    }
  })

  it('gives header Typography the four SO/PO parity values', () => {
    /*
     * The measured half of #1228/#1231 that IS reachable here. Per CLAUDE.md,
     * `sx` on the asserted element itself IS observable through toHaveStyle
     * when rendered under a ThemeProvider — these are the values EntityTable
     * sets inline at EntityTable.tsx:336-343.
     *
     * The trap this guards: `variant="tableHeader"` alone computes 0.75rem /
     * 0.08em (theme.ts:205), NOT what SO/PO renders. jsdom 30 normalizes rem to
     * px, so 0.8rem reads as 12.8px.
     *
     * ONE THEME, deliberately: the app has exactly one. main.tsx wraps
     * everything in ThemeWrapper, which provides darkTheme unconditionally, and
     * theme.ts exports no other. darkTheme spreads baseThemeOptions and
     * redefines neither `typography` nor `MuiTableHead`, so the variant and the
     * cell override reach it intact. A light-theme case would have to invent a
     * theme no user ever sees.
     */
    const { container } = render(
      <MemoryRouter>
        <ThemeProvider theme={darkTheme}>
          <Statement rows={[row({ id: 'a' })]} figureHeads={['RM']} label="Statement" />
        </ThemeProvider>
      </MemoryRouter>,
    )

    const typographies = [...container.querySelectorAll('thead th .MuiTypography-root')]
    expect(typographies).toHaveLength(3)
    for (const el of typographies) {
      expect(el).toHaveStyle({
        fontWeight: '600',
        fontSize: '12.8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      })
    }
  })
})

/*
 * #1232: the BODY half of the SO/PO parity work, after #1228 (cells) and #1231
 * (header markup).
 *
 * The contract, taken from EntityTable.tsx:194-203, is a
 * `<Typography variant="body2">` carrying weight 400 / 0.8rem / lineHeight 1.2.
 * Matching that markup buys CONTRACT parity only — the two tables do not share a
 * component, so these values are kept in step by hand and this suite is what
 * notices when they drift.
 *
 * Every assertion below was confirmed RED against the pre-#1232 source, with
 * these measured starting values: code cell rgb(189,189,189) @ 13px, label @
 * 14px, figure @ 14px. jsdom 30 normalizes rem to px, so 0.8rem reads 12.8px.
 *
 * ONE THEME, deliberately — see the header parity test above for why a
 * light-theme case is not expressible in this app.
 */
const renderThemed = (rows: StatementRow[], figureHeads = ['RM']) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={darkTheme}>
        <Statement rows={rows} figureHeads={figureHeads} label="Statement" />
      </ThemeProvider>
    </MemoryRouter>,
  )

describe('Statement body typography', () => {
  it('renders code and description through a Typography, as EntityTable does', () => {
    const { container } = renderThemed([row({ id: 'a', code: '4000' })])

    for (const selector of ['.stmt-cell-code', '.stmt-cell-label']) {
      const cell = container.querySelector(selector)!
      const typography = cell.querySelector('.MuiTypography-root')
      expect(typography).not.toBeNull()
      expect(typography).toHaveTextContent(/\S/)
      /*
       * The text lives INSIDE the Typography, not beside it. This mirrors the
       * head-cell equality check above; without it a wrapper could be added
       * while stray text remained in the cell, and every substring assertion in
       * the page suites would still pass.
       */
      expect(cell.textContent).toBe(typography!.textContent)
    }
  })

  it('gives code and description the SO/PO body contract', () => {
    const { container } = renderThemed([row({ id: 'a', code: '4000' })])

    for (const selector of ['.stmt-cell-code', '.stmt-cell-label']) {
      const typography = container.querySelector(`${selector} .MuiTypography-root`)!
      expect(typography).toHaveStyle({
        fontWeight: '400',
        fontSize: '12.8px',
        lineHeight: '1.2',
      })
    }
  })

  it('uses the SO/PO body colour on the code cell, not a muted one', () => {
    /*
     * The code column was text.secondary (rgb(189,189,189)) before #1232.
     * Muting it was defensible accounting hierarchy, but the issue requires
     * colour parity with the SO/PO body, which inherits text.primary.
     */
    const { container } = renderThemed([row({ id: 'a', code: '4000' })])

    expect(container.querySelector('.stmt-cell-code')).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    })
  })

  it('renders every figure at the shared body font size', () => {
    /*
     * Load-bearing for decimal alignment, not cosmetics: a figure at a
     * different size places its decimal separator at a different x position
     * from every other row. Asserted across a line, a subtotal and the bottom
     * line together — the bottom line is the one that historically grew.
     */
    const { container } = renderThemed([
      row({ id: 'a', code: '4000' }),
      row({ id: 't', kind: 'subtotal', label: 'Total', figures: ['300.0000'], testId: 'row-t' }),
      row({ id: 'n', kind: 'bottomLine', label: 'Net Profit', figures: ['900.0000'], testId: 'row-n' }),
    ])

    const figures = [...container.querySelectorAll('.stmt-cell-figure')]
    expect(figures).toHaveLength(3)
    for (const cell of figures) {
      expect(cell).toHaveStyle({ fontSize: '12.8px' })
    }
  })

  it('keeps subtotal and bottom-line emphasis despite the explicit body weight', () => {
    /*
     * THE REGRESSION THIS SUITE EXISTS FOR.
     *
     * The body contract puts an explicit `fontWeight: 400` on the child
     * Typography. An element's own rule beats anything inherited, so the
     * row-level `.stmt-row--subtotal > *` weight reaches the CELL and stops
     * there — the rendered glyphs flatten to 400 while the cell still reports
     * 500, which is invisible to a cell-level assertion.
     *
     * Measured: a row-scoped descendant selector wins (0,2,0 vs 0,1,0), so the
     * fix restores weight on the Typography itself. Asserted on the code/label
     * children specifically, since the overrides are scoped to those and must
     * not reach unrelated descendants.
     */
    const { container } = renderThemed([
      row({ id: 't', kind: 'subtotal', code: '4999', label: 'Total Revenue', figures: ['300.0000'], testId: 'row-t' }),
      row({ id: 'n', kind: 'bottomLine', code: '9999', label: 'Net Profit', figures: ['900.0000'], testId: 'row-n' }),
    ])

    for (const rowClass of ['.stmt-row--subtotal', '.stmt-row--bottomLine']) {
      for (const selector of ['.stmt-cell-code', '.stmt-cell-label']) {
        const typography = container.querySelector(`${rowClass} ${selector} .MuiTypography-root`)!
        expect(typography).not.toBeNull()
        expect(typography).toHaveStyle({ fontWeight: '500' })
      }
    }
  })

  it('does not bump the bottom-line label above the body size', () => {
    /*
     * The bottom line is distinguished by WEIGHT and its double rule. The old
     * 1rem label override was Statement-only drift; dropping it is #1232's
     * "no separate Statement rules" requirement. The figure was never allowed
     * to grow — see the shared-size test above.
     */
    const { container } = renderThemed([
      row({ id: 'n', kind: 'bottomLine', label: 'Net Profit', figures: ['900.0000'], testId: 'row-n' }),
    ])

    const typography = container.querySelector(
      '.stmt-row--bottomLine .stmt-cell-label .MuiTypography-root',
    )!
    expect(typography).toHaveStyle({ fontSize: '12.8px' })
  })

  it('keeps the section row muted and tracked, as deliberate accounting emphasis', () => {
    /*
     * Retained ON PURPOSE (#1232 scope: "do not flatten accounting semantics
     * merely for visual uniformity"). A section head is a divider, not a data
     * row, so it keeps text.secondary, weight 500 and wide tracking. Asserted
     * so a future parity sweep has to change this test deliberately rather
     * than flatten it by accident.
     */
    const { container } = renderThemed([
      row({ id: 's', kind: 'section', label: 'REVENUE', figures: [], testId: 'row-s' }),
    ])

    /*
     * NOTE ON UNITS: jsdom 30 normalizes em/rem to px, so the rule's 0.06em
     * computes as 0.78px against the section row's 13px. Asserting '0.06em'
     * here fails — and because toHaveStyle fails atomically, one wrong unit
     * marks every other property in the same call as mismatched too. Read the
     * computed value before concluding a rule did not apply.
     */
    expect(container.querySelector('.stmt-row--section .stmt-cell-label')).toHaveStyle({
      color: 'rgb(189, 189, 189)',
      fontWeight: '500',
      letterSpacing: '0.78px',
    })
  })
})
