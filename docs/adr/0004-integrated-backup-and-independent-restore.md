---
status: accepted (not yet implemented; supersedes ADR-0003 once it ships)
---

# Backups run inside ERP2 and go to locked S3 storage; restore never needs ERP2

The ERP2 backend creates every Backup itself. It runs the PostgreSQL 19 client tools, copied into its image from the same official `postgres` image the database runs. The backend's existing NestJS scheduler triggers Backups, and a single in-process lock stops two from running at once. Each Backup is encrypted with `age` to a public key; the private key never touches the production machine. A short-lived Local copy stays on the machine, and the Backup goes to a dedicated Amazon S3 bucket with versioning and **compliance-mode** Object Lock. The production credential can create delete markers but can never purge versions or change bucket protection. S3 lifecycle rules do all permanent deletion. That bucket is the only record of which Backups exist. A hosted Healthchecks.io heartbeat, pinged only after a Verified Backup is confirmed off-host, raises the overdue alert. Restoring is an operator procedure in [the Backup & Restore runbook](../deployment/BACKUP_RESTORE_RUNBOOK.md) that needs only the bucket, the private key and standard tools. A timed Restore drill from an off-host Backup must pass before ERP2's first production deployment.

This reverses the direction of [ADR-0003](0003-remove-app-managed-backups.md), which moved backups out of the app because its Alpine image had no PostgreSQL 19 client. Copying the binaries from the matching `postgres` image fixes that without a new service. The owner needs to manage backups from inside ERP2. The decisions behind this ADR were settled while designing #2067.

## Considered Options

- **Operator-run tools or a backup sidecar (the ADR-0003 direction)**: rejected. In-app management was a real requirement, and a sidecar would have needed a second service and a way for the backend to send it commands, without improving correctness.
- **pgBackRest, WAL-G or Barman, with WAL archiving and PITR**: rejected for now. None states support for PostgreSQL 19.0 final. A one-hour RPO is met by a logical dump every 30 minutes, and WAL archiving adds an outage risk: PostgreSQL shuts down hard if the WAL disk fills.
- **TrueNAS as the off-host target**: rejected. It runs on the same physical machine.
- **Backblaze B2, Wasabi, Cloudflare R2**: rejected. B2's documentation doesn't confirm that a credential can be limited to hiding versions without purging them. Wasabi has minimum charges and enables Object Lock only when a bucket is created. R2 has no versioning.
- **Restoring from the ERP2 UI**: rejected for now. A restore replaces the database the running app depends on, so a single runbook path, rehearsed every month, is more reliable than two.
- **Governance-mode lock**: rejected. A stolen admin credential could bypass it.

## Consequences

- The backend image's PostgreSQL client and the database image must stay on the same version. An alignment test and a version check at startup enforce this.
- Object Lock only guarantees the last 14 days. Older Backups depend on the restricted production credential and the lifecycle grace period, so a compromise that goes unnoticed for longer than that can destroy older history. The monthly Restore drill includes reviewing the retained history.
- The heartbeat trusts the backend's confirmed ping and doesn't inspect the bucket itself. Its alert thresholds are therefore approximate.
- Backups and AWS, the encryption key and Healthchecks.io now all live outside the repository, and losing access to any of them can block recovery. The runbook covers keeping access to each one independently of the machine.
