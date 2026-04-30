# Design Spec: Path Injection Fix in Backup Upload

## Problem Statement
The backup upload functionality in `BackupController` and `BackupService` is vulnerable to path injection (CWE-22, CWE-23). The system uses the user-provided `file.originalname` to construct file paths for temporary storage and final archiving. A malicious user could provide a filename like `../../../etc/passwd` to attempt to read or overwrite sensitive files outside the intended backup directory.

## Proposed Changes

### 1. Controller Layer: Filename Sanitization (`BackupController`)
We will validate the filename at the entry point, but the filesystem will not trust it. The uploaded name is only accepted as display metadata after validation; temporary storage uses a generated name.

-   **Update `backupUploadFileFilter`:** Refine the `safeFilenameRegex` to strictly exclude `..` and ensure the name is relatively simple.
-   **Safe Temporary Filename:** Instead of using `file.originalname` as the disk filename in `uploads/`, generate a system-controlled unique filename (for example, `upload_${Date.now()}_${random}.tar.gz`). This prevents direct path manipulation before service processing and avoids collisions.

### 2. Service Layer: Path Normalization and Validation (`BackupService`)
We will ensure that the final destination path is always within the authorized `archives/` directory and does not depend on user input.

-   **Treat `file.originalname` as metadata:** Preserve the uploaded name only for display/audit metadata after validation. Do not use it to construct filesystem paths.
-   **Generated Archive Filename:** Create a system-generated final archive filename (for example, `uploaded_backup_${timestamp}_${random}.tar.gz`) based on the accepted extension.
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
    cb(null, `upload_${Date.now()}_${crypto.randomUUID()}${ext}`);
}
```

### `backend/src/modules/backup/backup.service.ts`

```typescript
// Inside processUploadedBackup
const originalFilename = path.basename(file.originalname);
const archivesDir = path.resolve(this.backupDir, 'archives');
const ext = originalFilename.endsWith('.tar.gz') ? '.tar.gz' : '.tgz';
const archiveFilename = `uploaded_backup_${Date.now()}_${crypto.randomUUID()}${ext}`;
const archivePath = path.resolve(archivesDir, archiveFilename);

// Security boundary check
if (!archivePath.startsWith(`${archivesDir}${path.sep}`)) {
    throw new BadRequestException('Invalid backup path detected');
}

// Store archiveFilename/filepath in the BackupLog. Store originalFilename only
// in metadata, for display and audit context.
```

## Verification Plan

### Automated Tests
-   **Unit Tests:** Update `backup.controller.spec.ts` to include malicious filenames (e.g., `../../../malicious.tar.gz`, `safe..name.tar.gz`) and verify they are rejected by the filter.
-   **Service Tests:** Verify `processUploadedBackup` stores valid uploads under a generated archive filename, records the original filename only in metadata, and rejects or avoids malicious path input.
-   **Integration Tests:** Verify that a valid backup upload still works as expected and is stored in the correct directory.

### Manual Verification
1.  Attempt to upload a file with `..` in the name via the UI/API.
2.  Verify the server returns a `400 Bad Request`.
3.  Upload a valid backup and confirm it is correctly logged in the database, moved to the `archives/` folder under a generated name, and retains the original filename only as metadata.
