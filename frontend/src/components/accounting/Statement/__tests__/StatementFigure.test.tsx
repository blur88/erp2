import React from 'react'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { describe, it, expect, beforeEach } from 'vitest'

import { darkTheme } from '@/styles/theme'

import { StatementFigure, splitFormattedAmount } from '../StatementFigure'

/** The component renders one <td>, so every render needs a row context. */
const renderFigure = (amount: string | null) =>
  render(
    <table>
      <tbody>
        <tr>
          <StatementFigure amount={amount} testId="fig" />
        </tr>
      </tbody>
    </table>,
  )

beforeEach(() => {
  // formatCurrency reads the symbol from localStorage; pin it so assertions
  // do not depend on ambient state.
  localStorage.setItem('defaultCurrency', 'RM')
})

describe('splitFormattedAmount', () => {
  it('splits on the decimal separator, keeping the separator with the fraction', () => {
    expect(splitFormattedAmount('142,300.00')).toEqual({
      int: '142,300',
      frac: '.00',
      negative: false,
    })
  })

  it('detects a negative and wraps it in parentheses', () => {
    expect(splitFormattedAmount('-840.00')).toEqual({
      int: '(840',
      frac: '.00)',
      negative: true,
    })
  })

  it('does not lose precision on a large NUMERIC(18,4) value', () => {
    // Number('99999999999999.99') rounds to ...99.98. String handling must not.
    const { int, frac } = splitFormattedAmount('99,999,999,999,999.99')
    expect(`${int}${frac}`).toBe('99,999,999,999,999.99')
  })
})

describe('StatementFigure', () => {
  it('renders the amount in a single cell', () => {
    renderFigure('142300.0000')
    const cell = screen.getByTestId('fig')
    expect(cell.tagName).toBe('TD')
    expect(cell).toHaveTextContent('142,300.00')
  })

  it('renders a negative in parentheses in that one cell', () => {
    renderFigure('-840.0000')
    expect(screen.getByTestId('fig')).toHaveTextContent('(840.00)')
  })

  it('exposes the amount as ONE accessible value including its sign', () => {
    renderFigure('-840.0000')
    // Sign is lexical, never punctuation alone: parentheses are unreliably
    // announced by screen readers.
    expect(screen.getByText('negative 840.00')).toBeInTheDocument()
  })

  it('exposes a positive amount without a sign word', () => {
    renderFigure('142300.0000')
    // Scoped: the visible aria-hidden span carries the same text, so an
    // unscoped getByText matches two nodes (probe-verified).
    expect(screen.getByText('142,300.00', { selector: '[data-a11y="statement-value"]' })).toBeInTheDocument()
  })

  it('hides the visual figure from assistive technology', () => {
    renderFigure('142300.0000')
    // Scope to the visible amount span: the paren spacer is also aria-hidden,
    // so an unscoped query would pass even if this span lost its aria-hidden.
    const visible = screen
      .getByTestId('fig')
      .querySelector('span[aria-hidden="true"]:not([data-role="paren-spacer"])')
    expect(visible).not.toBeNull()
    expect(visible).toHaveTextContent('142,300.00')
  })

  it('keeps the accessible value inside the figure cell', () => {
    renderFigure('142300.0000')
    const a11y = screen.getByText('142,300.00', { selector: '[data-a11y="statement-value"]' })
    // Must be inside a <td> — a bare element between cells is invalid table
    // markup and browsers relocate it out of the table, losing the
    // row/column relationship. And it must be THE figure cell, so the amount
    // keeps its column-header association.
    expect(a11y.closest('td')).toBe(screen.getByTestId('fig'))
  })

  it('announces null as unknown, not as a dash or a zero', () => {
    renderFigure(null)
    expect(screen.getByText('not available')).toBeInTheDocument()
    expect(screen.queryByText('0.00')).not.toBeInTheDocument()
  })

  it('renders an em dash for null', () => {
    renderFigure(null)
    expect(screen.getByTestId('fig')).toHaveTextContent('—')
  })

  it('marks a negative figure for the themed negative colour', () => {
    renderFigure('-840.0000')
    expect(screen.getByTestId('fig')).toHaveStyle({ color: 'rgb(211, 47, 47)' })
  })

  it('exposes amountHook on exactly ONE node carrying the whole amount', () => {
    render(
      <table>
        <tbody>
          <tr>
            <StatementFigure amount="-840.0000" testId="fig" amountHook="bs-amount" />
          </tr>
        </tbody>
      </table>,
    )
    const hits = screen.getAllByTestId('bs-amount')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toHaveTextContent('negative 840.00')
  })

  it('exposes amountHook for a null amount too', () => {
    render(
      <table>
        <tbody>
          <tr>
            <StatementFigure amount={null} testId="fig" amountHook="bs-amount" />
          </tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('bs-amount')).toHaveTextContent('not available')
  })
})

/**
 * The paren spacer reserves the closing-parenthesis width on POSITIVE figures
 * so their decimal separators align with parenthesised negatives (spec §4.1).
 *
 * It MUST be CSS generated content (`::after { content: ')' }`), never a DOM
 * text node: textContent walks the whole descendant tree, and neither
 * aria-hidden (accessibility tree only) nor visibility:hidden (style, which
 * jsdom does not apply to textContent) keeps a real ')' out of it. A text node
 * here corrupts row-level toHaveTextContent assertions such as
 * ProfitAndLossPage.test.tsx:113 and BalanceSheetPage.test.tsx:316.
 */
