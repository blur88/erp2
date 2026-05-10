# Issue #546: Dependency Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump `@mui/x-date-pickers` to 9.1.0 (frontend) and `archiver` to 8.0.0 (backend), with a smoke test proving archiver's core API still works after the major version jump.

**Architecture:** Version bumps in the two `package.json` files, lockfile updates via `npm install`, one new `describe('createArchive')` block added to the existing backend spec. No new files created; no production code changed.

**Tech Stack:** NestJS 11 (backend), React 19 / MUI v7 (frontend), Jest (backend tests), Node.js `fs`, `os`, `child_process` (test helpers).

---

## Files

| Action | File |
|---|---|
| Modify | `frontend/package.json` |
| Modify | `frontend/package-lock.json` (via `npm install`) |
| Modify | `backend/package.json` |
| Modify | `backend/package-lock.json` (via `npm install`) |
| Modify | `backend/src/modules/backup/backup.service.spec.ts` |

---

### Task 1: Bump `@mui/x-date-pickers` in frontend

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Update the version in `frontend/package.json`**

Open `frontend/package.json`. Find the line:
```json
"@mui/x-date-pickers": "9.0.4",
```
Change it to:
```json
"@mui/x-date-pickers": "9.1.0",
```

- [ ] **Step 2: Install and update the lockfile**

```bash
cd frontend && npm install
```

Expected: No errors. `package-lock.json` updated with the new resolved version for `@mui/x-date-pickers`.

- [ ] **Step 3: Verify no type errors introduced**

```bash
cd frontend && npm run type-check
```

Expected: Exits with code 0, no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: bump @mui/x-date-pickers from 9.0.4 to 9.1.0"
```

---

### Task 2: Bump `archiver` in backend

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Update the version in `backend/package.json`**

Open `backend/package.json`. Find the line:
```json
"archiver": "^7.0.1",
```
Change it to:
```json
"archiver": "8.0.0",
```

Leave `@types/archiver` unchanged at `"^7.0.0"` — no v8 types have been published yet, and v7 types are compatible.

- [ ] **Step 2: Install and update the lockfile**

```bash
cd backend && npm install
```

Expected: No errors. `package-lock.json` updated with archiver 8.0.0 and its new transitive deps (`is-stream` v4, `lazystream`, `normalize-path`, `zip-stream` v7, `readdir-glob` v3).

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: bump archiver from ^7.0.1 to 8.0.0"
```

---

### Task 3: Add `createArchive` smoke test

**Files:**
- Modify: `backend/src/modules/backup/backup.service.spec.ts`

This test exercises the real `archiver` library (no mock) against a real temp directory to prove the v8 API is intact.

- [ ] **Step 1: Write the failing tests**

In `backend/src/modules/backup/backup.service.spec.ts`, add a new `describe` block **after** the closing `});` of the existing `describe('BackupService - settings backup', ...)` block (i.e., after line 556):

```typescript
import * as os from 'os';
import * as fsCb from 'fs';
```

Add these two imports at the top of the file, after the existing imports. Then add the new describe block at the bottom of the file (before the final end of file):

```typescript
describe('BackupService - createArchive', () => {
  let service: BackupService;
  let tempSourceDir: string;
  let tempOutputPath: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: ConfigService, useValue: { get: jest.fn((key, def) => def ?? null) } },
        { provide: getRepositoryToken(BackupLog), useFactory: () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), update: jest.fn() }) },
        { provide: getRepositoryToken(BackupRetentionSettings), useFactory: () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), update: jest.fn() }) },
        { provide: getRepositoryToken(CompanySettings), useFactory: () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), update: jest.fn() }) },
        { provide: getRepositoryToken(RegionalSettings), useFactory: () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), update: jest.fn() }) },
        { provide: getRepositoryToken(DocumentNumberSetting), useFactory: () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), update: jest.fn() }) },
        { provide: getRepositoryToken(PrintSettings), useFactory: () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn(), update: jest.fn() }) },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);

    const uniqueSuffix = `archiver-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tempSourceDir = path.join(os.tmpdir(), uniqueSuffix, 'source');
    tempOutputPath = path.join(os.tmpdir(), uniqueSuffix, 'output.tar.gz');

    await require('fs/promises').mkdir(tempSourceDir, { recursive: true });
    await require('fs/promises').writeFile(path.join(tempSourceDir, 'test.txt'), 'hello archiver v8');
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

      extract.on('entry', (header: { name: string }, stream: NodeJS.ReadableStream, next: () => void) => {
        foundFiles.push(header.name);
        stream.resume();
        stream.on('end', next);
      });

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
```

- [ ] **Step 2: Run the tests to verify they fail (before the bump)**

Skip this step if archiver 8.0.0 is already installed from Task 2. If Task 2 is not yet done, run:

```bash
cd backend && npx jest src/modules/backup/backup.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected if archiver v7 is still installed: tests pass (v7 API is the same — this confirms the test itself is valid). Expected if archiver v8 is already installed: tests should also pass (that's the point of the smoke test).

- [ ] **Step 3: Run the full backup spec to confirm all tests pass**

```bash
cd backend && npx jest src/modules/backup/backup.service.spec.ts --no-coverage
```

Expected output:
```
PASS src/modules/backup/backup.service.spec.ts
  BackupService - settings backup
    ✓ ...
    ...
  BackupService - createArchive
    ✓ resolves to the output path and produces a non-empty .tar.gz file
    ✓ produces a valid tar.gz that contains the source file

Test Suites: 1 passed, 1 total
Tests:       N passed, N total
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/backup/backup.service.spec.ts
git commit -m "test(backup): add createArchive smoke test for archiver v8 compatibility"
```

---

### Task 4: Close the issue via PR

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push origin main
```

Then open a PR (or if working on a feature branch, push that branch and open a PR targeting `main`) with body:

```
Closes #546

## Changes
- `@mui/x-date-pickers` bumped from 9.0.4 → 9.1.0 (frontend)
- `archiver` bumped from ^7.0.1 → 8.0.0 (backend)
- `@types/archiver` left at ^7.0.0 (no v8 types published yet; v7 types are API-compatible)
- Added `createArchive` smoke test in `backup.service.spec.ts` to verify archiver v8 stream/tar.gz behaviour

## Test plan
- [ ] `cd backend && npx jest src/modules/backup/backup.service.spec.ts --no-coverage` — all pass
- [ ] `cd frontend && npm run type-check` — no new errors
```
