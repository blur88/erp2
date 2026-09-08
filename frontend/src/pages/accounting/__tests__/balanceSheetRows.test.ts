// __tests__/balanceSheetRows.test.ts
import { formatBalanceAmount, buildLedgerLink, SECTION_LABELS } from '../balanceSheetRows'

describe('formatBalanceAmount', () => {
  it('renders null as an em dash, NEVER as 0.00', () => {
    expect(formatBalanceAmount(null)).toBe('—')
  })
  it('formats a zero balance as currency', () => {
    expect(formatBalanceAmount('0.0000')).toMatch(/0\.00/)
  })
  it('formats a negative balance', () => {
    expect(formatBalanceAmount('-200.0000')).toMatch(/200\.00/)
  })
})

describe('buildLedgerLink', () => {
  it('uses the account/period/period_from/period_to shape and ends at asOfDate', () => {
    expect(buildLedgerLink('abc', 2026, '2026-09-08')).toBe(
      '/accounting/general-ledger?account=abc&period=custom' +
      '&period_from=2026-01-01&period_to=2026-09-08',
    )
  })
})

describe('SECTION_LABELS', () => {
  it('labels all five sections', () => {
    expect(Object.keys(SECTION_LABELS)).toHaveLength(5)
  })
})
