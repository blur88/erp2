# Command Injection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate critical command injection vulnerabilities in the Backup Module by replacing shell-based `exec` with safe `spawn` argument arrays and implementing strict filename sanitization.

**Architecture:**
1.  **Safe Utility:** Implement a `spawnAsync` helper in `BackupService` to handle command execution without a shell.
2.  **Service Refactoring:** Convert all existing `execAsync` calls in `BackupService` to use `spawnAsync` with explicit argument arrays.
3.  **Input Validation:** Add a strict regex-based filename validation in `BackupController` for all uploaded backups.

**Tech Stack:** NestJS, TypeScript, Node.js `child_process` (spawn), Jest.

---

### Task 1: Research and Setup

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`
- Test: `backend/test/unit/backup.service.spec.ts` (Check if exists)

- [ ] **Step 1: Locate and analyze all `execAsync` calls**
- [ ] **Step 2: Verify existing unit tests for BackupService**
    Run: `cd backend && npm run test -- src/modules/backup/backup.service.spec.ts`

### Task 2: Implement `spawnAsync` in `BackupService`

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Import `spawn` from `child_process`**
```typescript
import { exec, spawn } from 'child_process';
```

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
git commit -m "feat(backup): add safe spawnAsync utility"
```

### Task 3: Refactor `createBackup` (pg_dump & gzip)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Refactor `pg_dump` call in `createBackup`**
Find `execAsync(command, { env })` around line 216 and replace with:
```typescript
await this.spawnAsync('pg_dump', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', database,
  '-f', filepath,
], { env });
```

- [ ] **Step 2: Refactor `gzip` call in `createBackup`**
Find `execAsync(`gzip ${filepath}`)` around line 219 and replace with:
```typescript
await this.spawnAsync('gzip', [filepath]);
```

- [ ] **Step 3: Refactor `psql --version` check in `onModuleInit` (or similar)**
Replace `execAsync('psql --version')` with:
```typescript
await this.spawnAsync('psql', ['--version']);
```

- [ ] **Step 4: Commit refactor**
```bash
git commit -am "refactor(backup): use spawnAsync for backup creation"
```

### Task 4: Refactor `restorePostgreSQL` (gunzip & psql)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Refactor `gunzip` call**
Replace `execAsync(`gunzip "${sqlPath}"`)` around line 673 with:
```typescript
await this.spawnAsync('gunzip', [sqlPath]);
```

- [ ] **Step 2: Refactor `psql` drop connections call**
Replace `execAsync(dropConnectionsCmd, { env })` around line 693 with:
```typescript
await this.spawnAsync('/usr/bin/psql', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', 'postgres',
  '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid();`
], { env });
```

- [ ] **Step 3: Refactor `psql` restore call**
Replace `execAsync(restoreCommand, { env })` around line 700 with:
```typescript
await this.spawnAsync('/usr/bin/psql', [
  '-h', host,
  '-p', port,
  '-U', username,
  '-d', database,
  '-f', decompressedPath
], { env });
```

- [ ] **Step 4: Commit refactor**
```bash
git commit -am "refactor(backup): use spawnAsync for database restoration"
```

### Task 5: Refactor `extractArchive` (tar)

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Refactor `tar` call**
Replace `execAsync(command)` around line 655 with:
```typescript
await this.spawnAsync('tar', ['-xzf', archivePath, '-C', destDir]);
```

- [ ] **Step 2: Clean up `execAsync` definition**
Remove `const execAsync = promisify(exec);` and the `exec` import if no longer used.

- [ ] **Step 3: Commit refactor**
```bash
git commit -am "refactor(backup): remove vulnerable execAsync and use spawnAsync for tar"
```

### Task 6: Implement Filename Sanitization in `BackupController`

**Files:**
- Modify: `backend/src/modules/backup/backup.controller.ts`

- [ ] **Step 1: Add filename validation logic to `uploadBackup`**
```typescript
  async uploadBackup(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<BackupLog> {
    if (!file) {
      throw new Error('No file uploaded');
    }

    // Validate filename against command injection and path traversal
    const safeFilenameRegex = /^[a-zA-Z0-9._-]+$/;
    if (!safeFilenameRegex.test(file.originalname)) {
      throw new BadRequestException('Invalid filename. Only alphanumeric characters, dots, underscores, and hyphens are allowed.');
    }

    return this.backupService.processUploadedBackup(file);
  }
```

- [ ] **Step 2: Commit validation**
```bash
git commit -am "feat(backup): add strict filename validation for uploads"
```

### Task 7: Verification

- [ ] **Step 1: Run unit tests**
Run: `cd backend && npm run test`
Expected: All tests pass.

- [ ] **Step 2: Manual verification (if possible in environment)**
1. Trigger a backup from UI/API.
2. Attempt to upload a file named `test;rm.tar.gz`.
3. Verify it returns a 400 error.
4. Upload a valid backup and restore it.
