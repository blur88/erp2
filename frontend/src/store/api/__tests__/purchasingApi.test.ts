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
    // PO lifecycle endpoints (GRN module removed)
    expect(purchasingApiSlice.endpoints.getPurchaseOrderByNumber).toBeDefined()
    expect(purchasingApiSlice.endpoints.cancelPurchaseOrder).toBeDefined()
    expect(purchasingApiSlice.endpoints.uncancelPurchaseOrder).toBeDefined()
    expect(purchasingApiSlice.endpoints.receiveGoods).toBeDefined()
    expect(purchasingApiSlice.endpoints.returnGoods).toBeDefined()
    expect(purchasingApiSlice.endpoints.recordVendorPayments).toBeDefined()
    expect(purchasingApiSlice.endpoints.getPurchaseOrderPayments).toBeDefined()
    // Single vendor payment read kept for the accounting journal-entry UI
    expect(purchasingApiSlice.endpoints.getVendorPayment).toBeDefined()
  })

  it('does not expose removed GRN / standalone vendor-payment endpoints', () => {
    expect(purchasingApiSlice.endpoints.getGoodsReceivedNotes).toBeUndefined()
    expect(purchasingApiSlice.endpoints.getDeletedGRNs).toBeUndefined()
    expect(purchasingApiSlice.endpoints.getVendorPayments).toBeUndefined()
    expect(purchasingApiSlice.endpoints.getDeletedVendorPayments).toBeUndefined()
  })
})
