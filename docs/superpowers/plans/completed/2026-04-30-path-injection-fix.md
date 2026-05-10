# Path Injection Fix in Backup Module Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development if explicitly authorized for this session; otherwise use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue 487 by preventing uploaded backup filenames from controlling temporary or archive filesystem paths.

**Architecture:** The controller validates the client-provided filename and stores the multipart upload under a generated temporary name. The service treats `file.originalname` as metadata only, generates the final archive filename, resolves the archive destination under `BACKUP_DIRECTORY/archives`, and rejects any destination that escapes that directory. Tests cover both the controller filter and the service archive/log behavior.

**Tech Stack:** NestJS, Multer, Node.js `path`, Node.js `crypto`, Jest, TypeORM repository mocks

---

## Chunk 1: Controller Upload Guardrails

### Task 1: Controller tests for filename validation

**Files:**
- Modify: `backend/src/modules/backup/backup.controller.spec.ts`

- [ ] **Step 1: Add or tighten failing tests for traversal segments**

Add focused tests under `describe('BackupController - upload fileFilter', ...)`:

```typescript
it('rejects filenames containing parent-directory traversal segments', () => {
  const cb = runFileFilter('safe..name.tar.gz');

  expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  expect(cb.mock.calls[0][0].message).toContain('".." is prohibited');
});

it('rejects nested traversal filenames even when the extension is valid', () => {
  const cb = runFileFilter('../../../malicious.tar.gz');

  expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
});
```

- [ ] **Step 2: Run the controller spec and verify RED**

Run: `cd backend && npm run test -- src/modules/backup/backup.controller.spec.ts`

Expected: FAIL because `safe..name.tar.gz` is currently accepted by `backupUploadFileFilter`.

### Task 2: Controller implementation

**Files:**
- Modify: `backend/src/modules/backup/backup.controller.ts`

- [ ] **Step 1: Import Node crypto**

Add:

```typescript
import * as crypto from 'crypto';
```

- [ ] **Step 2: Reject `..` in uploaded original names**

Update `backupUploadFileFilter`:

```typescript
const safeFilenameRegex = /^[a-zA-Z0-9._-]+$/;
if (!safeFilenameRegex.test(file.originalname) || file.originalname.includes('..')) {
  return cb(
    new BadRequestException(
      'Invalid filename. Only alphanumeric characters, dots, underscores, and hyphens are allowed, and ".." is prohibited.',
    ),
    false,
  );
}
```

- [ ] **Step 3: Generate temporary upload filenames**

Update `diskStorage.filename`:

```typescript
filename: (_req, file, cb) => {
  const ext = file.originalname.endsWith('.tar.gz') ? '.tar.gz' : '.tgz';
  cb(null, `upload_${Date.now()}_${crypto.randomUUID()}${ext}`);
},
```

- [ ] **Step 4: Run the controller spec and verify GREEN**

