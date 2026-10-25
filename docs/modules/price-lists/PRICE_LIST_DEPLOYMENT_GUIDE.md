# Price List System Deployment Guide

**Last Updated**: October 2026

This guide covers the current migration chain and price list deployment checks.
The local Compose stack is the only running environment. Production-host steps
remain unverified until a production host exists; local results are not production evidence.

## Overview

Price lists use the `price_lists` and `price_list_items` tables and the
`customers.priceListId` relationship. Their schema is included in
[`1785238045705-InitialSchema.ts`](../../../backend/src/database/migrations/1785238045705-InitialSchema.ts).
The migration squash is recorded in [#950](https://github.com/blur88/erp2/issues/950).
There is no separate price list schema or legacy JSONB data migration to run.

Use the [deployment checklist](../../deployment/DEPLOYMENT_CHECKLIST.md) to record
results. General migration rules belong to [AGENTS.md](../../../AGENTS.md#critical-rules-and-traps).

## Pre-Deployment Checklist

- Confirm the intended commit and review its pending migrations.
- Build and test the images locally.
- Prepare a database backup and verify restoration in an isolated database.
- Record current price list, item and assigned-customer counts for comparison.
- Review recovery with the matching application image and database backup.
- Required when a production host is created: verify host access, configuration,
  backup storage and monitoring before scheduling deployment.

## Backup Procedures

Run from the repository root. These examples use the local Compose database;
adjust database credentials and backup storage for the target environment.

### PostgreSQL Direct Backup

```bash
backup_dir="/backup/erp/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U erp_user erp_db > "$backup_dir/erp_db_backup.sql"
ls -lh "$backup_dir/erp_db_backup.sql"
```

### Using the Built-in Backup Module

When the application is running, the backup API is another option:

```bash
curl -X POST http://localhost:3000/api/backup/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"backupType":"manual","databases":["postgresql"]}'
```

See the [backup controller](../../../backend/src/modules/backup/backup.controller.ts)
and [request DTO](../../../backend/src/modules/backup/dto/create-backup.dto.ts).

### Verify Backup Integrity

For the direct SQL dump above, restore into an unused temporary database. Confirm
`erp_test` is not an application or test-runner database before creating it; these
commands must target the intended local Compose instance. Replace `TIMESTAMP`
with the directory name printed when the backup was created.

```bash
docker compose exec -T postgres psql -U erp_user -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE erp_test;"
docker compose exec -T postgres psql -U erp_user -d erp_test -v ON_ERROR_STOP=1 \
  < "/backup/erp/TIMESTAMP/erp_db_backup.sql"
docker compose exec -T postgres psql -U erp_user -d erp_test -v ON_ERROR_STOP=1 \
  -c 'SELECT COUNT(*) FROM price_lists; SELECT COUNT(*) FROM price_list_items;'
# After inspecting the restored data, remove only this temporary database.
docker compose exec -T postgres psql -U erp_user -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE erp_test;"
```

Record the backup path and restore results before proceeding. Copy the backup to
an off-server location and apply the agreed retention policy.

## Migration Steps

### Fresh database

The migration chain starts with `InitialSchema1785238045705`, which creates the
price list schema along with the rest of the ERP schema. Apply all pending
migrations, including those after the baseline.

For a source checkout with dependencies and database environment configured:

```bash
cd backend
npm run typeorm -- -d ./src/config/database.config.ts migration:show
npm run migration:run
npm run typeorm -- -d ./src/config/database.config.ts migration:show
```

Expected: pending migrations complete successfully and the final listing has no
pending entries. Do not expect legacy pricing conversion messages or fixed row counts.

### Existing database

Review migration history before upgrading. An existing schema with empty migration
history needs baseline reconciliation before normal migration execution.
Detection cannot establish which later migrations an existing schema already
contains. The entrypoint refuses startup for `UNTRACKED_SCHEMA` and points to this section.
See the [Docker entrypoint](../../../backend/docker-entrypoint.sh). Do not use
`migration:run --fake` with the full migration configuration: that command records
**every pending migration** as applied without executing it, as shown by
[TypeORM 1.1.1's migration executor](https://github.com/typeorm/typeorm/blob/1.1.1/src/migration/MigrationExecutor.ts).
It is appropriate only after verifying that every pending migration's schema and
data changes are already present in the database.

For an existing database whose schema matches the baseline but whose migration
history is empty, reconcile the migration history manually before startup. Do
not mark subsequent migrations as applied unless their schema and data changes
are already present. Take a backup, verify the schema against `InitialSchema`,
and plan how to record only that baseline and apply subsequent migrations
normally before restarting. This guide does not provide a tested
baseline-recording procedure. See [issue #1466](https://github.com/blur88/erp2/issues/1466).

Do not pipe TypeScript migration files into `psql`. Use TypeORM for migration execution.

### Docker image

The runtime image contains compiled files under `dist/`, rather than the source
configuration used by `npm run migration:run`. The entrypoint runs the baseline
check and compiled migrations before starting the app. See the
[Dockerfile](../../../backend/Dockerfile) and [entrypoint](../../../backend/docker-entrypoint.sh).

## Deployment Steps

Run from the repository root:

```bash
git pull --ff-only origin main
docker compose build backend frontend
docker compose up -d
docker compose ps
docker compose logs backend --tail=100
```

Confirm migrations completed and the backend started. A migration failure stops
startup; investigate the error before retrying.

## Post-Deployment Validation

### Schema and data

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('price_lists', 'price_list_items');
"
docker compose exec postgres psql -U erp_user -d erp_db -c '
  SELECT
    (SELECT COUNT(*) FROM price_lists) AS price_lists,
    (SELECT COUNT(*) FROM price_list_items) AS items,
    (SELECT COUNT(*) FROM customers WHERE "priceListId" IS NOT NULL) AS linked_customers;
'
```

Expect both tables. Compare counts against the pre-deployment state for upgrades;
a fresh database has no legacy records to convert. After application startup,
[`PriceListsSeederService`](../../../backend/src/modules/price-lists/services/price-lists-seeder.service.ts)
ensures an active default price list, creating Retail when no usable list or
existing RETAIL row is available. It does not populate product prices or customer assignments.

### Products without a default price

This query lists undeleted products with no active, undeleted item in the active,
undeleted default price list. Items in other lists do not satisfy the check.

```sql
SELECT p.id, p.name
FROM products p
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM price_list_items pli
    JOIN price_lists pl ON pl.id = pli."priceListId"
    WHERE pli."productId" = p.id
      AND pli."deletedAt" IS NULL AND pli."isActive" = true
      AND pl."deletedAt" IS NULL AND pl."isActive" = true
      AND pl."isDefault" = true
  );
```

### Application checks

- Check backend health: `curl http://localhost:3001/api/health`.
- Sign in and open Settings > Price Lists.
- Verify the default list and any existing product prices and customer assignments.
- Assign a customer to a price list, then verify that customer's sales order pricing.
- Check backend logs and the browser console for errors.

### Copy, adjust and default-list checks

Use a disposable price list and record its starting prices:

- Copy the list and verify all intended items and prices were copied.
- Apply a percentage adjustment to the copy and verify the resulting prices.
- Set a list as default and verify the default changed; restore the intended
  default after the check.

These operations are exposed by `POST /api/price-lists/:id/copy`,
`POST /api/price-lists/:id/adjust` and `POST /api/price-lists/:id/set-default`.

### Frontend availability

```bash
curl -I http://localhost:3000
curl -I http://localhost:3000/settings/price-lists
# Expected: 200 OK for both requests.
```

Follow these HTTP checks with the browser checks above to validate the page itself.

See the [API reference](./PRICE_LIST_API.md) and [user guide](./PRICE_LIST_USER_GUIDE.md)
for price list operations.

## Rollback Procedures

There is no pair of price-list-only migrations to revert. Reverting the genesis
migration drops the ERP schema; never use it as a feature rollback.

If deployment fails, stop application writes and inspect the error. Prefer a
forward fix when new data must be preserved. If restoration is necessary, restore
the verified pre-deployment database backup with its matching application image,
then repeat health and price list checks. Record any data written after the backup
and reconcile it before resuming use.

## Troubleshooting

### Migration or baseline failure

Read `docker compose logs backend --tail=100` and inspect migration history.
For a source checkout, use `cd backend && npm run typeorm -- -d ./src/config/database.config.ts migration:show` with the target
database configuration. Resolve the reported schema/history problem before retrying;
do not automatically revert migrations or delete price list data.

### Missing prices or customer assignments

Check the intended price list, its items and the customer's assigned list.
The current migration chain does not convert removed legacy JSONB pricing fields.
Use supported price list operations to enter prices and assign customers; rerunning
migrations will not reconstruct that data.

### Frontend unavailable

Check container logs and rebuild the frontend image after source changes:

```bash
docker compose build frontend
docker compose up -d frontend
```

## Monitoring

Monitor backend errors, price list API response times and sales order pricing after
deployment. Record validation results with the environment and commit tested.
Production-host validation remains outstanding until that environment exists.

### Database performance

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  SELECT schemaname, relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
  FROM pg_stat_user_tables
  WHERE relname IN ('price_lists', 'price_list_items')
  ORDER BY seq_scan DESC;
"
```

Compare scan counters and API response times with pre-deployment observations;
investigate unexpected changes in query performance.

## Support and Escalation

### Tier 1: User Issues

- Consult the [user guide](./PRICE_LIST_USER_GUIDE.md) and its FAQ.
- Route basic inquiries to the support team.

### Tier 2: Technical Issues

- Use this guide's troubleshooting checks and inspect backend logs.
- Escalate unresolved issues to the development team.

### Tier 3: Critical Issues

- Escalate critical bugs, data integrity issues and severe performance degradation
  to the development team lead immediately.
- Assess recovery using the [rollback procedures](#rollback-procedures), including
  preservation of any data written since the backup.
