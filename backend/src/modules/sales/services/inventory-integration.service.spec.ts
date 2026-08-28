import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryIntegrationService } from './inventory-integration.service';
import { Product } from '../../../database/entities/product.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';

describe('InventoryIntegrationService', () => {
  let service: InventoryIntegrationService;
  let baseCostCalculator: { reduceStock: any; restoreStock: any };

  beforeEach(async () => {
    baseCostCalculator = { reduceStock: (jest.fn as unknown as any)(), restoreStock: (jest.fn as unknown as any)() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryIntegrationService,
        { provide: getRepositoryToken(Product), useValue: { findOne: (jest.fn as unknown as any)(), save: (jest.fn as unknown as any)() } },
        { provide: getRepositoryToken(StockMovement), useValue: { create: (jest.fn as unknown as any)((d) => d), save: (jest.fn as unknown as any)() } },
        { provide: getRepositoryToken(SalesOrder), useValue: {} },
        { provide: getRepositoryToken(SalesOrderItem), useValue: {} },
        { provide: BaseCostCalculatorService, useValue: baseCostCalculator },
        { provide: SettingsService, useValue: {} },
      ],
    }).compile();
    service = module.get(InventoryIntegrationService);
  });

  it('adjustStock uses the supplied manager and lets reduceStock errors propagate (no swallow)', async () => {
    const product = { id: 'p1', stockQuantity: 10 };
    const findOne = (jest.fn as unknown as any)().mockResolvedValue(product);
    const save = (jest.fn as unknown as any)().mockResolvedValue(product);
    const movementSave = (jest.fn as unknown as any)().mockResolvedValue({ id: 'm1' });
    const manager = {
      getRepository: (jest.fn as unknown as any)().mockImplementation((entity) =>
        entity === StockMovement ? { create: (jest.fn as unknown as any)((d) => d), save: movementSave } : { findOne, save },
      ),
    } as any;
    baseCostCalculator.reduceStock.mockRejectedValue(new Error('cost failure'));

    await expect(
      service.adjustStock('p1', -2, 'Sales order fulfillment: SO-1', 'order-1', 'user-1', undefined, manager),
    ).rejects.toThrow('cost failure');
    expect(findOne).toHaveBeenCalled();
  });
});
