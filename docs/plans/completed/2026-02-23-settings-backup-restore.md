# Settings Backup & Restore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the settings backup/restore so it exports real data from all 4 settings entities and can restore them independently.

**Architecture:** Inject 4 settings repositories directly into `BackupService`. `backupSettings()` queries each singleton row and writes a JSON snapshot. `restoreSettings()` reads the snapshot and upserts each row. `logoUrl` is excluded from both export and restore to avoid broken file references.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest

---

### Task 1: Add entities to BackupModule

**Files:**
- Modify: `backend/src/modules/backup/backup.module.ts`

**Step 1: Update the TypeOrmModule.forFeature import**

Replace the existing `TypeOrmModule.forFeature([...])` line with:

```typescript
import { CompanySettings } from '@database/entities/company-settings.entity';
import { PriceCostingSettings } from '@database/entities/price-costing-settings.entity';
import { DocumentNumberSettings } from '@database/entities/document-number-settings.entity';
import { PrintSettings } from '@database/entities/print-settings.entity';

// In @Module imports:
TypeOrmModule.forFeature([
  BackupLog,
  BackupSchedule,
  BackupRetentionSettings,
  CompanySettings,
  PriceCostingSettings,
  DocumentNumberSettings,
  PrintSettings,
]),
```

**Step 2: Verify it compiles**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no errors about missing providers or modules.

**Step 3: Commit**

```bash
git add backend/src/modules/backup/backup.module.ts
git commit -m "feat(backup): register settings entities in BackupModule"
```

---

### Task 2: Inject repositories into BackupService constructor

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

**Step 1: Add imports at top of file**

After the existing imports, add:

```typescript
import { CompanySettings } from '@database/entities/company-settings.entity';
import { PriceCostingSettings } from '@database/entities/price-costing-settings.entity';
import { DocumentNumberSettings } from '@database/entities/document-number-settings.entity';
import { PrintSettings } from '@database/entities/print-settings.entity';
```

**Step 2: Add 4 repository parameters to the constructor**

After the existing `backupSettingsRepository` parameter, add:

```typescript
@InjectRepository(CompanySettings)
private readonly companySettingsRepository: Repository<CompanySettings>,

@InjectRepository(PriceCostingSettings)
private readonly priceCostingSettingsRepository: Repository<PriceCostingSettings>,

@InjectRepository(DocumentNumberSettings)
private readonly documentNumberSettingsRepository: Repository<DocumentNumberSettings>,

@InjectRepository(PrintSettings)
private readonly printSettingsRepository: Repository<PrintSettings>,
```

**Step 3: Verify it compiles**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no errors.

**Step 4: Commit**

```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "feat(backup): inject settings repositories into BackupService"
```

---

### Task 3: Write failing tests for getCompanySettings and getPrintSettings

**Files:**
- Create: `backend/src/modules/backup/backup.service.spec.ts`

**Step 1: Create the test file with stubs for all dependencies**

```typescript
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

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
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
  }));
});

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
      expect(result.logoUrl).toBeUndefined(); // logoUrl must be excluded
    });

    it('returns empty object when no print settings exist', async () => {
      printSettingsRepo.findOne.mockResolvedValue(null);

      const result = await (service as any).getPrintSettings();

      expect(result).toEqual({});
    });
  });
});
```

**Step 2: Run the tests to verify they fail**

```bash
cd backend && npx jest backup.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `getCompanySettings` returns `{}` regardless (stub), `logoUrl` exclusion test fails.

**Step 3: Commit the failing tests**

```bash
git add backend/src/modules/backup/backup.service.spec.ts
git commit -m "test(backup): add failing tests for settings export methods"
```

---

### Task 4: Implement getCompanySettings and getPrintSettings

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

**Step 1: Replace getCompanySettings stub (around line 419)**

Find and replace the entire `getCompanySettings` method:

```typescript
private async getCompanySettings(): Promise<any> {
  const settings = await this.companySettingsRepository.findOne({
    where: { isActive: true },
  });

  if (!settings) {
    return {};
  }

  return {
    name: settings.name,
    address: settings.address,
    city: settings.city,
    state: settings.state,
    postalCode: settings.postalCode,
    country: settings.country,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    miscInfo: settings.miscInfo,
    // logoUrl intentionally excluded — file not backed up
  };
}
```

**Step 2: Replace getPrintSettings stub (around line 425)**

Find and replace the entire `getPrintSettings` method:

```typescript
private async getPrintSettings(): Promise<any> {
  const settings = await this.printSettingsRepository.findOne({
    where: {},
    order: { createdAt: 'ASC' },
  });

  if (!settings) {
    return {};
  }

  return {
    companyName: settings.companyName,
    address: settings.address,
    city: settings.city,
    state: settings.state,
    postalCode: settings.postalCode,
    country: settings.country,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    miscInfo: settings.miscInfo,
    salesPerPageFooter: settings.salesPerPageFooter,
    salesEndOfDocFooter: settings.salesEndOfDocFooter,
    purchasingPerPageFooter: settings.purchasingPerPageFooter,
    purchasingEndOfDocFooter: settings.purchasingEndOfDocFooter,
    inventoryPerPageFooter: settings.inventoryPerPageFooter,
    inventoryEndOfDocFooter: settings.inventoryEndOfDocFooter,
    reportPerPageFooter: settings.reportPerPageFooter,
    reportEndOfDocFooter: settings.reportEndOfDocFooter,
    salesOrderTemplate: settings.salesOrderTemplate,
    invoiceTemplate: settings.invoiceTemplate,
    paymentReceiptTemplate: settings.paymentReceiptTemplate,
    purchaseOrderTemplate: settings.purchaseOrderTemplate,
    grnTemplate: settings.grnTemplate,
    vendorPaymentTemplate: settings.vendorPaymentTemplate,
    // logoUrl intentionally excluded — file not backed up
  };
}
```

**Step 3: Run the tests to verify they pass**

```bash
cd backend && npx jest backup.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS.

