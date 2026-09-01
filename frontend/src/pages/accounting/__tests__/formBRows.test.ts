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
    expect(formatFormBAmount('0.0000')).toMatch(/0\.00$/)
  })

  // Regional Settings: grouped thousands, two decimals, currency symbol —
  // matching the Accounting View. The raw scale-4 payload string exposed
  // storage precision on a statutory form.
  it('groups thousands and shows two decimals, not scale-4', () => {
    expect(formatFormBAmount('1234567.8900')).toMatch(/1,234,567\.89$/)
    expect(formatFormBAmount('200.0000')).toMatch(/200\.00$/)
    expect(formatFormBAmount('200.0000')).not.toContain('200.0000')
  })

  it('renders negatives, which N8 and N26 legitimately are', () => {
    expect(formatFormBAmount('-1520.0000')).toMatch(/1,520\.00$/)
    expect(formatFormBAmount('-1520.0000')).toContain('-')
  })

  // formatCurrency is handed the decimal STRING: coercing to a JS number loses
  // fractional cents once binary64 spacing exceeds 0.01.
  it('preserves precision on a large NUMERIC(18,4) value', () => {
    expect(formatFormBAmount('99999999999999.9900')).toMatch(/99,999,999,999,999\.99$/)
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
    const built = buildFormBTableRows(data([row({ line: 'N15', amount: '0.0000' })]), new Set())
    expect(built.map((r) => r.line)).toEqual(['N15'])
  })

  it('still emits cohort rows for a collapsed line but marks them hidden on screen so they print unconditionally', () => {
    const d = data([row({
      line: 'N24', accounts: [{ accountId: 'a1', code: '6990', name: 'Sundry',
        isActive: true, category: null, assignment: 'fallback', amount: '5.0000' }],
      cohorts: { explicit: [], fallback: [{ accountId: 'a1', code: '6990', name: 'Sundry',
        isActive: true, category: null, assignment: 'fallback', amount: '5.0000' }] },
    })])
    const built = buildFormBTableRows(d, new Set())
    const cohorts = built.filter((r) => r.kind === 'cohort')
    expect(cohorts.map((r) => r.accountId)).toEqual(['a1'])
    expect(cohorts.every((r) => r.hiddenOnScreen === true)).toBe(true)
    // Print class is still the cohort class so the @media print rule shows them
    expect(cohorts.every((r) => r.printClass === 'acct-print-formb-cohort')).toBe(true)
  })

  it('emits cohort rows for an expanded line', () => {
    const contributor = { accountId: 'a1', code: '6990', name: 'Sundry',
      isActive: true, category: null, assignment: 'fallback' as const, amount: '5.0000' }
    const d = data([row({ line: 'N24', accounts: [contributor],
      cohorts: { explicit: [], fallback: [contributor] } })])
    const built = buildFormBTableRows(d, new Set(['N24']))
    expect(built.filter((r) => r.kind === 'cohort').map((r) => r.accountId)).toEqual(['a1'])
  })

  // Cohorts are the classification AUDIT TRAIL, so they print regardless of
  // expansion — and must therefore NOT carry .acct-print-detail-row, which the
  // Accounting View uses to hide its (redundant) detail.
  it('marks cohort rows with the Form B print class, never the detail-row class', () => {
    const contributor = { accountId: 'a1', code: '6990', name: 'Sundry',
      isActive: true, category: null, assignment: 'fallback' as const, amount: '5.0000' }
    const d = data([row({ line: 'N24', accounts: [contributor],
      cohorts: { explicit: [], fallback: [contributor] } })])
    const built = buildFormBTableRows(d, new Set(['N24']))
    const cohort = built.find((r) => r.kind === 'cohort')!
    expect(cohort.printClass).toBe('acct-print-formb-cohort')
    expect(cohort.printClass).not.toBe('acct-print-detail-row')
  })
})
