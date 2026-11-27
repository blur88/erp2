# Remove application-managed Backup & Restore

The PostgreSQL 19 Major upgrade leaves the application without a compatible
`pg_dump` client in its Alpine base, so archive creation and recovery move to
operator-run PostgreSQL tools. Removing the feature also removes its dedicated
BullMQ queue, `bull:backup-queue:*`, and its schedule and retention logic. Redis
remains for health checks and memory monitoring.

The Migration drops `backup_logs`, `backup_schedules` and
`backup_retention_settings`. Restoring that data requires a pre-migration
PostgreSQL backup. Existing host archives are retained. The
[Major upgrade runbook](../deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md)
covers interim backup and recovery and the one-time queue cleanup.