**Step 4: Commit**

```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "feat(backup): implement real getCompanySettings and getPrintSettings"
```

---

### Task 5: Write failing tests for backupSettings (includes priceCostingSettings and documentNumberSettings)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.spec.ts`

**Step 1: Add tests for full backupSettings JSON output**

Add this describe block to the existing test file:

```typescript
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

    documentNumberSettingsRepo.findOne.mockResolvedValue({
      configurations: [{ documentName: 'Sales Orders', prefix: 'SO', numberFormat: '000001', nextNumber: 42 }],
      isActive: true,
    });

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
```

**Step 2: Run to verify it fails**

```bash
cd backend && npx jest backup.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `backupSettings` does not yet query `priceCostingSettings` or `documentNumberSettings`.

**Step 3: Commit**

```bash
git add backend/src/modules/backup/backup.service.spec.ts
git commit -m "test(backup): add failing test for full backupSettings output"
```

---

### Task 6: Fix backupSettings to include priceCostingSettings and documentNumberSettings

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

**Step 1: Find the backupSettings method (around line 301) and replace it**

```typescript
private async backupSettings(
  tempDir: string,
  timestamp: string,
): Promise<string> {
  const filename = `settings_${timestamp}.json`;
  const filepath = path.join(tempDir, filename);

  const [companySettings, priceCostingSettings, documentNumberSettings, printSettings] =
    await Promise.all([
      this.getCompanySettings(),
      this.getPriceCostingSettings(),
      this.getDocumentNumberSettings(),
      this.getPrintSettings(),
    ]);

  const settings = {
    companySettings,
    priceCostingSettings,
    documentNumberSettings,
    printSettings,
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(filepath, JSON.stringify(settings, null, 2));

  return filename;
}
```

**Step 2: Add private methods getPriceCostingSettings and getDocumentNumberSettings after getPrintSettings**

```typescript
private async getPriceCostingSettings(): Promise<any> {
  const settings = await this.priceCostingSettingsRepository.findOne({
    where: { isActive: true },
  });

  if (!settings) {
    return {};
  }

  return {
    currency: settings.currency,
    costingMethod: settings.costingMethod,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    numberFormat: settings.numberFormat,
  };
}

private async getDocumentNumberSettings(): Promise<any> {
  const settings = await this.documentNumberSettingsRepository.findOne({
    where: { isActive: true },
  });

  if (!settings) {
    return {};
  }

  return {
    configurations: settings.configurations,
  };
}
```

**Step 3: Run the tests**

```bash
cd backend && npx jest backup.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS.

**Step 4: Commit**

```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "feat(backup): export all 4 settings types in backupSettings"
```

---

### Task 7: Write failing tests for restoreSettings

**Files:**
- Modify: `backend/src/modules/backup/backup.service.spec.ts`

**Step 1: Add restoreSettings tests**

Add this describe block to the existing test file:

```typescript
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
        { documentName: 'Sales Orders', prefix: 'SO', numberFormat: '000001', nextNumber: 100 },
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
    documentNumberSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-3', isActive: true });
    documentNumberSettingsRepo.save.mockResolvedValue({});
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
    documentNumberSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-3', isActive: true });
    documentNumberSettingsRepo.save.mockResolvedValue({});
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
    documentNumberSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-3', isActive: true });
    documentNumberSettingsRepo.save.mockResolvedValue({});
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
```

**Step 2: Run to verify tests fail**

```bash
cd backend && npx jest backup.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `restoreSettings` is still a no-op.

**Step 3: Commit**

```bash
git add backend/src/modules/backup/backup.service.spec.ts
git commit -m "test(backup): add failing tests for restoreSettings"
```

---

### Task 8: Implement restoreSettings

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

**Step 1: Find the restoreSettings method (around line 774) and replace it entirely**

```typescript
private async restoreSettings(restoreDir: string): Promise<void> {
  const files = await fs.readdir(restoreDir);
  const settingsFile = files.find((f) => f.startsWith('settings_') && f.endsWith('.json'));

  if (!settingsFile) {
    this.logger.warn('No settings file found, skipping settings restore');
    return;
  }

  const settingsPath = path.join(restoreDir, settingsFile);
  const settingsContent = await fs.readFile(settingsPath, 'utf-8');
  const settings = JSON.parse(settingsContent);

  // Restore each settings type independently — failures are non-fatal
  await this.restoreCompanySettings(settings.companySettings);
  await this.restorePriceCostingSettings(settings.priceCostingSettings);
  await this.restoreDocumentNumberSettings(settings.documentNumberSettings);
  await this.restorePrintSettingsData(settings.printSettings);

  this.logger.log('Settings restore completed');
}

private async restoreCompanySettings(data: any): Promise<void> {
  if (!data || Object.keys(data).length === 0) return;

  try {
    const { logoUrl: _logo, ...safeData } = data; // exclude logoUrl
    let existing = await this.companySettingsRepository.findOne({ where: { isActive: true } });

    if (existing) {
      Object.assign(existing, safeData);
      await this.companySettingsRepository.save(existing);
    } else {
      const created = this.companySettingsRepository.create({ ...safeData, isActive: true });
      await this.companySettingsRepository.save(created);
    }

    this.logger.log('Company settings restored');
  } catch (error) {
    this.logger.warn(`Failed to restore company settings: ${error.message}`);
  }
}

private async restorePriceCostingSettings(data: any): Promise<void> {
  if (!data || Object.keys(data).length === 0) return;

  try {
    let existing = await this.priceCostingSettingsRepository.findOne({ where: { isActive: true } });

    if (existing) {
      Object.assign(existing, data);
      await this.priceCostingSettingsRepository.save(existing);
    } else {
      const created = this.priceCostingSettingsRepository.create({ ...data, isActive: true });
      await this.priceCostingSettingsRepository.save(created);
    }

    this.logger.log('Price costing settings restored');
  } catch (error) {
    this.logger.warn(`Failed to restore price costing settings: ${error.message}`);
  }
}

private async restoreDocumentNumberSettings(data: any): Promise<void> {
  if (!data || Object.keys(data).length === 0) return;

  try {
    let existing = await this.documentNumberSettingsRepository.findOne({ where: { isActive: true } });

    if (existing) {
      existing.configurations = data.configurations;
      await this.documentNumberSettingsRepository.save(existing);
    } else {
      const created = this.documentNumberSettingsRepository.create({
        configurations: data.configurations,
        isActive: true,
      });
      await this.documentNumberSettingsRepository.save(created);
    }

    this.logger.log('Document number settings restored');
  } catch (error) {
    this.logger.warn(`Failed to restore document number settings: ${error.message}`);
  }
}

private async restorePrintSettingsData(data: any): Promise<void> {
  if (!data || Object.keys(data).length === 0) return;

  try {
    const { logoUrl: _logo, ...safeData } = data; // exclude logoUrl
    let existing = await this.printSettingsRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (existing) {
      Object.assign(existing, safeData);
      await this.printSettingsRepository.save(existing);
    } else {
      const created = this.printSettingsRepository.create(safeData);
      await this.printSettingsRepository.save(created);
    }

    this.logger.log('Print settings restored');
  } catch (error) {
    this.logger.warn(`Failed to restore print settings: ${error.message}`);
  }
}
```

**Step 2: Run all tests**

```bash
cd backend && npx jest backup.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS.

**Step 3: Run full backend test suite to check for regressions**

```bash
cd backend && npm run test --no-coverage 2>&1 | tail -30
```

Expected: previously passing tests still pass.

**Step 4: Commit**

```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "feat(backup): implement real restoreSettings with upsert for all 4 settings types"
```

---

### Task 9: Build verification

**Step 1: Full TypeScript build**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

**Step 2: Run full test suite with coverage**

```bash
cd backend && npm run test:cov 2>&1 | grep -A5 "backup"
```

Expected: backup.service.ts coverage improved; all tests pass.

**Step 3: Final commit if any loose ends**

If everything is clean, no additional commit needed. Otherwise:

```bash
git add -p
git commit -m "chore(backup): cleanup after settings backup/restore implementation"
```
