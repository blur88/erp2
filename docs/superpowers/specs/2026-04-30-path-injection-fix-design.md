# Design Spec: Path Injection Fix in Backup Upload

## Problem Statement
The backup upload functionality in `BackupController` and `BackupService` is vulnerable to path injection (CWE-22, CWE-23). The system uses the user-provided `file.originalname` to construct file paths for temporary storage and final archiving. A malicious user could provide a filename like `../../../etc/passwd` to attempt to read or overwrite sensitive files outside the intended backup directory.

## Proposed Changes

### 1. Controller Layer: Filename Sanitization (`BackupController`)
We will sanitize the filename at the entry point to ensure it contains only safe characters and cannot be used for path traversal.

-   **Update `backupUploadFileFilter`:** Refine the `safeFilenameRegex` to strictly exclude `..` and ensure the name is relatively simple.
-   **Safe Storage Filename:** Instead of using `file.originalname` as the disk filename in `uploads/`, we will generate a system-controlled unique filename (e.g., `upload_${Date.now()}.tar.gz`). This prevents any direct path manipulation on the filesystem before processing.

### 2. Service Layer: Path Normalization and Validation (`BackupService`)
We will ensure that the final destination path is always within the authorized `archives/` directory.

-   **Use `path.basename()`:** When constructing the final archive name from `file.originalname`, wrap it in `path.basename()` to strip any directory traversal segments.
-   **Path Resolution:** Use `path.resolve()` to create an absolute path for the destination.
-   **Boundary Check:** Before moving the file, verify that the resolved path starts with the absolute path of the `archives/` directory.

## Technical Details

### `backend/src/modules/backup/backup.controller.ts`

```typescript
// Refined filter logic
const safeFilenameRegex = /^[a-zA-Z0-9._-]+$/;
if (!safeFilenameRegex.test(file.originalname) || file.originalname.includes('..')) {
    // Reject
}

// diskStorage update
filename: (_req, file, cb) => {
    const ext = file.originalname.endsWith('.tar.gz') ? '.tar.gz' : '.tgz';
    cb(null, `upload_${Date.now()}${ext}`);
}
```

### `backend/src/modules/backup/backup.service.ts`

```typescript
// Inside processUploadedBackup
const safeBasename = path.basename(file.originalname);
const archivesDir = path.resolve(this.backupDir, 'archives');
const archivePath = path.resolve(archivesDir, safeBasename);

// Security boundary check
if (!archivePath.startsWith(archivesDir)) {
    throw new BadRequestException('Invalid backup path detected');
}
```

## Verification Plan

### Automated Tests
-   **Unit Tests:** Update `backup.controller.spec.ts` to include malicious filenames (e.g., `../../../malicious.tar.gz`, `safe..name.tar.gz`) and verify they are rejected by the filter.
-   **Integration Tests:** Verify that a valid backup upload still works as expected and is stored in the correct directory.

### Manual Verification
1.  Attempt to upload a file with `..` in the name via the UI/API.
2.  Verify the server returns a `400 Bad Request`.
3.  Upload a valid backup and confirm it is correctly logged in the database and moved to the `archives/` folder.
