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
});
