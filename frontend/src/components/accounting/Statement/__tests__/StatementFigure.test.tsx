import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

import { StatementFigure, splitFormattedAmount } from '../StatementFigure'

/** The component renders two <td>s, so every render needs a row context. */
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
  it('renders the integer and fractional parts in separate cells', () => {
    renderFigure('142300.0000')
    expect(screen.getByTestId('fig-int')).toHaveTextContent('142,300')
    expect(screen.getByTestId('fig-frac')).toHaveTextContent('.00')
  })

  it('renders a negative with parentheses split across the two cells', () => {
    renderFigure('-840.0000')
    expect(screen.getByTestId('fig-int')).toHaveTextContent('(840')
    expect(screen.getByTestId('fig-frac')).toHaveTextContent('.00)')
  })

  it('exposes the amount as ONE accessible value including its sign', () => {
    renderFigure('-840.0000')
    // Sign is lexical, never punctuation alone: parentheses are unreliably
    // announced and here they straddle two cells.
    expect(screen.getByText('negative 840.00')).toBeInTheDocument()
  })

  it('exposes a positive amount without a sign word', () => {
    renderFigure('142300.0000')
    expect(screen.getByText('142,300.00')).toBeInTheDocument()
  })

  it('hides the visual cells from assistive technology', () => {
    renderFigure('142300.0000')
    expect(screen.getByTestId('fig-frac')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the accessible value inside a cell in the figure column', () => {
    renderFigure('142300.0000')
    const a11y = screen.getByText('142,300.00')
    // Must be inside a <td> — a bare element between cells is invalid table
    // markup and browsers relocate it out of the table, losing the
    // row/column relationship.
    expect(a11y.closest('td')).not.toBeNull()
    // And that cell must be a figure cell, so the amount keeps its header
    // association.
    expect(a11y.closest('td')).toHaveClass('stmt-cell-figure-int')
  })

  it('announces null as unknown, not as a dash or a zero', () => {
    renderFigure(null)
    expect(screen.getByText('not available')).toBeInTheDocument()
    expect(screen.queryByText('0.00')).not.toBeInTheDocument()
  })

  it('renders an em dash for null in the fractional cell', () => {
    renderFigure(null)
    expect(screen.getByTestId('fig-frac')).toHaveTextContent('—')
  })

  it('marks a negative figure for the negative colour token', () => {
    renderFigure('-840.0000')
    expect(screen.getByTestId('fig-int')).toHaveClass('stmt-figure-negative')
  })

  it('exposes amountHook on exactly ONE node carrying the whole amount', () => {
    // Existing suites and the print gate's assertExactAmount address an amount
    // as a single hook; the two-cell split must not duplicate or drop it.
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
