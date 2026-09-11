import React from 'react'

import { formatCurrency } from '@/utils/currency'

/**
 * Split an ALREADY-FORMATTED amount into its integer and fractional parts,
 * returning the parenthesised sign convention for negatives.
 *
 * `StatementFigure` re-joins `int` and `frac` into ONE string rendered in a
 * single right-aligned cell; decimal alignment comes from tabular digits, a
 * shared body font size and `.stmt-paren-spacer` (spec §4.1), not from a
 * column boundary. This helper is therefore purely a string split.
 *
 * NEVER parses the amount. `formatCurrency` keeps string amounts as strings
 * because amounts are NUMERIC(18,4) and Number()/parseFloat() lose cents once
 * binary64 spacing exceeds 0.01. Stripping the sign with
 * `Math.abs(Number(amount))` would reintroduce exactly that loss.
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
    // printing, unlike colour. The sign wraps the whole formatted value; the
    // component re-joins int and frac into one right-aligned cell.
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
   * Applied to the visually-hidden complete value — the node whose text IS the
   * full signed figure. BalanceSheetPage.test.tsx:251 reads its textContent and
   * :481 asserts exactly one per row.
   */
  amountHook?: string
}

/**
 * One amount rendered as ONE right-aligned table cell.
 *
 * Returns a single <td> — place it directly inside a <tr>.
 *
 * Decimal alignment (spec §4.1) comes from three things together: every figure
 * carries exactly two decimals (formatCurrency pins min/maxFractionDigits: 2),
 * every figure renders at the SAME font size (a larger bottom line would shift
 * its decimal), and `tabular-nums` fixes digit advance. The remaining offset is
 * the closing paren on negatives, which `.stmt-paren-spacer` reserves on
 * positives.
 *
 * Accessibility (spec §4.3): the visible figure is aria-hidden and a single
 * visually-hidden element carries the complete value with a lexical sign. That
 * element lives INSIDE this cell so the amount keeps its column-header
 * association — text clipped out of the table's cell structure would lose the
 * row/column relationship the table exists to provide.
 */
export function StatementFigure({ amount, testId, amountHook }: StatementFigureProps) {
  if (amount === null) {
    // null means UNKNOWN, not zero. Rendering '0.00' would assert a figure the
    // backend explicitly declined to compute.
    return (
      <td className="stmt-cell-figure" data-testid={testId}>
        <span className="stmt-a11y-only" data-testid={amountHook}>
          not available
        </span>
        <span aria-hidden="true">—</span>
      </td>
    )
  }

  const formatted = formatCurrency(amount, { showSymbol: false })
  const { int, frac, negative } = splitFormattedAmount(formatted)
  const spoken = negative ? `negative ${formatted.replace(/^-/, '')}` : formatted

  return (
    <td
      className={`stmt-cell-figure${negative ? ' stmt-figure-negative' : ''}`}
      data-testid={testId}
    >
      <span className="stmt-a11y-only" data-testid={amountHook}>
        {spoken}
      </span>
      <span aria-hidden="true">{`${int}${frac}`}</span>
      {/*
        Reserves one closing-paren width so a positive figure's decimal
        separator lands where a parenthesised negative's does. The glyph comes
        from CSS generated content, NOT a text node: textContent walks the whole
        subtree, so a real ')' here would corrupt every row-level
        toHaveTextContent assertion (spec §4.2).
      */}
      {!negative && <span className="stmt-paren-spacer" aria-hidden="true" />}
    </td>
  )
}
