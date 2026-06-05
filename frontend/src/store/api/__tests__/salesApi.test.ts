import { describe, expect, it } from 'vitest';

import { salesApiSlice } from '@/store/api/salesApi';

describe('salesApiSlice', () => {
  it('defines consolidated sales endpoints', () => {
    expect(salesApiSlice.endpoints.getCustomers).toBeDefined();
    expect(salesApiSlice.endpoints.createCustomer).toBeDefined();
    expect(salesApiSlice.endpoints.updateCustomer).toBeDefined();
    expect(salesApiSlice.endpoints.getDeletedCustomers).toBeDefined();
    expect(salesApiSlice.endpoints.getSalesOrders).toBeDefined();
    expect(salesApiSlice.endpoints.getSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.createSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.updateSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.confirmSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.recordOrderPayments).toBeDefined();
    expect(salesApiSlice.endpoints.getDeletedSalesOrders).toBeDefined();
    expect(salesApiSlice.endpoints.getPayments).toBeDefined();
    expect(salesApiSlice.endpoints.getDeletedPayments).toBeDefined();
  });
});
