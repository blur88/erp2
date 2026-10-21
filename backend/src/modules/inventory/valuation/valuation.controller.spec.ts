import { jest } from '@jest/globals';
import { ValuationController } from './valuation.controller';
import { InventoryValuationService } from './inventory-valuation.service';

describe('ValuationController', () => {
  it('reports active status and method', async () => {
    const manager = {} as any;
    const controller = new ValuationController(
      { manager } as any,
      { isActive: async () => true, currentMethod: async () => 'FIFO' } as unknown as InventoryValuationService,
    );
    await expect(controller.status()).resolves.toEqual({ active: true, method: 'FIFO' });
  });

  it('returns null for products without a valuation balance and computes the unit value', async () => {
    const dataSource: any = { query: jest.fn() };
    dataSource.query.mockResolvedValue([{ quantity: '3.0000', value: '100.00' }]);
    const controller = new ValuationController(dataSource as any, {} as InventoryValuationService);
    await expect(controller.product('product-id')).resolves.toEqual({
      quantityOnHand: '3.0000', valueOnHand: '100.00', unitValue: '33.3333',
    });
    dataSource.query.mockResolvedValueOnce([]);
    await expect(controller.product('missing')).resolves.toBeNull();
  });
});
