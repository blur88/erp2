import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from './export.service';
import { SettingsService } from '../../modules/settings/settings.service';

const mockSettingsService = {
  getCompanySettings: jest.fn().mockResolvedValue({ name: 'Test Corp' }),
};

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();
    service = module.get<ExportService>(ExportService);
  });

  describe('exportFlat', () => {
    it('returns a Buffer', async () => {
      const columns = [
        { key: 'name', header: 'Name', type: 'string' as const, width: 20 },
        { key: 'price', header: 'Price', type: 'currency' as const, width: 15 },
      ];
      const rows = [{ name: 'Widget', price: 9.99 }];
      const result = await service.exportFlat('Products', columns, rows);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('exportGrouped', () => {
    it('returns a Buffer', async () => {
      const columns = [
        {
          key: 'categoryName',
          header: 'Category',
          type: 'string' as const,
          width: 20,
        },
        {
          key: 'productName',
          header: 'Product',
          type: 'string' as const,
          width: 25,
        },
        { key: 'value', header: 'Value', type: 'currency' as const, width: 15 },
      ];
      const rows = [
        { categoryName: 'Electronics', productName: 'Phone', value: 500 },
        { categoryName: 'Electronics', productName: 'Tablet', value: 300 },
        { categoryName: 'Clothing', productName: 'Shirt', value: 50 },
      ];
      const group = {
        groupKey: 'categoryName',
        groupLabel: 'Category',
        subtotalColumns: ['value'],
      };
      const result = await service.exportGrouped('Sales', columns, rows, group);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('computes subtotals correctly', async () => {
      const columns = [
        { key: 'group', header: 'Group', type: 'string' as const },
        { key: 'amount', header: 'Amount', type: 'currency' as const },
      ];
      const rows = [
        { group: 'A', amount: 100 },
        { group: 'A', amount: 200 },
        { group: 'B', amount: 50 },
      ];
      const group = {
        groupKey: 'group',
        groupLabel: 'Group',
        subtotalColumns: ['amount'],
      };
      await expect(
        service.exportGrouped('Test', columns, rows, group),
      ).resolves.toBeTruthy();
    });
  });
});
