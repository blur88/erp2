import { describe, expect, it } from 'vitest'

import { priceListApiSlice } from '@/store/api/priceListApi'

describe('priceListApiSlice', () => {
  it('defines expected endpoints', () => {
    expect(priceListApiSlice.endpoints.getPriceLists).toBeDefined()
    expect(priceListApiSlice.endpoints.getPriceList).toBeDefined()
    expect(priceListApiSlice.endpoints.createPriceList).toBeDefined()
    expect(priceListApiSlice.endpoints.updatePriceList).toBeDefined()
    expect(priceListApiSlice.endpoints.deletePriceList).toBeDefined()
    expect(priceListApiSlice.endpoints.setDefaultPriceList).toBeDefined()
    expect(priceListApiSlice.endpoints.getEffectivePriceLists).toBeDefined()
    expect(priceListApiSlice.endpoints.getPriceListItems).toBeDefined()
    expect(priceListApiSlice.endpoints.bulkUpdatePrices).toBeDefined()
    expect(priceListApiSlice.endpoints.copyPriceList).toBeDefined()
    expect(priceListApiSlice.endpoints.applyPercentageAdjustment).toBeDefined()
  })
})