describe('StatementFigure paren spacer', () => {
  it('adds NO parenthesis to a positive figure cell text', () => {
    renderFigure('142300.0000')
    // The cell's textContent concatenates the accessible and visible spans by
    // design, so assert the accessible span exactly and the absence of ')'
    // separately — not cell-text equality.
    expect(
      screen.getByText('142,300.00', { selector: '[data-a11y="statement-value"]' }).textContent,
    ).toBe('142,300.00')
    expect(screen.getByTestId('fig').textContent).not.toContain(')')
  })

  it('adds NO parenthesis to the positive row text', () => {
    // Row-level, because the real suites assert on rows.
    const { container } = renderFigure('142300.0000')
    const row = container.querySelector('tr')
    expect(row?.textContent).not.toContain(')')
    expect(row?.textContent).not.toContain('(')
  })

  it('keeps the positive accessible value free of the placeholder', () => {
    renderFigure('142300.0000')
    expect(screen.getByText('142,300.00', { selector: '[data-a11y="statement-value"]' }).textContent).toBe(
      '142,300.00',
    )
  })

  it('keeps amountHook text free of the placeholder', () => {
    render(
      <table>
        <tbody>
          <tr>
            <StatementFigure amount="142300.0000" testId="fig" amountHook="pl-amount" />
          </tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('pl-amount').textContent).toBe('142,300.00')
  })

  it('renders the spacer element on a positive figure only', () => {
    const { rerender } = renderFigure('142300.0000')
    expect(screen.getByTestId('fig').querySelector('[data-role="paren-spacer"]')).not.toBeNull()

    // A negative already ends in ')', so it needs no reserved width.
    rerender(
      <table>
        <tbody>
          <tr>
            <StatementFigure amount="-840.0000" testId="fig" />
          </tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('fig').querySelector('[data-role="paren-spacer"]')).toBeNull()
  })

  it('hides the spacer from assistive technology', () => {
    renderFigure('142300.0000')
    const spacer = screen.getByTestId('fig').querySelector('[data-role="paren-spacer"]')
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders no spacer for a null amount', () => {
    renderFigure(null)
    expect(screen.getByTestId('fig').querySelector('[data-role="paren-spacer"]')).toBeNull()
  })
})

describe('StatementFigure presentation props', () => {
  // These assertions read Emotion `sx` off the asserted element, which reaches
  // getComputedStyle ONLY under a ThemeProvider — a bare render computes no
  // themed colour and every expectation below would read rgb(0, 0, 0).
  const renderThemedFigure = (props: Partial<React.ComponentProps<typeof StatementFigure>>) =>
    render(
      <ThemeProvider theme={darkTheme}>
        <table>
          <tbody>
            <tr>
              <StatementFigure amount="1200.0000" testId="fig" {...props} />
            </tr>
          </tbody>
        </table>
      </ThemeProvider>,
    )

  describe('blank', () => {
    it('renders an empty cell with no figure, a11y node or spacer', () => {
      renderThemedFigure({ blank: true, amountHook: 'hook' })
      const cell = screen.getByTestId('fig')
      expect(cell).toBeEmptyDOMElement()
      expect(cell.querySelector('[data-a11y="statement-value"]')).toBeNull()
      expect(cell.querySelector('[data-role="paren-spacer"]')).toBeNull()
      // A blank cell is not a figure: the QA font-size sweep must skip it.
      expect(cell).not.toHaveAttribute('data-role', 'figure')
    })

    it('takes no rule even when topBorder or bottomLine is set', () => {
      // A blank companion column sits beside a ruled figure; ruling it too
      // would draw a line under an empty cell.
      renderThemedFigure({ blank: true, topBorder: true, bottomLine: true })
      // Asserted as the ABSENCE of a border-top declaration. This cell is
      // rendered outside Statement's table reset, so an unruled cell carries no
      // border-top-width rule at all and computes to '' rather than '0px'.
      expect(getComputedStyle(screen.getByTestId("fig")).borderTopStyle).toBe("none")
    })
  })

  describe('topBorder', () => {
    it('draws a subtotal hairline', () => {
      renderThemedFigure({ topBorder: true })
      expect(screen.getByTestId('fig')).toHaveStyle({
        borderTop: '1px solid rgb(255, 255, 255)',
      })
    })

    it('draws no rule when unset', () => {
      renderThemedFigure({})
      expect(getComputedStyle(screen.getByTestId("fig")).borderTopStyle).toBe("none")
    })
  })

  describe('emphasized', () => {
    it('adds weight WITHOUT changing the figure font size', () => {
      // The invariant CLAUDE.md calls load-bearing: a larger bottom-line figure
      // puts its decimal separator at a different x position from every other
      // row. Weight may change; size may not.
      renderThemedFigure({ emphasized: true })
      expect(screen.getByTestId('fig')).toHaveStyle({
        fontWeight: '700',
        fontSize: '12.8px',
      })
    })

    it('leaves an unemphasized figure at the same size', () => {
      renderThemedFigure({})
      const cell = screen.getByTestId('fig')
      expect(cell).toHaveStyle({ fontSize: '12.8px' })
      expect(cell).not.toHaveStyle({ fontWeight: '700' })
    })
  })
})
