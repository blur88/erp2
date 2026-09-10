export type StatementRowKind = 'section' | 'line' | 'subtotal' | 'bottomLine' | 'spacer'

/**
 * One presentational row. Statement never learns what a P&L or an N-code is —
 * each page shapes its own data into this and hands it over.
 */
export interface StatementRow {
  id: string
  kind: StatementRowKind
  /** Indentation level; 0 is a section's own row. */
  depth: number
  /** Account code, or an LHDN N-code. */
  code?: string
  label: string
  /** One entry per figure column. Empty for a section head. */
  figures: (string | null)[]
  testId: string
  isZero?: boolean
  /** Present ⇒ the label is a drill-down link. */
  href?: string
  expand?: { expanded: boolean; onToggle: () => void }
  /**
   * Testid for a single node carrying the complete formatted amount, e.g.
   * `bs-amount`. Preserves report-specific amount hooks across the two-cell
   * split. Applied to the first figure column only.
   */
  amountHook?: string
  /*
   * Testid for the expand control. Each report already has its OWN convention
   * that existing suites assert (`bs-expand-N37`, `formb-expand-N24`,
   * `pl-expand-<rowId>`), so the row supplies it rather than Statement
   * inventing one. Falls back to `stmt-expand-<id>` when omitted.
   */
  expandTestId?: string

  /*
   * THREE INDEPENDENT AXES, not one enum (spec §4.1):
   *  - printDetail:    mounted and visible on screen, hidden on paper
   *  - printAlways:    printed unconditionally, even when screen-hidden
   *  - hiddenOnScreen: MOUNTED but visually hidden on screen
   *
   * A collapsed Form B cohort is printAlways AND hiddenOnScreen. It must stay
   * mounted: print CSS cannot reveal a row that is not in the DOM.
   */
  printDetail?: boolean
  printAlways?: boolean
  hiddenOnScreen?: boolean
}

export interface StatementProps {
  rows: StatementRow[]
  /** One head per figure column, e.g. ['RM'] or ['Debit', 'Credit']. */
  figureHeads: string[]
  /** Accessible name for the table. */
  label: string
  className?: string
}
