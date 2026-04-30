# Path Injection Fix in Backup Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix path injection vulnerability in backup upload by sanitizing filenames and validating destination paths.

**Architecture:** 
1.  **Controller Layer**: Stricter regex for original filenames and system-generated unique temporary filenames.
2.  **Service Layer**: Normalize paths using `path.basename` and `path.resolve`, and verify the final path is within the allowed `archives/` directory.

**Tech Stack:** NestJS, Node.js (fs/path), TypeORM

---

### Task 1: BackupController - Filename Sanitization

**Files:**
- Modify: `backend/src/modules/backup/backup.controller.ts`

- [ ] **Step 1: Refine `backupUploadFileFilter`**
Update the filter to reject `..` and non-alphanumeric characters.

```typescript
export const backupUploadFileFilter = (
  _req: unknown,
  file: { originalname: string },
  cb: (error: Error | null, acceptFile: boolean) => void,
): void => {
  const safeFilenameRegex = /^[a-zA-Z0-9._-]+$/;
  // REJECT filenames with '..' or characters outside the safe set
  if (!safeFilenameRegex.test(file.originalname) || file.originalname.includes('..')) {
    return cb(
      new BadRequestException(
        'Invalid filename. Only alphanumeric characters, dots, underscores, and hyphens are allowed, and ".." is prohibited.',
      ),
      false,
    );
  }
  // ... existing check for .tar.gz or .tgz
};
```

- [ ] **Step 2: Update `diskStorage.filename`**
Generate a unique, system-controlled filename for the temporary upload.

```typescript
storage: diskStorage({
  destination: (_req, _file, cb) => {
    const uploadPath = '/app/backups/uploads';
    cb(null, uploadPath);
  },
  filename: (_req, file, cb) => {
    // Generate a safe unique name
    const timestamp = Date.now();
    const ext = file.originalname.endsWith('.tar.gz') ? '.tar.gz' : '.tgz';
    cb(null, `upload_${timestamp}${ext}`);
  },
}),
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/backup/backup.controller.ts
git commit -m "fix(backup): sanitize uploaded filenames in controller"
```

---

### Task 2: BackupService - Path Normalization and Validation

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Update `processUploadedBackup` path construction**
Use `path.basename` and `path.resolve` to ensure the destination is safe.

```typescript
async processUploadedBackup(file: Express.Multer.File): Promise<BackupLog> {
  this.logger.log(`Processing uploaded backup: ${file.originalname}`);

  const uploadPath = file.path;
  
  // SANITIZE: Use basename to strip any path components from user input
  const safeBasename = path.basename(file.originalname);
  const archivesDir = path.resolve(this.backupDir, 'archives');
  const archivePath = path.resolve(archivesDir, safeBasename);

  // VALIDATE: Ensure the final path is within the archives directory
  if (!archivePath.startsWith(archivesDir)) {
    throw new BadRequestException('Invalid backup path detected');
  }

  try {
    // Ensure archives directory exists
    await fs.mkdir(archivesDir, { recursive: true });

    // Move file from uploads to archives
    await fs.rename(uploadPath, archivePath);
    // ... rest of the method
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "fix(backup): normalize and validate backup destination paths"
```

---

### Task 3: Testing & Verification

**Files:**
- Modify: `backend/src/modules/backup/backup.controller.spec.ts`

- [ ] **Step 1: Add failing unit tests for malicious filenames**
Update `backup.controller.spec.ts` to test the new filter logic.

```typescript
describe('backupUploadFileFilter', () => {
  const cb = vi.fn();

  it('should reject filenames with path traversal (..)', () => {
    backupUploadFileFilter({}, { originalname: '../../../etc/passwd.tar.gz' }, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('should reject filenames with invalid characters', () => {
    backupUploadFileFilter({}, { originalname: 'backup; rm -rf /.tar.gz' }, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });
});
```

- [ ] **Step 2: Run backend tests**

Run: `cd backend && npm run test src/modules/backup/`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/backup/backup.controller.spec.ts
git commit -m "test(backup): verify path injection protection in unit tests"
```