Run: `cd backend && npm run test -- src/modules/backup/backup.controller.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit controller changes**

```bash
git add backend/src/modules/backup/backup.controller.ts backend/src/modules/backup/backup.controller.spec.ts
git commit -m "fix(backup): generate safe upload filenames"
```

---

## Chunk 2: Service Archive Path Hardening

### Task 3: Service tests for generated archive paths

**Files:**
- Modify: `backend/src/modules/backup/backup.service.spec.ts`

- [ ] **Step 1: Capture the backup log repository mock**

In the top-level service spec setup, add a variable:

```typescript
let backupLogRepo: ReturnType<typeof mockRepository>;
```

Set it in `beforeEach`:

```typescript
backupLogRepo = module.get(getRepositoryToken(BackupLog));
```

- [ ] **Step 2: Add a failing service test for generated archive filenames**

Add a `describe('processUploadedBackup', ...)` block. Mock filesystem/archive helpers so the test only checks path construction and repository data:

```typescript
describe('processUploadedBackup', () => {
  beforeEach(() => {
    mockConfigService.get.mockImplementation((key: string, defaultVal?: any) => {
      if (key === 'BACKUP_DIRECTORY') {
        return '/app/backups';
      }
      return defaultVal ?? null;
    });
  });

  afterEach(() => {
    mockConfigService.get.mockImplementation((key: string, defaultVal?: any) => defaultVal ?? null);
  });

  it('stores uploaded backups under a generated archive filename and preserves the original name in metadata', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('uuid-123');
    jest.spyOn(require('fs/promises'), 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(require('fs/promises'), 'rename').mockResolvedValue(undefined);
    jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue(JSON.stringify({ description: 'Uploaded backup' }));
    jest.spyOn(require('fs/promises'), 'stat').mockResolvedValue({ size: 42 });
    jest.spyOn(require('fs/promises'), 'readdir').mockResolvedValue(['erp_db_20260430_120000.sql.gz']);
    jest.spyOn(require('fs/promises'), 'rm').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'extractArchive').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'calculateChecksum').mockResolvedValue('checksum-123');
    backupLogRepo.create.mockImplementation((input) => input);
    backupLogRepo.save.mockImplementation(async (input) => input);

    const result = await service.processUploadedBackup({
      originalname: 'customer_backup.tar.gz',
      path: '/app/backups/uploads/upload_1770000000000_uuid-123.tar.gz',
    } as Express.Multer.File);

    expect(require('fs/promises').rename).toHaveBeenCalledWith(
      '/app/backups/uploads/upload_1770000000000_uuid-123.tar.gz',
      '/app/backups/archives/uploaded_backup_1770000000000_uuid-123.tar.gz',
    );
    expect(result.filename).toBe('uploaded_backup_1770000000000_uuid-123.tar.gz');
    expect(result.filepath).toBe('/app/backups/archives/uploaded_backup_1770000000000_uuid-123.tar.gz');
    expect(result.metadata).toEqual(expect.objectContaining({
      originalFilename: 'customer_backup.tar.gz',
      checksum: 'checksum-123',
    }));
  });
});
```

- [ ] **Step 3: Run the service spec and verify RED**

Run: `cd backend && npm run test -- src/modules/backup/backup.service.spec.ts`

Expected: FAIL because `processUploadedBackup` currently archives to `file.originalname` and does not store `metadata.originalFilename`.

### Task 4: Service implementation

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Import `BadRequestException` and ensure crypto is available**

Update the Nest import:

```typescript
import { Injectable, Logger, NotFoundException, InternalServerErrorException, OnModuleDestroy, BadRequestException } from '@nestjs/common';
```

`backup.service.ts` already imports `* as crypto from 'crypto'`; reuse that import.

- [ ] **Step 2: Generate and validate the archive destination**

At the start of `processUploadedBackup`, replace the current `archivePath` construction with:

```typescript
const uploadPath = file.path;
const originalFilename = path.basename(file.originalname);
const archivesDir = path.resolve(this.backupDir, 'archives');
const ext = originalFilename.endsWith('.tar.gz') ? '.tar.gz' : '.tgz';
const archiveFilename = `uploaded_backup_${Date.now()}_${crypto.randomUUID()}${ext}`;
const archivePath = path.resolve(archivesDir, archiveFilename);

if (!archivePath.startsWith(`${archivesDir}${path.sep}`)) {
  throw new BadRequestException('Invalid backup path detected');
}
```

- [ ] **Step 3: Use `archivesDir` and generated archive names throughout upload processing**

Update the method body:

```typescript
await fs.mkdir(archivesDir, { recursive: true });
await fs.rename(uploadPath, archivePath);
```

Update the backup log creation:

```typescript
const backupLog = this.backupLogRepository.create({
  filename: archiveFilename,
  filepath: archivePath,
  backupType: 'manual',
  status: 'completed',
  databases,
  createdBy: 'uploaded',
  startedAt: new Date(),
  completedAt: new Date(),
  size: stats.size,
  metadata: {
    ...metadata,
    originalFilename,
    checksum,
    uploadedAt: new Date().toISOString(),
  },
});
```

Update success logging to reference `archiveFilename` or both names:

```typescript
this.logger.log(
  `Uploaded backup processed successfully: ${archiveFilename} from ${originalFilename} (${this.formatBytes(stats.size)})`,
);
```

- [ ] **Step 4: Run the service spec and verify GREEN**

Run: `cd backend && npm run test -- src/modules/backup/backup.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit service changes**

```bash
git add backend/src/modules/backup/backup.service.ts backend/src/modules/backup/backup.service.spec.ts
git commit -m "fix(backup): store uploaded archives under generated names"
```

---

## Chunk 3: Change-Scoped Verification

### Task 5: Backend verification

**Files:**
- Verify: `backend/src/modules/backup/backup.controller.ts`
- Verify: `backend/src/modules/backup/backup.service.ts`
- Verify: `backend/src/modules/backup/backup.controller.spec.ts`
- Verify: `backend/src/modules/backup/backup.service.spec.ts`

- [ ] **Step 1: Run targeted backup specs**

Run: `cd backend && npm run test -- src/modules/backup/backup.controller.spec.ts src/modules/backup/backup.service.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run required backend checks for `backend/src/**` changes**

Run: `cd backend && npm run lint && npm run test`

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run: `git diff --stat HEAD~2..HEAD`

Expected: only backup controller/service code and related specs changed.

- [ ] **Step 4: Prepare PR evidence**

Record these commands and results for the PR:

```text
cd backend && npm run test -- src/modules/backup/backup.controller.spec.ts
cd backend && npm run test -- src/modules/backup/backup.service.spec.ts
cd backend && npm run test -- src/modules/backup/backup.controller.spec.ts src/modules/backup/backup.service.spec.ts
cd backend && npm run lint && npm run test
```
