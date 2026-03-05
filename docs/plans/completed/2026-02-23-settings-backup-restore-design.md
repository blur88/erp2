# Settings Backup & Restore — Design

**Date**: 2026-02-23
**Status**: Approved

## Problem

`BackupService.getCompanySettings()` and `getPrintSettings()` are stubs that return `{}`.
`restoreSettings()` is a no-op that only logs a message.
The settings JSON in every backup archive is empty, and restore does nothing with settings.

## Scope

Fix the settings backup/restore so it:
1. Exports real data from all 4 settings entities into the archive JSON
2. Restores that data back to the database on restore

## Entities Covered

| Entity | Table | Pattern |
|--------|-------|---------|
| `CompanySettings` | `company_settings` | Singleton (`isActive: true`) |
| `PriceCostingSettings` | `price_costing_settings` | Singleton (`isActive: true`) |
| `DocumentNumberSettings` | `document_number_settings` | Singleton (first active row) |
| `PrintSettings` | `print_settings` | Singleton (first row by `createdAt ASC`) |

## Approach: Direct TypeORM in BackupService

Inject the 4 repositories directly into `BackupService`. No cross-module service dependencies.

### Backup (export)

`backupSettings()` queries each entity's active row and writes a structured JSON file:

```json
{
  "companySettings": { "name": "...", "address": "...", "logoUrl": "..." },
  "priceCostingSettings": { "currency": "MYR", "costingMethod": "AVERAGE", "dateFormat": "DD/MM/YYYY", "timeFormat": "24h", "numberFormat": "1,234.56" },
  "documentNumberSettings": { "configurations": [...] },
  "printSettings": { "companyName": "...", "salesOrderTemplate": {...}, ... },
  "timestamp": "2026-02-23T00:00:00.000Z"
}
```

`logoUrl` is excluded from `printSettings` export — restoring a file path without the actual file would cause broken image references.

### Restore (import)

`restoreSettings()` reads the JSON file and for each settings section:
1. Finds the existing active row (same query the services use)
2. If found → `Object.assign(existing, data)` + `repository.save(existing)`
3. If not found → `repository.create(data)` + `repository.save()`

`logoUrl` is excluded from restore for both `companySettings` and `printSettings`.

### Error Handling

- Each settings type is restored independently in a try/catch
- A failure on one type logs a warning but does not abort the others
- If no settings file is found in the archive, a warning is logged and restore is skipped (existing behavior)

## Module Changes

`backup.module.ts` — add to `TypeOrmModule.forFeature([...])`:
- `CompanySettings`
- `PriceCostingSettings`
- `DocumentNumberSettings`
- `PrintSettings`

`backup.service.ts`:
- Add 4 `@InjectRepository()` constructor parameters
- Replace `getCompanySettings()` stub with real query
- Replace `getPrintSettings()` stub with real query
- Replace `restoreSettings()` no-op with real upsert logic

## Out of Scope

- Logo file backup (binary file — covered by separate file backup strategy if needed)
- Payment methods backup (transactional data, covered by pg_dump)
- Backup settings entity itself (already in pg_dump)
