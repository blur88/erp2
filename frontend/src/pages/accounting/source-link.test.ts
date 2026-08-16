import { describe, expect, it } from 'vitest'
import { buildSourceLink } from './source-link'

describe('buildSourceLink', () => {
  it('links SALES_ORDER by sourceRef (orderNumber), not the UUID', () => {
    expect(buildSourceLink('SALES_ORDER', 'uuid-123', 'SO-0007')).toBe(
      '/sales/orders/SO-0007/view',
    )
  })

  it('links PURCHASE_ORDER by sourceRef (orderNumber)', () => {
    expect(buildSourceLink('PURCHASE_ORDER', 'uuid-456', 'PO-0042')).toBe(
      '/purchasing/orders/PO-0042/view',
    )
  })

  it('links STOCK_ADJUSTMENT by sourceDocumentId (UUID)', () => {
    expect(buildSourceLink('STOCK_ADJUSTMENT', 'adj-uuid-9', 'ADJ-0001')).toBe(
      '/inventory/stock-adjustments/adj-uuid-9/view',
    )
  })

  it('returns null for OPENING_BALANCE', () => {
    expect(buildSourceLink('OPENING_BALANCE', 'acct-uuid', 'Cash')).toBeNull()
  })

  it('returns null for SALES_ORDER when sourceRef is missing', () => {
    expect(buildSourceLink('SALES_ORDER', 'uuid-123', null)).toBeNull()
  })

  it('returns null for PURCHASE_ORDER when sourceRef is missing', () => {
    expect(buildSourceLink('PURCHASE_ORDER', 'uuid-456', null)).toBeNull()
  })

  it('returns null for STOCK_ADJUSTMENT when sourceDocumentId is missing', () => {
    expect(buildSourceLink('STOCK_ADJUSTMENT', null, 'ADJ-0001')).toBeNull()
  })

  // Regression guard: SO/PO must NOT depend on sourceDocumentId. Prevents
  // reintroducing a blanket `if (!sourceDocumentId) return null`.
  it('links SALES_ORDER when sourceRef exists but sourceDocumentId is null', () => {
    expect(buildSourceLink('SALES_ORDER', null, 'SO-0007')).toBe(
      '/sales/orders/SO-0007/view',
    )
  })

  it('links an owner equity entry by reference number', () => {
    expect(buildSourceLink('OWNER_EQUITY', 'uuid-1', 'EQ-26-001')).toBe(
      '/accounting/owner-equity/EQ-26-001/view',
    )
  })

  it('returns null when the reference is missing', () => {
    expect(buildSourceLink('OWNER_EQUITY', 'uuid-1', null)).toBeNull()
  })
})
