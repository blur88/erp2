import { describe, expect, it } from 'vitest'

import { getStockOffenders, getStockStatus } from '../stockStatus'

describe('getStockStatus', () => {
  it('returns in_stock when stock is enough', () => {
    expect(getStockStatus(10, 5)).toBe('in_stock')
    expect(getStockStatus(5, 5)).toBe('in_stock')
  })

  it('returns out_of_stock when stock is zero or below', () => {
    expect(getStockStatus(0, 1)).toBe('out_of_stock')
    expect(getStockStatus(-2, 1)).toBe('out_of_stock')
  })

  it('returns insufficient when stock is below ordered quantity', () => {
    expect(getStockStatus(2, 5)).toBe('insufficient')
  })
})

describe('getStockOffenders', () => {
  it('lists items with insufficient or zero stock', () => {
    const items = [
      { product: { name: 'Widget', stockQuantity: 2 }, quantity: 5 },
      { product: { name: 'Gadget', stockQuantity: 10 }, quantity: 3 },
      { product: { name: 'Gizmo', stockQuantity: 0 }, quantity: 1 },
    ]

    const offenders = getStockOffenders(items)

    expect(offenders.map((item) => item.name)).toEqual(['Widget', 'Gizmo'])
    expect(offenders[0]).toMatchObject({ name: 'Widget', stock: 2, quantity: 5 })
  })

  it('returns empty array when all items are in stock', () => {
    const items = [{ product: { name: 'Widget', stockQuantity: 10 }, quantity: 5 }]

    expect(getStockOffenders(items)).toEqual([])
  })

  it('ignores items without product', () => {
    const items = [{ product: undefined, quantity: 5 }]

    expect(getStockOffenders(items)).toEqual([])
  })
})
