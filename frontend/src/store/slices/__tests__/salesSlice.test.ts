import { describe, expect, it } from 'vitest'

import {
  selectSelectedCustomer,
  selectSelectedOrder,
  selectSelectedInvoice,
  selectSelectedPayment,
  selectSalesError,
} from '../salesSlice'

describe('salesSlice selectors - undefined state resilience', () => {
  const stateWithoutSales = {} as any

  it('selectSelectedCustomer returns undefined when sales slice is absent', () => {
    expect(() => selectSelectedCustomer(stateWithoutSales)).not.toThrow()
    expect(selectSelectedCustomer(stateWithoutSales)).toBeUndefined()
  })

  it('selectSelectedOrder returns undefined when sales slice is absent', () => {
    expect(() => selectSelectedOrder(stateWithoutSales)).not.toThrow()
    expect(selectSelectedOrder(stateWithoutSales)).toBeUndefined()
  })

  it('selectSelectedInvoice returns undefined when sales slice is absent', () => {
    expect(() => selectSelectedInvoice(stateWithoutSales)).not.toThrow()
    expect(selectSelectedInvoice(stateWithoutSales)).toBeUndefined()
  })

  it('selectSelectedPayment returns undefined when sales slice is absent', () => {
    expect(() => selectSelectedPayment(stateWithoutSales)).not.toThrow()
    expect(selectSelectedPayment(stateWithoutSales)).toBeUndefined()
  })

  it('selectSalesError returns undefined when sales slice is absent', () => {
    expect(() => selectSalesError(stateWithoutSales)).not.toThrow()
    expect(selectSalesError(stateWithoutSales)).toBeUndefined()
  })
})
