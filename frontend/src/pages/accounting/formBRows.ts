import type { FormBResponse, FormBRow, FormBAmount } from '@/types'
import { formatCurrency } from '@/utils/currency'

export type FormBRowKind = 'section' | 'line' | 'total' | 'presentationTotal'

export interface FormBTableRow {
  id: string
  kind: FormBRowKind
  line: string
  code: string
  label: string
  amount: string
  /**
   * The RAW payload amount, before the whole-ringgit filing rendering above.
   * StatementFigure (the shared statement figure formatter) formats from the
   * raw value so all three reports read the same; `amount` stays the
   * whole-ringgit rendering used by the reconciliation panel.
   */
  rawAmount: FormBAmount
  formula: string | null
  depth: number
  accountId?: string
  testId: string
  expandable: boolean
  expanded: boolean
}

/**
 * Render a Form B amount for display.
 *
 * `null` is ABSENT, not zero — an em dash is the only correct rendering, and
 * this check MUST come before formatCurrency, which treats null as 0.00 and
 * would silently assert a figure the report does not have.
 *
 * Everything else goes through the shared formatCurrency so the Tax View reads
 * the same as the Accounting View and honours Regional Settings: grouped
 * thousands, two decimals, and the configured currency symbol. Printing the
 * raw scale-4 payload string ('200.0000') exposed storage precision on a
 * statutory form.
 *
 * formatCurrency takes the decimal STRING, never a coerced number: binary64
 * spacing loses fractional cents on large NUMERIC(18,4) values.
 */
export function formatFormBAmount(amount: FormBAmount): string {
  // ZERO decimal places: Form B is filed in whole ringgit ("Masukkan amaun
  // tanpa nilai sen"), and the backend has already truncated. Leaving
  // formatCurrency's 2-decimal default would re-add '.00' — sen the form does
  // not accept — and imply a precision the filed figure does not have.
  return amount === null
    ? '—'
    : formatCurrency(amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function periodLabel(year: number, formVersion: number): string {
  return year === formVersion
    ? `Year of Assessment ${year}`
    : `Year of Assessment ${year} — presented using Form B YA ${formVersion}`
}

export function buildFormBTableRows(data: FormBResponse): FormBTableRow[] {
  const out: FormBTableRow[] = []

  /*
   * Section headers, keyed by the line that starts each block. Grouping the 25
   * statutory lines makes the sheet scannable; the Form B line numbers and
   * their order are untouched, since a filer transcribes them in sequence.
   *
   * Derived here rather than in the payload: this is presentation, and the
   * backend contract already carries everything needed to place them.
   */
  const SECTION_AT: Record<string, string> = {
    N3: 'Sales / Revenue',
    N4: 'Cost of Sales',
    N9: 'Other Income',
    N15: 'Expenses',
  }

  for (const row of data.rows as FormBRow[]) {
    const sectionLabel = SECTION_AT[row.line]
    if (sectionLabel) {
      out.push({
        id: `section.${row.line}`,
        kind: 'section',
        line: '',
        code: '',
        label: sectionLabel,
        amount: '',
        rawAmount: null,
        formula: null,
        depth: 0,
        testId: `formb-section-${row.line}`,
        expandable: false,
        expanded: false,
      })
    }

    out.push({
      id: row.line,
      /*
       * A derived line (N7, N8, N14, N25, N26) is a SUBTOTAL of the lines above
       * it, not another input, and must not look like one — N7 sitting flush
       * with N4/N5/N6 reads as a fourth component rather than their total.
       *
       * `formula` is non-null on exactly those lines in the payload, so it is
       * the signal rather than a hardcoded list of line numbers that would
       * drift from the taxonomy.
       */
      kind: row.formula ? 'total' : 'line',
      line: row.line,
      code: row.line,
      label: row.label,
      amount: formatFormBAmount(row.amount),
      rawAmount: row.amount,
      formula: row.formula,
      depth: 0,
      testId: `formb-line-${row.line}`,
      // No drill-down on screen: the tax view lists the statutory lines only.
      expandable: false,
      expanded: false,
    })

    if (row.line === 'N3') {
      out.push({
        id: 'N3-total-revenue',
        // Presentation only: never part of the statutory line/total sequence.
        kind: 'presentationTotal',
        line: '',
        code: '',
        label: 'Total Revenue',
        amount: formatFormBAmount(row.amount),
        rawAmount: row.amount,
        formula: null,
        depth: 0,
        testId: 'formb-line-total-revenue',
        expandable: false,
        expanded: false,
      })
    }
  }

  return out
}
