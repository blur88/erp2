# Issue #546: Dependency Updates Design

**Date:** 2026-05-10  
**Issue:** [#546](https://github.com/blur88/erp2/issues/546) — Update @mui/x-date-pickers to 9.1.0 and archiver to 8.0.0

---

## Scope

Two package bumps:

| Package | From | To | Location |
|---|---|---|---|
| `@mui/x-date-pickers` | `9.0.4` | `9.1.0` | `frontend/package.json` |
| `archiver` | `^7.0.1` | `8.0.0` | `backend/package.json` |
| `@types/archiver` | `^7.0.0` | no change | `backend/package.json` |

`@types/archiver` stays at `^7.0.0` — no v8 types have been published yet. The v7 types remain compatible because `archiver` v8's API surface is unchanged; the major bump was driven by internal dependency upgrades (`zip-stream` v7, `readdir-glob` v3, new `is-stream` v4 and `lazystream` deps).

No overrides blocks reference either package — no override cleanup needed.

---

## Risk Assessment

**`@mui/x-date-pickers` (minor bump):** Low risk. Minor version bump within MUI X v9. No breaking changes expected.

**`archiver` (major bump):** Low-medium risk, mitigated by a targeted smoke test. The only usage is in `backup.service.ts:createArchive()`, which calls:
- `archiver('tar', { gzip: true, gzipOptions: { level: 9 } })`
- `.pipe(writeStream)`
- `.directory(sourceDir, false)`
- `.finalize()`

All of these are stable API surface that did not change in v8. The risk is that v8's internal dep upgrades (particularly `is-stream` v4, which switched to ESM-only) could affect the Node.js stream integration.

---

## Test Design: `createArchive` Smoke Test

### Goal

Verify that `archiver` v8 still works correctly with the exact call pattern used in `backup.service.ts`. This is an integration-style unit test — the real `archiver` library runs against a real temp directory; no mocks for archiver itself.

### Location

New `describe('createArchive')` block added to `backend/src/modules/backup/backup.service.spec.ts`.

### Test Cases

**1. Resolves to outputPath and produces a non-empty file**

- Creates a real temp dir with one file (`test.txt`) inside
- Calls `service['createArchive'](sourceDir, outputPath)` with a real output path
- Asserts the returned value equals `outputPath`
- Asserts the output file exists and has `size > 0`
- Confirms the promise resolves (archiver v8 still fires `close` on the write stream)

**2. Output is a valid tar.gz containing the source file**

- Same setup as above
- After archive is created, reads it back with Node's `zlib.createGunzip()` + `tar-stream` (already a transitive dep via archiver) or simply uses the system `tar` command via `spawnAsync` to list contents
- Asserts `test.txt` appears in the archive listing
- Confirms `archiver('tar', { gzip: true })` still produces a valid gzip-compressed tar in v8

### Cleanup

`afterEach` removes both the source temp dir and the output `.tar.gz` file using `fs.rm(..., { recursive: true, force: true })`.

### What this does NOT test

- Archiver error path — already covered by other tests that mock `createArchive`
- Specific compression level — internal detail, not observable without decompressing and measuring
- `@mui/x-date-pickers` — frontend component; verified by running the existing frontend test suite

---

## Implementation Steps

1. Bump `@mui/x-date-pickers` to `9.1.0` in `frontend/package.json`
2. Bump `archiver` to `8.0.0` in `backend/package.json`
3. Run `npm install` in both `frontend/` and `backend/` to update lockfiles
4. Add `describe('createArchive')` smoke test to `backup.service.spec.ts`
5. Run `npx jest src/modules/backup/backup.service.spec.ts --no-coverage` — all tests must pass
6. Run `cd frontend && npm run type-check` — no new type errors
7. Close issue #546 via PR with `Closes #546`
