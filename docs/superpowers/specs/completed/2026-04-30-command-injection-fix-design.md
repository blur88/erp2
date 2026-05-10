# Design: Fix Critical Command Injection in Backup Module

## 1. Overview
A critical security alert (ID 4) identified a command injection vulnerability in the `BackupModule`. The system currently uses `child_process.exec` to run shell commands (like `tar`, `pg_dump`, `psql`), and it concatenates user-provided filenames into command strings without sanitization.

### 1.1 Goal
Eliminate the command injection vulnerability while maintaining full backup/restore functionality.

### 1.2 Success Criteria
- [ ] No usage of shell-based `exec` for commands involving external input.
- [ ] All shell commands use `spawn` or `execFile` with argument arrays.
- [ ] Strict validation for uploaded backup filenames applied before any disk write.
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

### 2.2 Input Sanitization
The filename validation must occur **before** Multer writes the file to disk. The `diskStorage` `filename` callback runs before the controller method body, so validation must be placed there. If the filename is invalid, we sanitize it to a safe name derived from a timestamp — or reject it outright in `fileFilter`.

**Recommended approach:** Validate in `fileFilter` (rejects before any disk write):

**Pattern:** `/^[a-zA-Z0-9._-]+$/`
**Action:** Reject files whose `originalname` does not match this pattern with a `400 Bad Request` (by passing an `Error` to the `fileFilter` callback).

This ensures a malicious filename never touches the filesystem.

### 2.3 Call Sites to Refactor

`backup.service.ts` contains six `execAsync` calls that must be converted to `spawnAsync`:

| Method | Line | Command |
|---|---|---|
| `backupPostgreSQL` | ~216 | `pg_dump` with `-F p --clean --if-exists` flags |
| `backupPostgreSQL` | ~219 | `gzip` |
| `getPostgreSQLVersion` | ~346 | `psql --version` |
| `getPostgreSQLTables` | ~364 | `psql` query (config-sourced args, still shell-based) |
| `extractArchive` | ~655 | `tar -xzf` |
| `restorePostgreSQL` | ~673 | `gunzip` |
| `restorePostgreSQL` | ~693 | `psql` drop connections |
| `restorePostgreSQL` | ~700 | `psql` restore |

Note: `createArchive` uses the `archiver` npm package (pure Node.js, no shell exec) and does **not** need changes.

## 3. Implementation Notes

### 3.1 pg_dump flags must be preserved
The current `pg_dump` command includes `-F p --clean --if-exists`. These must be carried over to the `spawnAsync` call or the restore behaviour will change:

```typescript
await this.spawnAsync('pg_dump', [
  '-h', host, '-p', port, '-U', username,
  '-d', database, '-F', 'p', '--clean', '--if-exists',
  '-f', filepath,
], { env });
```

### 3.2 psql `-c` SQL content
The `restorePostgreSQL` drop-connections psql call passes database name in the `-c` SQL string. Since `database` comes from `ConfigService` (not user input), this is not a user-controlled injection risk — but converting to `spawnAsync` still eliminates the shell entirely.

## 4. Testing & Verification

### 4.1 Automated Tests
Both test files already exist (`backup.service.spec.ts`, `backup.controller.spec.ts`) and should be extended:

- **Service unit test:** Verify `spawn` is called with the correct argument arrays for each refactored method.
- **Controller unit test — rejection:** Attempt to upload a file with an unsafe name (e.g., `backup;rm.tar.gz`) and assert `fileFilter` rejects it before `uploadBackup` is called.
- **Controller unit test — acceptance:** Upload a file with a safe name and confirm it passes through to `processUploadedBackup`.
- **Regression:** Verify that the standard backup creation and restoration flow still succeeds.

### 4.2 Manual Verification
- Perform a manual backup.
- Perform a manual restore of the created backup.
- Attempt to upload a file with spaces or special characters to verify rejection.

## 5. Security Considerations
By moving to `spawn` with argument arrays, we bypass the shell entirely for argument parsing, which is the most effective way to prevent command injection in Node.js. Moving filename validation into `fileFilter` ensures malicious filenames never reach the filesystem. Together these provide robust defense-in-depth.
