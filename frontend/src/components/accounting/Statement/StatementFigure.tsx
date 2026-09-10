import React from 'react'

import { formatCurrency } from '@/utils/currency'

/**
 * Split an ALREADY-FORMATTED amount into its integer and fractional parts.
 *
 * The separator stays with the fractional part, which is left-aligned against
 * the shared table-column boundary — that boundary is the decimal anchor
 * (spec §4.5.2).
 *
 * NEVER parses the amount. `formatCurrency` keeps string amounts as strings
 * because amounts are NUMERIC(18,4) and Number()/parseFloat() lose cents once
 * binary64 spacing exceeds 0.01. Stripping the sign with
 * `Math.abs(Number(amount))` would reintroduce exactly that loss (spec §4.5.1).
 */
export function splitFormattedAmount(formatted: string): {
  int: string
  frac: string
  negative: boolean
} {
  const negative = formatted.trimStart().startsWith('-')
  const unsigned = negative ? formatted.trimStart().slice(1) : formatted
  const dot = unsigned.lastIndexOf('.')
  const rawInt = dot === -1 ? unsigned : unsigned.slice(0, dot)
  const rawFrac = dot === -1 ? '' : unsigned.slice(dot)

  return {
    // Parentheses are the accounting sign convention and survive monochrome
    // printing, unlike colour. The opening paren rides with the integer cell
    // (right-aligned, so it extends leftward); the closing paren rides after
    // the decimals, on the far side of the anchor where it cannot move it.
    int: negative ? `(${rawInt}` : rawInt,
    frac: negative ? `${rawFrac})` : rawFrac,
    negative,
  }
}

interface StatementFigureProps {
  amount: string | null
  testId?: string
  /**
   * Optional testid for a SINGLE node carrying the complete formatted amount.
   *
   * Exists because existing suites (and the print gate's `assertExactAmount`,
   * which requires exactly one matching element and reads its whole text)
   * address an amount as one hook — `bs-amount`. The split into two cells must
   * not take that away. Applied to the visually-hidden complete value, which
   * is the node whose text IS the full signed figure.
   */
  amountHook?: string
}

/**
 * One amount rendered as TWO table cells.
 *
 * Returns a fragment of two <td>s — place it directly inside a <tr>, never
 * inside a single <td>.
 *
 * Accessibility (spec §4.5.3): the split is a VISUAL device. Both visual
 * spans are aria-hidden and a single visually-hidden element carries the
 * complete value with a lexical sign. That element lives inside the integer
 * cell so the amount keeps its column-header association — text clipped out
 * of the table's cell structure would lose the row/column relationship the
 * table exists to provide.
 */
export function StatementFigure({ amount, testId, amountHook }: StatementFigureProps) {
  if (amount === null) {
    // null means UNKNOWN, not zero. Rendering '0.00' would assert a figure the
    // backend explicitly declined to compute.
    return (
      <>
        <td className="stmt-cell-figure-int" data-testid={testId ? `${testId}-int` : undefined}>
          <span className="stmt-a11y-only" data-testid={amountHook}>
            not available
          </span>
        </td>
        <td
          className="stmt-cell-figure-frac"
          aria-hidden="true"
          data-testid={testId ? `${testId}-frac` : undefined}
        >
          —
        </td>
      </>
    )
  }

  const formatted = formatCurrency(amount, { showSymbol: false })
  const { int, frac, negative } = splitFormattedAmount(formatted)
  const spoken = negative ? `negative ${formatted.replace(/^-/, '')}` : formatted

  return (
    <>
      <td
        className={`stmt-cell-figure-int${negative ? ' stmt-figure-negative' : ''}`}
        data-testid={testId ? `${testId}-int` : undefined}
      >
        <span className="stmt-a11y-only" data-testid={amountHook}>
          {spoken}
        </span>
        <span aria-hidden="true">{int}</span>
      </td>
      <td
        className={`stmt-cell-figure-frac${negative ? ' stmt-figure-negative' : ''}`}
        aria-hidden="true"
        data-testid={testId ? `${testId}-frac` : undefined}
      >
        {frac}
      </td>
    </>
  )
}
