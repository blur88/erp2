import { describe, expect, it } from 'vitest'

import { purchasingApiSlice } from '@/store/api/purchasingApi'

describe('purchasingApiSlice', () => {
  it('defines core purchasing endpoints', () => {
    expect(purchasingApiSlice.endpoints.getSuppliers).toBeDefined()
    expect(purchasingApiSlice.endpoints.createSupplier).toBeDefined()
    expect(purchasingApiSlice.endpoints.updateSupplier).toBeDefined()
    expect(purchasingApiSlice.endpoints.getPurchaseOrders).toBeDefined()
    expect(purchasingApiSlice.endpoints.getPurchaseOrder).toBeDefined()
    expect(purchasingApiSlice.endpoints.createPurchaseOrder).toBeDefined()
    expect(purchasingApiSlice.endpoints.updatePurchaseOrder).toBeDefined()
    expect(purchasingApiSlice.endpoints.getGoodsReceivedNotes).toBeDefined()
    expect(purchasingApiSlice.endpoints.getVendorPayments).toBeDefined()
    expect(purchasingApiSlice.endpoints.getDeletedGRNs).toBeDefined()
    expect(purchasingApiSlice.endpoints.getDeletedVendorPayments).toBeDefined()
  })
})
