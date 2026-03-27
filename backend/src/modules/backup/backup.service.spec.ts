import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BackupService } from './backup.service';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupRetentionSettings } from '@database/entities/backup-settings.entity';
import { CompanySettings } from '@database/entities/company-settings.entity';
import { RegionalSettings } from '@database/entities/regional-settings.entity';
import { DocumentNumberSetting } from '@database/entities/document-number-settings.entity';
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
  let documentNumberSettingRepo: ReturnType<typeof mockRepository>;
  let printSettingsRepo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(BackupLog), useFactory: mockRepository },
        { provide: getRepositoryToken(BackupRetentionSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(CompanySettings), useFactory: mockRepository },
        { provide: getRepositoryToken(RegionalSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(DocumentNumberSetting), useFactory: mockRepository },
        { provide: getRepositoryToken(PrintSettings), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    companySettingsRepo = module.get(getRepositoryToken(CompanySettings));
    priceCostingSettingsRepo = module.get(getRepositoryToken(RegionalSettings));
    documentNumberSettingRepo = module.get(getRepositoryToken(DocumentNumberSetting));
    printSettingsRepo = module.get(getRepositoryToken(PrintSettings));
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  describe('backupSettings', () => {
    it('writes settings JSON file with all 4 settings types', async () => {
      const mockFs = {
        writeFile: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(require('fs/promises'), 'writeFile').mockImplementation(mockFs.writeFile);

      companySettingsRepo.findOne.mockResolvedValue({
        name: 'Acme Corp', address: '1 Main St', city: 'KL',
        state: 'WP', postalCode: '50000', country: 'MY',
        phone: '', email: '', website: '', miscInfo: '', isActive: true,
      });

      priceCostingSettingsRepo.findOne.mockResolvedValue({
        currency: 'MYR', costingMethod: 'AVERAGE',
        dateFormat: 'DD/MM/YYYY', timeFormat: '24h', numberFormat: '1,234.56',
        isActive: true,
      });

      documentNumberSettingRepo.find.mockResolvedValue([
        {
          documentName: 'Sales Orders',
          prefix: 'SO',
          paddingDigits: 3,
          nextNumber: 42,
          lastResetYear: 26,
        },
      ]);

      printSettingsRepo.findOne.mockResolvedValue({
        companyName: 'Acme Corp', address: '1 Main St', city: 'KL',
        salesOrderTemplate: { title: 'Sales Order' },
      });

      await (service as any).backupSettings('/tmp/test', '20260223_120000');

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      const [, jsonStr] = mockFs.writeFile.mock.calls[0];
      const data = JSON.parse(jsonStr);

      expect(data.companySettings.name).toBe('Acme Corp');
      expect(data.priceCostingSettings.currency).toBe('MYR');
      expect(data.documentNumberSettings.configurations[0].nextNumber).toBe(42);
      expect(data.printSettings.salesOrderTemplate).toEqual({ title: 'Sales Order' });
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('restoreSettings', () => {
    const mockSettingsJson = {
      companySettings: {
        name: 'Restored Corp', address: '2 Restore St', city: 'Petaling Jaya',
        state: 'Selangor', postalCode: '47500', country: 'Malaysia',
        phone: '03-99999999', email: 'restore@corp.com', website: '', miscInfo: '',
      },
      priceCostingSettings: {
        currency: 'USD', costingMethod: 'FIFO',
        dateFormat: 'MM/DD/YYYY', timeFormat: '12h', numberFormat: '1,234.56',
      },
      documentNumberSettings: {
        configurations: [
          { documentName: 'Sales Orders', prefix: 'SO', paddingDigits: 3, nextNumber: 100, lastResetYear: 26 },
        ],
      },
      printSettings: {
        companyName: 'Restored Corp', address: '2 Restore St',
        salesOrderTemplate: { title: 'Sales Order', showLogo: false },
      },
      timestamp: '2026-02-23T00:00:00.000Z',
    };

    beforeEach(() => {
      jest.spyOn(require('fs/promises'), 'readdir').mockResolvedValue(['settings_20260223_120000.json']);
      jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue(
        JSON.stringify(mockSettingsJson),
      );
    });

    it('upserts existing company settings (update path)', async () => {
      const existing = { id: 'uuid-1', name: 'Old Corp', isActive: true };
      companySettingsRepo.findOne.mockResolvedValue(existing);
      companySettingsRepo.save.mockResolvedValue({ ...existing, ...mockSettingsJson.companySettings });

      priceCostingSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      priceCostingSettingsRepo.save.mockResolvedValue({});
      documentNumberSettingRepo.findOne.mockResolvedValue({
        id: 'uuid-3',
        documentName: 'Sales Orders',
      });
      documentNumberSettingRepo.save.mockResolvedValue({});
      printSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-4' });
      printSettingsRepo.save.mockResolvedValue({});

      await (service as any).restoreSettings('/tmp/restore');

      expect(companySettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Restored Corp', id: 'uuid-1' }),
      );
    });

    it('creates company settings when none exist (create path)', async () => {
      companySettingsRepo.findOne.mockResolvedValue(null);
      companySettingsRepo.create.mockReturnValue({ name: 'Restored Corp' });
      companySettingsRepo.save.mockResolvedValue({ name: 'Restored Corp' });

      priceCostingSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      priceCostingSettingsRepo.save.mockResolvedValue({});
      documentNumberSettingRepo.findOne.mockResolvedValue({
        id: 'uuid-3',
        documentName: 'Sales Orders',
      });
      documentNumberSettingRepo.save.mockResolvedValue({});
      printSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-4' });
      printSettingsRepo.save.mockResolvedValue({});

      await (service as any).restoreSettings('/tmp/restore');

      expect(companySettingsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Restored Corp' }),
      );
      expect(companySettingsRepo.save).toHaveBeenCalled();
    });

    it('does not restore logoUrl for company settings', async () => {
      const jsonWithLogo = {
        ...mockSettingsJson,
        companySettings: { ...mockSettingsJson.companySettings, logoUrl: '/uploads/logos/old.png' },
      };
      jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue(JSON.stringify(jsonWithLogo));

      companySettingsRepo.findOne.mockResolvedValue({ id: 'uuid-1', isActive: true });
      companySettingsRepo.save.mockResolvedValue({});
      priceCostingSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      priceCostingSettingsRepo.save.mockResolvedValue({});
      documentNumberSettingRepo.findOne.mockResolvedValue({
        id: 'uuid-3',
        documentName: 'Sales Orders',
      });
      documentNumberSettingRepo.save.mockResolvedValue({});
      printSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-4' });
      printSettingsRepo.save.mockResolvedValue({});

      await (service as any).restoreSettings('/tmp/restore');

      const savedArg = companySettingsRepo.save.mock.calls[0][0];
      expect(savedArg.logoUrl).toBeUndefined();
    });

    it('logs warning and skips if no settings file found', async () => {
      jest.spyOn(require('fs/promises'), 'readdir').mockResolvedValue(['other_file.json']);
      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

      await (service as any).restoreSettings('/tmp/restore');

      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('No settings file found'));
      expect(companySettingsRepo.save).not.toHaveBeenCalled();
    });
  });
});
