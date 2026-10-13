import { describe, expect, it } from 'vitest';

import { salesApiSlice } from '@/store/api/salesApi';

describe('salesApiSlice', () => {
  it('defines consolidated sales endpoints', () => {
    expect(salesApiSlice.endpoints.getCustomers).toBeDefined();
    expect(salesApiSlice.endpoints.createCustomer).toBeDefined();
    expect(salesApiSlice.endpoints.updateCustomer).toBeDefined();
    expect(salesApiSlice.endpoints.getSalesOrders).toBeDefined();
    expect(salesApiSlice.endpoints.getSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.createSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.updateSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.confirmSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.recordOrderPayments).toBeDefined();
    expect(salesApiSlice.endpoints.getPayments).toBeDefined();
  });

  // #1390: the sales module has no soft delete, restore or permanent delete.
  it('defines no delete, restore or deleted-list endpoint', () => {
    const names = Object.keys(salesApiSlice.endpoints);

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => /delete|restore/i.test(name))).toEqual([]);
  });
});
