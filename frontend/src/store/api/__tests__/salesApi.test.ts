import { afterEach, describe, expect, it, vi } from 'vitest';

import api from '@/services/api';
import { inventoryApiSlice } from '@/store/api/inventoryApi';
import { salesApiSlice } from '@/store/api/salesApi';
import { createTestStore } from '@/test/createTestStore';

vi.mock('@/services/api', () => ({ default: vi.fn() }));

afterEach(() => vi.clearAllMocks());

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
    expect(salesApiSlice.endpoints.unfulfillSalesOrder).toBeDefined();
    expect(salesApiSlice.endpoints.getPayments).toBeDefined();
  });

  // #1390: the sales module has no soft delete, restore or permanent delete.
  it('defines no delete, restore or deleted-list endpoint', () => {
    const names = Object.keys(salesApiSlice.endpoints);

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => /delete|restore/i.test(name))).toEqual([]);
  });

  it('invalidates product and stock movement data after unfulfill', async () => {
    vi.mocked(api).mockResolvedValue({ data: { data: { id: 'order-1' } } } as any);
    const store = createTestStore({ apis: [salesApiSlice, inventoryApiSlice] });
    const invalidateTags = vi.spyOn(inventoryApiSlice.util, 'invalidateTags');

    await store.dispatch(
      salesApiSlice.endpoints.unfulfillSalesOrder.initiate({ id: 'order-1', reason: 'correction' }),
    );

    expect(invalidateTags).toHaveBeenCalledWith(['Product', 'StockMovement']);
  });
});
