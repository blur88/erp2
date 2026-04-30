# Command Injection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate critical command injection vulnerabilities in the Backup Module by replacing shell-based `exec` with safe `spawn` argument arrays and implementing strict filename sanitization before any disk write.

**Architecture:**
1.  **Safe Utility:** Implement a `spawnAsync` helper in `BackupService` to handle command execution without a shell.
2.  **Service Refactoring:** Convert all eight existing `execAsync` calls in `BackupService` to use `spawnAsync` with explicit argument arrays.
3.  **Input Validation:** Add strict regex-based filename validation in `BackupController`'s `fileFilter` callback so invalid filenames are rejected before Multer writes anything to disk.

**Tech Stack:** NestJS, TypeScript, Node.js `child_process` (spawn), Jest.

---

### Task 1: Research and Setup

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`
- Extend: `backend/src/modules/backup/backup.service.spec.ts` (exists)
- Extend: `backend/src/modules/backup/backup.controller.spec.ts` (exists)

- [ ] **Step 1: Locate and confirm all `execAsync` call sites**
  There are eight calls across four methods:
  - `backupPostgreSQL` (~lines 216, 219): `pg_dump`, `gzip`
  - `getPostgreSQLVersion` (~line 346): `psql --version`
  - `getPostgreSQLTables` (~line 364): `psql` table query
  - `extractArchive` (~line 655): `tar -xzf`
  - `restorePostgreSQL` (~lines 673, 693, 700): `gunzip`, `psql` drop connections, `psql` restore

  Note: `createArchive` uses the `archiver` npm package (no shell exec) — leave it unchanged.

- [ ] **Step 2: Run existing tests as a baseline**
  Run: `cd backend && npx jest src/modules/backup/ --no-coverage`
  Expected: existing tests pass.

---

### Task 2: Implement `spawnAsync` in `BackupService`

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Replace `exec` import with `spawn`**
```typescript
import { spawn } from 'child_process';
```
Remove `import { exec } from 'child_process'` and `const execAsync = promisify(exec)` (and `promisify` import if unused elsewhere).

- [ ] **Step 2: Implement `spawnAsync` helper method**
```typescript
private async spawnAsync(
  command: string,
  args: string[],
  options: any = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => (stdout += data));
    child.stderr?.on('data', (data) => (stderr += data));

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
```

- [ ] **Step 3: Commit utility implementation**
```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "feat(backup): add safe spawnAsync utility to replace exec"
```

---

### Task 3: Refactor `backupPostgreSQL` (pg_dump & gzip)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Refactor `pg_dump` call in `backupPostgreSQL` (~line 216)**
Replace `execAsync(command, { env })` with (preserve `-F p --clean --if-exists` flags):
```typescript
await this.spawnAsync('pg_dump', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', database,
  '-F', 'p',
  '--clean',
  '--if-exists',
  '-f', filepath,
], { env });
```

- [ ] **Step 2: Refactor `gzip` call in `backupPostgreSQL` (~line 219)**
Replace `execAsync(\`gzip ${filepath}\`)` with:
```typescript
await this.spawnAsync('gzip', [filepath]);
```

- [ ] **Step 3: Refactor `psql --version` in `getPostgreSQLVersion` (~line 346)**
Replace `execAsync('psql --version')` with:
```typescript
const { stdout } = await this.spawnAsync('psql', ['--version']);
```

- [ ] **Step 4: Refactor `psql` table query in `getPostgreSQLTables` (~line 364)**
Replace `execAsync(command, { env })` with:
```typescript
const { stdout } = await this.spawnAsync('psql', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', database,
  '-t',
  '-c', "SELECT tablename FROM pg_tables WHERE schemaname='public'",
], { env });
```

- [ ] **Step 5: Commit refactor**
```bash
git commit -am "refactor(backup): use spawnAsync for backup creation and version checks"
```

---

### Task 4: Refactor `restorePostgreSQL` (gunzip & psql)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Refactor `gunzip` call (~line 673)**
Replace `execAsync(\`gunzip "${sqlPath}"\`)` with:
```typescript
await this.spawnAsync('gunzip', [sqlPath]);
```

- [ ] **Step 2: Refactor `psql` drop-connections call (~line 693)**
Replace `execAsync(dropConnectionsCmd, { env })` with:
```typescript
await this.spawnAsync('/usr/bin/psql', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', 'postgres',
  '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();`,
], { env });
```
(Note: `database` is config-sourced, not user input — no injection risk in the `-c` value.)

- [ ] **Step 3: Refactor `psql` restore call (~line 700)**
Replace `execAsync(restoreCommand, { env })` with:
```typescript
await this.spawnAsync('/usr/bin/psql', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', database,
  '-f', decompressedPath,
], { env });
```

- [ ] **Step 4: Commit refactor**
```bash
git commit -am "refactor(backup): use spawnAsync for database restoration"
```

---

### Task 5: Refactor `extractArchive` (tar)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Refactor `tar` call (~line 655)**
Replace `execAsync(command)` with:
```typescript
await this.spawnAsync('tar', ['-xzf', archivePath, '-C', destDir]);
```

- [ ] **Step 2: Verify no remaining `execAsync` usages**
Run: `grep -n "execAsync" backend/src/modules/backup/backup.service.ts`
Expected: no results.

- [ ] **Step 3: Commit refactor**
```bash
git commit -am "refactor(backup): use spawnAsync for tar extraction, remove execAsync"
```

---

### Task 6: Implement Filename Sanitization in `BackupController`

**Files:**
- Modify: `backend/src/modules/backup/backup.controller.ts`

The validation must go in the `fileFilter` callback so the file is rejected **before** Multer writes it to disk. The current `fileFilter` only checks the extension — extend it to also validate the filename characters.

- [ ] **Step 1: Add filename validation to the `fileFilter` callback**
Replace the existing `fileFilter`:
```typescript
fileFilter: (_req, file, cb) => {
  const safeFilenameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!safeFilenameRegex.test(file.originalname)) {
    return cb(new BadRequestException('Invalid filename. Only alphanumeric characters, dots, underscores, and hyphens are allowed.'), false);
  }
  if (file.originalname.endsWith('.tar.gz') || file.originalname.endsWith('.tgz')) {
    cb(null, true);
  } else {
    cb(new BadRequestException('Only .tar.gz or .tgz files are allowed'), false);
  }
},
```

- [ ] **Step 2: Import `BadRequestException`**
Add `BadRequestException` to the imports from `@nestjs/common`.

- [ ] **Step 3: Commit validation**
```bash
git commit -am "feat(backup): add strict filename validation in fileFilter before disk write"
```

---

### Task 7: Extend Tests

**Files:**
- Extend: `backend/src/modules/backup/backup.service.spec.ts`
- Extend: `backend/src/modules/backup/backup.controller.spec.ts`

- [ ] **Step 1: Add service tests for `spawnAsync` call signatures**
In `backup.service.spec.ts`, mock `child_process.spawn` and verify each refactored method calls it with the correct command and argument array (not a shell string). Key cases:
  - `backupPostgreSQL`: asserts `pg_dump` args include `-F`, `p`, `--clean`, `--if-exists`
  - `extractArchive`: asserts `tar` args are `['-xzf', archivePath, '-C', destDir]`

- [ ] **Step 2: Add controller tests for filename validation**
In `backup.controller.spec.ts`, test the `fileFilter` logic directly:
  - Assert files named `backup;rm.tar.gz` or `../../etc/passwd.tar.gz` are rejected.
  - Assert a valid file named `backup_20260430_120000.tar.gz` is accepted.

- [ ] **Step 3: Run full backup test suite**
Run: `cd backend && npx jest src/modules/backup/ --no-coverage`
Expected: all tests pass.

---

### Task 8: Final Verification

- [ ] **Step 1: Run full backend test suite**
Run: `cd backend && npm run test`
Expected: all tests pass.

- [ ] **Step 2: Manual verification (if environment available)**
1. Trigger a backup from UI/API — confirm it completes successfully.
2. Attempt to upload a file named `test;rm.tar.gz` — confirm 400 error is returned.
3. Upload a valid backup file and restore it — confirm restore completes successfully.
