import type { FormBAccountRef, FormBResponse, FormBRow, FormBAmount } from '@/types'

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
}

/** null is ABSENT, not zero. An em dash is the only correct rendering. */
export function formatFormBAmount(amount: FormBAmount): string {
  return amount === null ? '—' : amount
}

export function periodLabel(year: number, formVersion: number): string {
  return year === formVersion
    ? `Year of Assessment ${year}`
    : `Year of Assessment ${year} — presented using Form B YA ${formVersion}`
}

const cohortRow = (
  ref: FormBAccountRef, line: string, index: number, group: string,
): FormBTableRow => ({
  id: `${line}.${group}.${ref.accountId}`,
  kind: 'cohort',
  line,
  code: ref.code,
  label: ref.isActive ? ref.name : `${ref.name} (inactive)`,
  amount: ref.amount,
  formula: null,
  depth: 1,
  accountId: ref.accountId,
  testId: `formb-cohort-${line}-${index}`,
  expandable: false,
  expanded: false,
  printClass: 'acct-print-formb-cohort',
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

    if (!isExpanded || contributors.length === 0) continue

    // N24 / N13 split into labelled subgroups so an explicitly-mapped account
    // is visibly distinct from one that merely fell back.
    if (row.cohorts) {
      const { explicit, fallback } = row.cohorts
      if (explicit.length > 0) {
        out.push(headingRow(row.line, 'explicit', 'Mapped to this line'))
        explicit.forEach((ref, i) => out.push(cohortRow(ref, row.line, i, 'explicit')))
      }
      if (fallback.length > 0) {
        out.push(headingRow(row.line, 'fallback', 'Unmapped — filed here by default'))
        fallback.forEach((ref, i) => out.push(cohortRow(ref, row.line, i, 'fallback')))
      }
      continue
    }

    contributors.forEach((ref, i) => out.push(cohortRow(ref, row.line, i, 'accounts')))
  }

  return out
}

const headingRow = (line: string, group: string, label: string): FormBTableRow => ({
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
})
