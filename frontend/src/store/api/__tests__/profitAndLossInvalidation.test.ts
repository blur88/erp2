import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Profit & Loss report is served from a cached RTK Query endpoint, so any
 * mutation that changes what it would return must invalidate `ProfitAndLoss`
 * or the page keeps showing pre-mutation figures until a manual reload.
 *
 * Two distinct reasons a mutation qualifies:
 *  - it posts or reverses journal entries (changes the figures);
 *  - it changes the Chart of Accounts or accounting settings (changes section
 *    MEMBERSHIP, so rows move between sections with no new posting at all).
 *
 * Asserted against the source text because RTK Query does not expose an
 * endpoint's `invalidatesTags` on the built slice at runtime.
 */
const read = (rel: string) =>
  readFileSync(resolve(__dirname, '..', rel), 'utf8')

const accountingApi = read('accountingApi.ts')
const inventoryApi = read('inventoryApi.ts')
const crossSlice = read('invalidateAccountingReports.ts')

describe('Profit & Loss cache invalidation', () => {
  it('pairs ProfitAndLoss with every TrialBalance invalidation', () => {
    // Every posting that moves the Trial Balance moves Profit & Loss too, so
    // the two tags travel together. A new mutation that invalidates only
    // TrialBalance fails here.
    const withTrialBalance = accountingApi.match(/invalidatesTags:[^\n]*TrialBalance[^\n]*/g) ?? []
    expect(withTrialBalance.length).toBeGreaterThan(0)
    for (const line of withTrialBalance) {
      expect(line, `missing ProfitAndLoss in: ${line.trim()}`).toContain('ProfitAndLoss')
    }
  })

  it('declares the ProfitAndLoss tag type', () => {
    expect(accountingApi).toMatch(/tagTypes:[^\]]*'ProfitAndLoss'/)
  })

  it('invalidates ProfitAndLoss when the Chart of Accounts changes', () => {
    // A new or edited account can change which section a row belongs to.
    const createAccount = accountingApi.slice(accountingApi.indexOf('createAccount:'))
    expect(createAccount.slice(0, 400)).toContain('ProfitAndLoss')
  })

  it('invalidates ProfitAndLoss when accounting settings change', () => {
    // Re-pointing salesRevenueAccountId or cogsAccountId moves whole subtrees
    // between sections without any new posting.
    const settings = accountingApi.slice(accountingApi.indexOf('updateAccountingSettings:'))
    expect(settings.slice(0, 400)).toContain('ProfitAndLoss')
  })

  it('includes ProfitAndLoss in the cross-slice invalidation helper', () => {
    expect(crossSlice).toContain('ProfitAndLoss')
  })

  it.each(['completeStockAdjustment', 'revertStockAdjustment'])(
    'wires %s to the cross-slice accounting invalidation',
    (endpointName) => {
      // Stock adjustments post STOCK_ADJUSTMENT journal entries, which feed
      // the Inventory Adjustments row. inventoryApi cannot invalidate
      // accountingApi tags directly, so it must go through onQueryStarted.
      const block = inventoryApi.slice(inventoryApi.indexOf(`${endpointName}:`))
      expect(block.indexOf(`${endpointName}:`)).toBe(0)
      expect(block.slice(0, 700)).toContain('invalidateAccountingReportsOnSuccess')
    },
  )
})
