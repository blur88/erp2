import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fsCb from 'fs';
import { BackupService } from './backup.service';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupRetentionSettings } from '@database/entities/backup-settings.entity';
import { CompanySettings } from '@database/entities/company-settings.entity';
import { RegionalSettings } from '@database/entities/regional-settings.entity';
import { DocumentNumberSetting } from '@database/entities/document-number-settings.entity';
import { PrintSettings } from '@database/entities/print-settings.entity';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function mockSuccessfulSpawn(stdout = '') {
  mockSpawn.mockImplementationOnce(() => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      if (stdout) {
        child.stdout.emit('data', stdout);
      }
      child.emit('close', 0);
    });

    return child;
  });
}

function mockFailingSpawn(stderr = 'permission denied', code = 1) {
  mockSpawn.mockImplementationOnce(() => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  });
}

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
  let backupLogRepo: ReturnType<typeof mockRepository>;
  let companySettingsRepo: ReturnType<typeof mockRepository>;
  let regionalSettingsRepo: ReturnType<typeof mockRepository>;
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
    backupLogRepo = module.get(getRepositoryToken(BackupLog));
    companySettingsRepo = module.get(getRepositoryToken(CompanySettings));
    regionalSettingsRepo = module.get(getRepositoryToken(RegionalSettings));
    documentNumberSettingRepo = module.get(getRepositoryToken(DocumentNumberSetting));
    printSettingsRepo = module.get(getRepositoryToken(PrintSettings));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockSpawn.mockReset();
  });

  describe('processUploadedBackup', () => {
    const fsPromises = require('fs/promises');
    const nodeCrypto = require('crypto');

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string, defaultVal?: any) => {
        if (key === 'BACKUP_DIRECTORY') {
          return '/app/backups';
        }
        return defaultVal ?? null;
      });
    });

    afterEach(() => {
      mockConfigService.get.mockImplementation(
        (_key: string, defaultVal?: any) => defaultVal ?? null,
      );
    });

    it('stores uploaded backups under a generated archive filename and preserves the original name in metadata', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
      jest.spyOn(nodeCrypto, 'randomUUID').mockReturnValue('uuid-123');
      jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'readFile').mockResolvedValue(
        JSON.stringify({ description: 'Uploaded backup' }),
      );
      jest.spyOn(fsPromises, 'stat').mockResolvedValue({ size: 42 });
      jest.spyOn(fsPromises, 'readdir').mockResolvedValue([
        'erp_db_20260430_120000.sql.gz',
      ]);
      jest.spyOn(fsPromises, 'rm').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'extractArchive').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'calculateChecksum').mockResolvedValue('checksum-123');
      backupLogRepo.create.mockImplementation((input) => input);
      backupLogRepo.save.mockImplementation(async (input) => input);

      const result = await service.processUploadedBackup({
        originalname: 'customer_backup.tar.gz',
        path: '/app/backups/uploads/upload_1770000000000_uuid-123.tar.gz',
      } as Express.Multer.File);

      expect(fsPromises.rename).toHaveBeenCalledWith(
        '/app/backups/uploads/upload_1770000000000_uuid-123.tar.gz',
        '/app/backups/archives/uploaded_backup_1770000000000_uuid-123.tar.gz',
      );
      expect(result.filename).toBe('uploaded_backup_1770000000000_uuid-123.tar.gz');
      expect(result.filepath).toBe(
        '/app/backups/archives/uploaded_backup_1770000000000_uuid-123.tar.gz',
      );
      expect(result.metadata).toEqual(
        expect.objectContaining({
          originalFilename: 'customer_backup.tar.gz',
          checksum: 'checksum-123',
        }),
      );
    });

    it('rejects file.path values that escape the uploads directory', async () => {
      await expect(
        service.processUploadedBackup({
          originalname: 'backup.tar.gz',
          path: '/app/backups/uploads/../archives/evil.tar.gz',
        } as Express.Multer.File),
      ).rejects.toThrow('Invalid upload path detected');
    });
  });

  describe('command execution', () => {
    it('uses spawn argument arrays for PostgreSQL backup creation', async () => {
      mockSuccessfulSpawn();
      mockSuccessfulSpawn();

      const result = await (service as any).backupPostgreSQL('/tmp/backup dir', '20260430_120000');

      expect(result).toBe('erp_db_20260430_120000.sql.gz');
      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'pg_dump', [
        '-h', 'postgres',
        '-p', '5432',
        '-U', 'erp_user',
        '-d', 'erp_db',
        '-F', 'p',
        '--clean',
        '--if-exists',
        '-f', '/tmp/backup dir/erp_db_20260430_120000.sql',
      ], expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: '' }),
      }));
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'gzip', [
        '/tmp/backup dir/erp_db_20260430_120000.sql',
      ], {});
    });

    it('uses spawn argument arrays for PostgreSQL version checks', async () => {
      mockSuccessfulSpawn('psql (PostgreSQL) 16.2\n');

      const result = await (service as any).getPostgreSQLVersion();

      expect(result).toBe('psql (PostgreSQL) 16.2');
      expect(mockSpawn).toHaveBeenCalledWith('psql', ['--version'], {});
    });

    it('uses spawn argument arrays for PostgreSQL table listing', async () => {
      mockSuccessfulSpawn(' customers \n invoices \n\n');

      const result = await (service as any).getPostgreSQLTables();

      expect(result).toEqual(['customers', 'invoices']);
      expect(mockSpawn).toHaveBeenCalledWith('psql', [
        '-h', 'postgres',
        '-p', '5432',
        '-U', 'erp_user',
        '-d', 'erp_db',
        '-t',
        '-c', "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      ], expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: '' }),
      }));
    });

    it('uses spawn argument arrays for tar extraction', async () => {
      jest.spyOn(require('fs/promises'), 'mkdir').mockResolvedValue(undefined);
      mockSuccessfulSpawn();

      await (service as any).extractArchive('/tmp/backup;rm.tar.gz', '/tmp/restore dir');

      expect(mockSpawn).toHaveBeenCalledWith('tar', [
        '-xzf',
        '/tmp/backup;rm.tar.gz',
        '-C',
        '/tmp/restore dir',
      ], {});
    });

    it('uses spawn argument arrays for PostgreSQL restore', async () => {
      jest.spyOn(require('fs/promises'), 'readdir').mockResolvedValue(['erp_db_20260430_120000.sql.gz']);
      mockSuccessfulSpawn();
      mockSuccessfulSpawn();
      mockSuccessfulSpawn();

      await (service as any).restorePostgreSQL('/tmp/restore dir');

      expect(mockSpawn).toHaveBeenNthCalledWith(1, 'gunzip', [
        '/tmp/restore dir/erp_db_20260430_120000.sql.gz',
      ], {});
      expect(mockSpawn).toHaveBeenNthCalledWith(2, '/usr/bin/psql', [
        '-h', 'postgres',
        '-p', '5432',
        '-U', 'erp_user',
        '-d', 'postgres',
        '-c', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'erp_db' AND pid <> pg_backend_pid();",
      ], expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: '' }),
      }));
      expect(mockSpawn).toHaveBeenNthCalledWith(3, '/usr/bin/psql', [
        '-h', 'postgres',
        '-p', '5432',
        '-U', 'erp_user',
        '-d', 'erp_db',
        '-f', '/tmp/restore dir/erp_db_20260430_120000.sql',
      ], expect.objectContaining({
        env: expect.objectContaining({ PGPASSWORD: '' }),
      }));
    });

    it('rejects when a spawned command exits with a non-zero code', async () => {
      mockFailingSpawn('role "erp_user" does not exist', 1);

      await expect((service as any).backupPostgreSQL('/tmp', '20260430_120000'))
        .rejects.toThrow('Command failed with code 1');
    });

    it('rejects when a spawned command is killed by a signal', async () => {
      jest.spyOn(require('fs/promises'), 'mkdir').mockResolvedValue(undefined);
      mockSpawn.mockImplementationOnce(() => {
        const child = new EventEmitter() as any;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        process.nextTick(() => child.emit('close', null, 'SIGKILL'));
        return child;
      });

      await expect((service as any).extractArchive('/tmp/backup.tar.gz', '/tmp/restore'))
        .rejects.toThrow('Command killed by signal SIGKILL');
    });
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

      regionalSettingsRepo.findOne.mockResolvedValue({
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
      expect(data.regionalSettings.currency).toBe('MYR');
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
      regionalSettings: {
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

      regionalSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      regionalSettingsRepo.save.mockResolvedValue({});
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

      regionalSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      regionalSettingsRepo.save.mockResolvedValue({});
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
      regionalSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      regionalSettingsRepo.save.mockResolvedValue({});
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

    it('restores regional settings from old backup using priceCostingSettings key', async () => {
      const oldBackupJson = {
        companySettings: {},
        priceCostingSettings: {
          currency: 'USD', costingMethod: 'FIFO',
          dateFormat: 'MM/DD/YYYY', timeFormat: '12h', numberFormat: '1,234.56',
        },
        documentNumberSettings: { configurations: [] },
        printSettings: {},
        timestamp: '2025-01-01T00:00:00.000Z',
      };
      jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue(JSON.stringify(oldBackupJson));

      companySettingsRepo.findOne.mockResolvedValue({ id: 'uuid-1', isActive: true });
      companySettingsRepo.save.mockResolvedValue({});
      regionalSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      regionalSettingsRepo.save.mockResolvedValue({});
      documentNumberSettingRepo.findOne.mockResolvedValue(null);
      documentNumberSettingRepo.create.mockReturnValue({});
      documentNumberSettingRepo.save.mockResolvedValue({});
      printSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-4' });
      printSettingsRepo.save.mockResolvedValue({});

      await (service as any).restoreSettings('/tmp/restore');

      expect(regionalSettingsRepo.findOne).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(regionalSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'USD', costingMethod: 'FIFO' }),
      );
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

describe('BackupService - createArchive', () => {
  let service: BackupService;
  let tempSourceDir: string;
  let tempOutputPath: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key, def) => def ?? null) },
        },
        { provide: getRepositoryToken(BackupLog), useFactory: mockRepository },
        { provide: getRepositoryToken(BackupRetentionSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(CompanySettings), useFactory: mockRepository },
        { provide: getRepositoryToken(RegionalSettings), useFactory: mockRepository },
        { provide: getRepositoryToken(DocumentNumberSetting), useFactory: mockRepository },
        { provide: getRepositoryToken(PrintSettings), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);

    const uniqueSuffix = `archiver-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tempSourceDir = path.join(os.tmpdir(), uniqueSuffix, 'source');
    tempOutputPath = path.join(os.tmpdir(), uniqueSuffix, 'output.tar.gz');

    await require('fs/promises').mkdir(tempSourceDir, { recursive: true });
    await require('fs/promises').writeFile(
      path.join(tempSourceDir, 'test.txt'),
      'hello archiver v8',
    );
  });

  afterEach(async () => {
    const parentDir = path.dirname(tempSourceDir);
    await require('fs/promises').rm(parentDir, { recursive: true, force: true });
  });

  it('resolves to the output path and produces a non-empty .tar.gz file', async () => {
    const result = await (service as any).createArchive(tempSourceDir, tempOutputPath);

    expect(result).toBe(tempOutputPath);

    const stats = await require('fs/promises').stat(tempOutputPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  it('produces a valid tar.gz that contains the source file', async () => {
    await (service as any).createArchive(tempSourceDir, tempOutputPath);

    await new Promise<void>((resolve, reject) => {
      const gunzip = require('zlib').createGunzip();
      const extract = require('tar-stream').extract();
      const foundFiles: string[] = [];

      extract.on(
        'entry',
        (
          header: { name: string },
          stream: NodeJS.ReadableStream,
          next: () => void,
        ) => {
          foundFiles.push(header.name);
          stream.resume();
          stream.on('end', next);
        },
      );

      extract.on('finish', () => {
        expect(foundFiles).toContain('test.txt');
        resolve();
      });

      extract.on('error', reject);
      gunzip.on('error', reject);

      fsCb.createReadStream(tempOutputPath).pipe(gunzip).pipe(extract);
    });
  });
});
