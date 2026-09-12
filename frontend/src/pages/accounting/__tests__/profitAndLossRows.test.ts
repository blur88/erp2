import { describe, it, expect, vi } from 'vitest'

import { buildProfitAndLossRows } from '../profitAndLossRows'
import type { ProfitAndLossResponse } from '@/types'

const RESPONSE = {
  year: 2026,
  availableYears: [2026],
  sections: [
    {
      rowId: 'revenue.section',
      key: 'revenue',
      label: 'Revenue',
      totalLabel: 'Total Revenue',
      total: '120000.0000',
      totalRowId: 'revenue.total',
      rows: [
        {
          rowId: 'account:sales',
          accountId: 'sales',
          code: '4100',
          name: 'Sales Revenue',
          isPostable: true,
          amount: '120000.0000',
          children: [],
        },
        {
          rowId: 'account:grp',
          accountId: 'grp',
          code: '4200',
          name: 'Other Revenue',
          isPostable: false,
          amount: '0.0000',
          children: [
            {
              rowId: 'account:child',
              accountId: 'child',
              code: '4210',
              name: 'Misc',
              isPostable: true,
              amount: '0.0000',
              children: [],
            },
          ],
        },
      ],
    },
    {
      rowId: 'cogs.section',
      key: 'cogs',
      label: 'Cost of Sales',
      totalLabel: 'Total Cost of Sales',
      total: '63000.0000',
      totalRowId: 'cogs.total',
      rows: [],
    },
  ],
  totalCostOfSales: '62000.0000',
  totalCostOfSalesRowId: 'cogs.total',
  inventoryAdjustments: '-1000.0000',
  inventoryAdjustmentsRowId: 'cogs.adjustments',
  grossProfit: '58000.0000',
  netProfit: '50000.0000',
  integrity: { anomalies: [], structuralFaults: [], tieOutOk: true },
} as unknown as ProfitAndLossResponse

const href = (id: string) => `/gl?account=${id}`

describe('buildProfitAndLossRows', () => {
  it('emits a section head with no figures', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    const section = rows.find((r) => r.testId === 'pl-section-revenue')
    expect(section?.kind).toBe('section')
    expect(section?.figures).toEqual([])
  })

  it('gives a postable leaf a drill-down href', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    expect(rows.find((r) => r.testId === 'pl-row-account:sales')?.href).toBe('/gl?account=sales')
  })

  it('gives a non-postable group NO href and an expand control', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    const group = rows.find((r) => r.testId === 'pl-row-account:grp')
    expect(group?.href).toBeUndefined()
    expect(group?.expand).toBeDefined()
  })

  it('omits children while the group is collapsed', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    expect(rows.find((r) => r.testId === 'pl-row-account:child')).toBeUndefined()
  })

  it('emits children as print-detail rows when expanded', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(['account:grp']), href, vi.fn())
    const child = rows.find((r) => r.testId === 'pl-row-account:child')
    // Depth > 0 is detail: printing whatever the user expanded would make two
    // printouts of one period differ.
    expect(child?.depth).toBe(1)
  })

  it('uses totalCostOfSales for the cogs total, not section.total', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    const total = rows.find((r) => r.testId === 'pl-row-cogs.total')
    expect(total?.figures).toEqual(['62000.0000', null])
  })

  it('places calculated gross profit in the total column', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    const grossProfit = rows.find((r) => r.testId === 'pl-row-grossProfit')
    expect(grossProfit?.figures).toEqual([null, RESPONSE.grossProfit])
    expect(grossProfit?.blankFigures).toEqual([true, false])
  })

  it('places Inventory Adjustments before the cogs total', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    const adj = rows.findIndex((r) => r.testId === 'pl-row-cogs.adjustments')
    const total = rows.findIndex((r) => r.testId === 'pl-row-cogs.total')
    expect(adj).toBeGreaterThan(-1)
    expect(adj).toBeLessThan(total)
  })

  it('places Gross Profit immediately after the cogs total', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, vi.fn())
    const total = rows.findIndex((r) => r.testId === 'pl-row-cogs.total')
    const gp = rows.findIndex((r) => r.testId === 'pl-row-grossProfit')
    expect(gp).toBe(total + 1)
  })

  it('marks a zero amount', () => {
    const rows = buildProfitAndLossRows(RESPONSE, new Set(['account:grp']), href, vi.fn())
    expect(rows.find((r) => r.testId === 'pl-row-account:child')?.isZero).toBe(true)
  })

  it('calls toggle with the row id when an expand control fires', () => {
    const toggle = vi.fn()
    const rows = buildProfitAndLossRows(RESPONSE, new Set(), href, toggle)
    rows.find((r) => r.testId === 'pl-row-account:grp')?.expand?.onToggle()
    expect(toggle).toHaveBeenCalledWith('account:grp')
  })
})
