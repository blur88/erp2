import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BackupService } from './backup.service';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupRetentionSettings } from '@database/entities/backup-settings.entity';
import { CompanySettings } from '@database/entities/company-settings.entity';
import { PriceCostingSettings } from '@database/entities/price-costing-settings.entity';
import { DocumentNumberSettings } from '@database/entities/document-number-settings.entity';
import { PrintSettings } from '@database/entities/print-settings.entity';

const mockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
});

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: any) => defaultVal ?? null),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    keys: jest.fn().mockResolvedValue([]),
    type: jest.fn(),
    ttl: jest.fn(),
    get: jest.fn(),
    hgetall: jest.fn(),
    lrange: jest.fn(),
    smembers: jest.fn(),
    zrange: jest.fn(),
    set: jest.fn(),
    hmset: jest.fn(),
    rpush: jest.fn(),
    sadd: jest.fn(),
    zadd: jest.fn(),
    expire: jest.fn(),
    flushall: jest.fn(),
    info: jest.fn().mockResolvedValue('redis_version:8.0.0'),
  })),
}));

describe('BackupService - settings backup', () => {
  let service: BackupService;
  let companySettingsRepo: ReturnType<typeof mockRepository>;
  let priceCostingSettingsRepo: ReturnType<typeof mockRepository>;
  let documentNumberSettingsRepo: ReturnType<typeof mockRepository>;
  let printSettingsRepo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(BackupLog), useFactory: mockRepository },
        { provide: getRepositoryToken(BackupRetentionSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(CompanySettings), useFactory: mockRepository },
        { provide: getRepositoryToken(PriceCostingSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(DocumentNumberSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(PrintSettings), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    companySettingsRepo = module.get(getRepositoryToken(CompanySettings));
    priceCostingSettingsRepo = module.get(getRepositoryToken(PriceCostingSettings));
    documentNumberSettingsRepo = module.get(getRepositoryToken(DocumentNumberSettings));
    printSettingsRepo = module.get(getRepositoryToken(PrintSettings));
  });

  describe('getCompanySettings', () => {
    it('returns company settings data from repository', async () => {
      companySettingsRepo.findOne.mockResolvedValue({
        name: 'Acme Corp',
        address: '1 Main St',
        city: 'Kuala Lumpur',
        state: 'WP',
        postalCode: '50000',
        country: 'Malaysia',
        phone: '03-12345678',
        email: 'info@acme.com',
        website: 'https://acme.com',
        miscInfo: 'SST: 12345',
        logoUrl: '/uploads/logos/logo.png',
        isActive: true,
      });

      const result = await (service as any).getCompanySettings();

      expect(companySettingsRepo.findOne).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(result.name).toBe('Acme Corp');
      expect(result.city).toBe('Kuala Lumpur');
    });

    it('returns empty object when no company settings exist', async () => {
      companySettingsRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).getCompanySettings();

      expect(result).toEqual({});
    });
  });

  describe('getPrintSettings', () => {
    it('returns print settings data from repository', async () => {
      printSettingsRepo.findOne.mockResolvedValue({
        companyName: 'Acme Corp',
        address: '1 Main St',
        salesOrderTemplate: { title: 'Sales Order', showLogo: true },
        invoiceTemplate: { title: 'Invoice', showLogo: true },
        logoUrl: '/uploads/logos/logo.png',
      });

      const result = await (service as any).getPrintSettings();

      expect(printSettingsRepo.findOne).toHaveBeenCalled();
      expect(result.companyName).toBe('Acme Corp');
      expect(result.salesOrderTemplate).toEqual({ title: 'Sales Order', showLogo: true });
      expect(result.logoUrl).toBeUndefined();
    });

    it('returns empty object when no print settings exist', async () => {
      printSettingsRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).getPrintSettings();

      expect(result).toEqual({});
    });
  });
});
