import type { FormBAccountRef, FormBResponse, FormBRow, FormBAmount } from '@/types'
import { formatCurrency } from '@/utils/currency'

export type FormBRowKind = 'line' | 'cohort' | 'cohortHeading'

export interface FormBTableRow {
  id: string
  kind: FormBRowKind
  line: string
  code: string
  label: string
  amount: string
  formula: string | null
  depth: number
  accountId?: string
  testId: string
  expandable: boolean
  expanded: boolean
  /**
   * Cohorts print UNCONDITIONALLY, so they get their own class. They must never
   * carry `acct-print-detail-row`: that rule hides the Accounting View's detail,
   * whose totals already say the same thing. Form B cohorts ARE the evidence for
   * why an amount sits on N17 rather than N24, and two people printing the same
   * year must file the same document.
   */
  printClass?: string
  /**
   * When true the row is hidden on screen (collapsed) but still prints —
   * the audit trail must be unconditional on paper even when the screen
   * affordance is collapsed. Screen hiding is via `.acct-screen-hidden`
   * which `@media print` overrides for `.acct-print-formb-cohort`.
   */
  hiddenOnScreen?: boolean
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

const cohortRow = (
  ref: FormBAccountRef, line: string, index: number, group: string,
  hiddenOnScreen = false,
): FormBTableRow => ({
  id: `${line}.${group}.${ref.accountId}`,
  kind: 'cohort',
  line,
  code: ref.code,
  label: ref.isActive ? ref.name : `${ref.name} (inactive)`,
  // A contributor's amount is never null, but it must be formatted the same
  // way as the line totals above it — a cohort showing '5.0000' beside a line
  // showing 'RM 5.00' reads as two different figures.
  amount: formatFormBAmount(ref.amount),
  formula: null,
  depth: 1,
  accountId: ref.accountId,
  testId: `formb-cohort-${line}-${index}`,
  expandable: false,
  expanded: false,
  printClass: 'acct-print-formb-cohort',
  ...(hiddenOnScreen ? { hiddenOnScreen: true as const } : {}),
})

export function buildFormBTableRows(
  data: FormBResponse,
  expanded: ReadonlySet<string>,
): FormBTableRow[] {
  const out: FormBTableRow[] = []

  for (const row of data.rows as FormBRow[]) {
    const contributors = row.accounts ?? []
    const isExpanded = expanded.has(row.line)

    out.push({
      id: row.line,
      kind: 'line',
      line: row.line,
      code: row.line,
      label: row.label,
      amount: formatFormBAmount(row.amount),
      formula: row.formula,
      depth: 0,
      testId: `formb-line-${row.line}`,
      expandable: contributors.length > 0,
      expanded: isExpanded,
    })

    if (contributors.length === 0) continue

    // Cohorts print UNCONDITIONALLY — even when the screen affordance is
    // collapsed, the printed filing must carry the audit trail. So we always
    // emit cohort rows when contributors exist, but mark them hiddenOnScreen
    // when collapsed so the screen still appears collapsed. Print CSS overrides
    // the screen-hide for `.acct-print-formb-cohort`.
    const hiddenOnScreen = !isExpanded

    // N24 / N13 split into labelled subgroups so an explicitly-mapped account
    // is visibly distinct from one that merely fell back.
    if (row.cohorts) {
      const { explicit, fallback } = row.cohorts
      if (explicit.length > 0) {
        out.push(headingRow(row.line, 'explicit', 'Mapped to this line', hiddenOnScreen))
        explicit.forEach((ref, i) => out.push(cohortRow(ref, row.line, i, 'explicit', hiddenOnScreen)))
      }
      if (fallback.length > 0) {
        out.push(headingRow(row.line, 'fallback', 'Unmapped — filed here by default', hiddenOnScreen))
        fallback.forEach((ref, i) => out.push(cohortRow(ref, row.line, i, 'fallback', hiddenOnScreen)))
      }
      continue
    }

    contributors.forEach((ref, i) => out.push(cohortRow(ref, row.line, i, 'accounts', hiddenOnScreen)))
  }

  return out
}

const headingRow = (line: string, group: string, label: string, hiddenOnScreen = false): FormBTableRow => ({
  id: `${line}.${group}.heading`,
  kind: 'cohortHeading',
  line,
  code: '',
  label,
  amount: '',
  formula: null,
  depth: 1,
  testId: `formb-cohort-heading-${line}-${group}`,
  expandable: false,
  expanded: false,
  printClass: 'acct-print-formb-cohort',
  ...(hiddenOnScreen ? { hiddenOnScreen: true as const } : {}),
})
