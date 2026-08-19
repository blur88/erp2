import { describe, expect, it } from 'vitest'
import type { OwnerEquityDocument as Doc } from '@/types'
import { getOwnerEquityActionMetas } from '../ownerEquityActions'

const injection = (over: Partial<Doc> = {}) => ({
  type: 'CAPITAL_INJECTION', documentStatus: 'DRAFT', settlementStatus: 'UNSETTLED', ...over,
} as Doc)

describe('monetary actions', () => {
  it('offers settle, edit and cancel on an unsettled draft', () => {
    expect(getOwnerEquityActionMetas(injection()).map((m) => m.action))
      .toEqual(['settle', 'edit', 'cancel'])
  })
  it('drops cancel once partially settled and adds refund', () => {
    const metas = getOwnerEquityActionMetas(injection({ settlementStatus: 'PARTIAL' }))
    expect(metas.map((m) => m.action)).toEqual(['settle', 'refund', 'edit'])
  })
  it('offers only refund when COMPLETED — refund is the sole reversal (#1094)', () => {
    expect(getOwnerEquityActionMetas(injection({ documentStatus: 'COMPLETED', settlementStatus: 'SETTLED' }))
      .map((m) => m.action)).toEqual(['refund'])
  })
  it('never offers complete or uncomplete on a monetary document', () => {
    const every = (['DRAFT', 'COMPLETED', 'CANCELLED'] as const).flatMap((d) =>
      (['UNSETTLED', 'PARTIAL', 'SETTLED', 'OVERSETTLED'] as const).flatMap((s) =>
        (['CAPITAL_INJECTION', 'CASH_DRAWING'] as const).flatMap((t) =>
          getOwnerEquityActionMetas({ type: t, documentStatus: d, settlementStatus: s } as Doc))))
    expect(every.map((m) => m.action)).not.toContain('complete')
    expect(every.map((m) => m.action)).not.toContain('uncomplete')
  })
  it('never offers edit, settle or cancel once COMPLETED', () => {
    const metas = getOwnerEquityActionMetas(
      injection({ documentStatus: 'COMPLETED', settlementStatus: 'SETTLED' }),
    ).map((m) => m.action)
    expect(metas).not.toContain('edit')
    expect(metas).not.toContain('settle')
    expect(metas).not.toContain('cancel')
  })
  it('offers only uncancel when CANCELLED', () => {
    expect(getOwnerEquityActionMetas(injection({ documentStatus: 'CANCELLED' }))
      .map((m) => m.action)).toEqual(['uncancel'])
  })
})

describe('stock drawing actions', () => {
  const stock = (over = {}) => ({ type: 'STOCK_DRAWING', documentStatus: 'DRAFT', settlementStatus: null, ...over } as Doc)
  it('never offers settle or refund', () => {
    const all = ['DRAFT', 'COMPLETED', 'CANCELLED'].flatMap((s) =>
      getOwnerEquityActionMetas(stock({ documentStatus: s })).map((m) => m.action))
    expect(all).not.toContain('settle')
    expect(all).not.toContain('refund')
  })
  it('offers complete, edit and cancel on a draft', () => {
    expect(getOwnerEquityActionMetas(stock()).map((m) => m.action))
      .toEqual(['complete', 'edit', 'cancel'])
  })
  it('offers only uncomplete when completed', () => {
    expect(getOwnerEquityActionMetas(stock({ documentStatus: 'COMPLETED' })).map((m) => m.action))
      .toEqual(['uncomplete'])
  })
})

it('never offers a delete action in any state', () => {
  const every = ['DRAFT', 'COMPLETED', 'CANCELLED'].flatMap((s) =>
    ['CAPITAL_INJECTION', 'CASH_DRAWING', 'STOCK_DRAWING'].flatMap((t) =>
      getOwnerEquityActionMetas({ type: t, documentStatus: s, settlementStatus: null } as Doc)))
  expect(every.map((m) => m.action)).not.toContain('delete')
})
