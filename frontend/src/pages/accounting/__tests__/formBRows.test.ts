import { buildFormBTableRows, formatFormBAmount, periodLabel } from '../formBRows'
import type { FormBResponse } from '@/types'

const row = (over: any = {}) => ({
  line: 'N15', label: 'Loan Interest', formula: null, amount: '0.0000',
  accounts: [], cohorts: null, ...over,
})

const data = (rows: any[]): FormBResponse => ({
  year: 2025, formVersion: 2025, availableYears: [2025],
  identity: {
    businessName: { value: 'Acme', source: 'companySettings' },
    registrationNumber: { value: '201901234567', source: 'companySettings' },
  },
  rows: rows as any,
  reconciliation: {
    n7: '0.0000', accountingTotalCostOfSales: '0.0000',
    inventoryAdjustments: '0.0000', ownerStockDrawings: '0.0000', residual: '0.0000',
  },
  findings: [],
  readiness: { hasWarnings: false, hasIncomplete: false, hasIntegrity: false,
    counts: { warning: 0, incomplete: 0, integrity: 0 } },
})

describe('formatFormBAmount', () => {
  // The whole absent-vs-zero discipline lands here. This check must come
  // BEFORE formatCurrency, which treats null as 0.00.
  it('renders null as an em dash, never as 0.00', () => {
    expect(formatFormBAmount(null)).toBe('—')
  })
  it('renders a zero amount as a real zero', () => {
    expect(formatFormBAmount('0.0000')).not.toBe('—')
    expect(formatFormBAmount('0.0000')).toMatch(/\b0$/)
  })

  // Regional Settings: grouped thousands, two decimals, currency symbol —
  // matching the Accounting View. The raw scale-4 payload string exposed
  // storage precision on a statutory form.
  // Whole ringgit, no sen: the backend truncates, and the display must not
  // re-add '.00' — that would show sen the form does not accept.
  it('groups thousands and shows NO decimals', () => {
    expect(formatFormBAmount('1234567.0000')).toMatch(/1,234,567$/)
    expect(formatFormBAmount('200.0000')).toMatch(/200$/)
    expect(formatFormBAmount('200.0000')).not.toContain('.00')
  })

  it('renders negatives, which N8 and N26 legitimately are', () => {
    expect(formatFormBAmount('-1520.0000')).toMatch(/1,520$/)
    expect(formatFormBAmount('-1520.0000')).toContain('-')
  })

  // formatCurrency is handed the decimal STRING: coercing to a JS number loses
  // fractional cents once binary64 spacing exceeds 0.01.
  it('preserves precision on a large NUMERIC(18,4) value', () => {
    expect(formatFormBAmount('99999999999999.0000')).toMatch(/99,999,999,999,999$/)
  })
})

describe('periodLabel', () => {
  it('names only the year when it matches the form version', () => {
    expect(periodLabel(2025, 2025)).toBe('Year of Assessment 2025')
  })
  // A hardcoded 2025 would put a confident wrong year on the filed paper.
  it('names both when the year differs from the form version', () => {
    expect(periodLabel(2024, 2025))
      .toBe('Year of Assessment 2024 — presented using Form B YA 2025')
  })
})

describe('buildFormBTableRows', () => {
  it('emits every statutory line, zero rows included', () => {
    const built = buildFormBTableRows(data([row({ line: 'N15', amount: '0.0000' })]))
    // 'line' and 'total' are both statutory rows — a derived line is styled
    // differently, not excluded — so match on either.
    const statutory = (r: { kind: string }) => r.kind === 'line' || r.kind === 'total'
    expect(built.filter(statutory).map((r) => r.line)).toEqual(['N15'])
  })

  /*
   * Section headers group the 25 lines for scanning. They are presentation
   * only: the statutory line numbers and their ORDER are untouched, because a
   * filer transcribes them in sequence onto the form.
   */
  it('emits a section header before each block', () => {
    const lines = ['N3', 'N4', 'N9', 'N15'].map((l) => row({ line: l }))
    const built = buildFormBTableRows(data(lines))
    expect(built.filter((r) => r.kind === 'section').map((r) => r.label)).toEqual([
      'Sales / Revenue', 'Cost of Sales', 'Other Income', 'Expenses',
    ])
  })

  it('places each header immediately before its opening line', () => {
    const built = buildFormBTableRows(data([row({ line: 'N3' }), row({ line: 'N4' })]))
    for (const line of ['N3', 'N4']) {
      const index = built.findIndex((r) => r.line === line)
      expect(index).toBeGreaterThan(0)
      expect(built[index - 1]).toMatchObject({ kind: 'section', id: `section.${line}` })
    }
  })

  it('gives section rows no amount, so the column stays clean', () => {
    const built = buildFormBTableRows(data([row({ line: 'N3', amount: '200.0000' })]))
    expect(built.find((r) => r.kind === 'section')!.amount).toBe('')
  })

  it('does not reorder or renumber the statutory lines', () => {
    // Includes a DERIVED line (N7 carries a formula) so the assertion covers
    // both row kinds; filtering on 'line' alone would silently skip subtotals.
    const all = [
      row({ line: 'N3' }), row({ line: 'N4' }),
      row({ line: 'N7', formula: 'N4 + N5 - N6' }),
      row({ line: 'N9' }), row({ line: 'N15' }), row({ line: 'N24' }),
    ]
    const built = buildFormBTableRows(data(all))
    const statutory = (r: { kind: string }) => r.kind === 'line' || r.kind === 'total'
    expect(built.filter(statutory).map((r) => r.line))
      .toEqual(['N3', 'N4', 'N7', 'N9', 'N15', 'N24'])
  })

  // Derived lines are subtotals and must be visually distinguishable from the
  // components above them.
  it('marks lines carrying a formula as totals', () => {
    const built = buildFormBTableRows(data([
      row({ line: 'N5' }),
      row({ line: 'N7', formula: 'N4 + N5 - N6' }),
    ]))
    expect(built.find((r) => r.line === 'N5')!.kind).toBe('line')
    expect(built.find((r) => r.line === 'N7')!.kind).toBe('total')
  })

  /*
   * Contributing accounts are no longer rendered anywhere (#1223): the screen
   * lists the statutory lines alone, and the print path that carried the
   * classification audit trail was removed.
   */
  it('emits only the statutory lines, never per-account rows', () => {
    const contributor = { accountId: 'a1', code: '6990', name: 'Sundry',
      isActive: true, category: null, assignment: 'fallback' as const, amount: '5.0000' }
    const d = data([row({ line: 'N24', accounts: [contributor],
      cohorts: { explicit: [], fallback: [contributor] } })])
    const built = buildFormBTableRows(d)
    // No row carries an accountId: per-account rows were the only rows that did.
    expect(built.some((r) => r.accountId !== undefined)).toBe(false)
    // Exactly one row for the statutory line itself.
    expect(built.filter((r) => r.line === 'N24')).toHaveLength(1)
  })

  // No drill-down affordance anywhere: the arrow is gone from every line.
  it('marks no line as expandable', () => {
    const contributor = { accountId: 'a1', code: '6990', name: 'Sundry',
      isActive: true, category: null, assignment: 'fallback' as const, amount: '5.0000' }
    const d = data([row({ line: 'N24', accounts: [contributor],
      cohorts: { explicit: [], fallback: [contributor] } })])
    const built = buildFormBTableRows(d)
    expect(built.some((r) => r.expandable)).toBe(false)
    expect(built.some((r) => r.expanded)).toBe(false)
  })
})
