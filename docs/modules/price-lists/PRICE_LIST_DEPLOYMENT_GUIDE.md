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

```bash
backup_dir="/backup/erp/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U erp_user erp_db > "$backup_dir/erp_db_backup.sql"
ls -lh "$backup_dir/erp_db_backup.sql"
```

Record the backup path and test restoration in an isolated database before proceeding.

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
history needs baseline reconciliation before normal migration execution. The
[Docker entrypoint](../../../backend/docker-entrypoint.sh) detects this state and
refuses startup; follow its diagnostic after taking a backup and reviewing the
schema and migration history. Do not blindly fake all pending migrations on an
existing database: later schema changes may still need execution.

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
startup; investigate the error before retrying. There is no schema synchronization fallback.

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

### Application checks

- Check backend health: `curl http://localhost:3001/api/health`.
- Sign in and open Settings > Price Lists.
- Verify the default list and any existing product prices and customer assignments.
- Assign a customer to a price list, then verify that customer's sales order pricing.
- Check backend logs and the browser console for errors.

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
