import { describe, it, expect } from 'vitest'
import { paymentMethodsApiSlice } from '../paymentMethodsApi'

describe('paymentMethodsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(paymentMethodsApiSlice.reducerPath).toBe('paymentMethodsApi')
  })

  it('exports query hooks', () => {
    expect(typeof paymentMethodsApiSlice.endpoints.getPaymentMethods).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.getActivePaymentMethods).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.getActivePaymentMethodsForPurchases).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.getDeletedPaymentMethods).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof paymentMethodsApiSlice.endpoints.createPaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.updatePaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.deletePaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.restorePaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.permanentDeletePaymentMethod).toBe('object')
  })
})
