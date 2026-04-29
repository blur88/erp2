# Design: Fix Critical Command Injection in Backup Module

## 1. Overview
A critical security alert (ID 4) identified a command injection vulnerability in the `BackupModule`. The system currently uses `child_process.exec` to run shell commands (like `tar`, `pg_dump`, `psql`), and it concatenates user-provided filenames into command strings without sanitization.

### 1.1 Goal
Eliminate the command injection vulnerability while maintaining full backup/restore functionality.

### 1.2 Success Criteria
- [ ] No usage of shell-based `exec` for commands involving external input.
- [ ] All shell commands use `spawn` or `execFile` with argument arrays.
- [ ] Strict validation for uploaded backup filenames.
- [ ] Existing backup/restore flows continue to function correctly.

## 2. Architecture

### 2.1 Safe Execution Utility
We will implement a `spawnAsync` helper in `BackupService` to replace the current `execAsync` (which is based on `exec`).

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

    child.stdout.on('data', (data) => (stdout += data));
    child.stderr.on('data', (data) => (stderr += data));

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

### 2.2 Input Sanitization
In `BackupController`, the `uploadBackup` method will be updated to validate the `originalname` of the uploaded file.

**Pattern:** `/^[a-zA-Z0-9._-]+$/`
**Action:** Reject files that do not match this pattern with a `400 Bad Request`.

## 3. Implementation Plan

### 3.1 Update `BackupService`
- Import `spawn` from `child_process`.
- Implement `spawnAsync` helper.
- Refactor all `execAsync` calls:
  - `pg_dump`: `['pg_dump', ['-h', host, ...]]`
  - `gzip`: `['gzip', [filepath]]`
  - `tar`: `['tar', ['-xzf', archivePath, '-C', destDir]]`
  - `gunzip`: `['gunzip', [sqlPath]]`
  - `psql`: `['psql', ['-h', host, ...]]`

### 3.2 Update `BackupController`
- Add validation logic to the `uploadBackup` interceptor or method body.
- Ensure error messages are clear for the user.

## 4. Testing & Verification

### 4.1 Automated Tests
- **Unit Test:** `backup.service.spec.ts` will verify that `spawn` is called with the correct argument arrays.
- **Integration Test:** Attempt to upload a file with an unsafe name (e.g., `backup;rm.tar.gz`) and assert it fails with a 400 error.
- **Regression Test:** Verify that a standard backup (creation and restoration) still works.

### 4.2 Manual Verification
- Perform a manual backup.
- Perform a manual restore of the created backup.
- Attempt to upload a file with spaces or special characters to verify rejection.

## 5. Security Considerations
By moving to `spawn` with argument arrays, we bypass the shell entirely for argument parsing, which is the most effective way to prevent command injection in Node.js. Combined with filename sanitization, this provides robust defense-in-depth.
