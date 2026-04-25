import { describe, expect, it } from 'vitest'

import {
  selectSelectedPurchaseOrder,
  selectSelectedGRN,
  selectSelectedVendorPayment,
  selectSelectedSupplier,
  selectSupplierFilters,
} from '../purchasingSlice'

describe('purchasingSlice selectors - undefined state resilience', () => {
  const stateWithoutPurchasing = {} as any

  it('selectSelectedPurchaseOrder returns undefined when purchasing slice is absent', () => {
    expect(() => selectSelectedPurchaseOrder(stateWithoutPurchasing)).not.toThrow()
    expect(selectSelectedPurchaseOrder(stateWithoutPurchasing)).toBeUndefined()
  })

  it('selectSelectedGRN returns undefined when purchasing slice is absent', () => {
    expect(() => selectSelectedGRN(stateWithoutPurchasing)).not.toThrow()
    expect(selectSelectedGRN(stateWithoutPurchasing)).toBeUndefined()
  })

  it('selectSelectedVendorPayment returns undefined when purchasing slice is absent', () => {
    expect(() => selectSelectedVendorPayment(stateWithoutPurchasing)).not.toThrow()
    expect(selectSelectedVendorPayment(stateWithoutPurchasing)).toBeUndefined()
  })

  it('selectSelectedSupplier returns undefined when purchasing slice is absent', () => {
    expect(() => selectSelectedSupplier(stateWithoutPurchasing)).not.toThrow()
    expect(selectSelectedSupplier(stateWithoutPurchasing)).toBeUndefined()
  })

  it('selectSupplierFilters returns undefined when purchasing slice is absent', () => {
    expect(() => selectSupplierFilters(stateWithoutPurchasing)).not.toThrow()
    expect(selectSupplierFilters(stateWithoutPurchasing)).toBeUndefined()
  })
})
