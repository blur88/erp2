# Backup & Restore runbook

This is the only procedure for restoring ERP2 from a Backup. It needs the Backup
bucket, the `age` private key and standard tools. It does not need ERP2 to be
running, and it does not use the ERP2 interface. Terms such as Backup, Local
copy, Verified Backup and Restore drill are defined in [GLOSSARY.md](../../GLOSSARY.md).
The design is in [ADR-0004](../adr/0004-integrated-backup-and-independent-restore.md).

Read the whole runbook before you start. Do not run a restore on a host where
the existing data is the only copy you have until the pre-restore Backup in
[Keep the existing data](#keep-the-existing-data) is confirmed.

## Before you start

Keep these off the production machine. Retrieve them only for the restore, and
remove the local copies afterwards.

- **The `age` private key** that matches `BACKUP_AGE_RECIPIENT`. The production
  machine holds only the public recipient. Store the key in a password manager
  or offline store that you can reach without this host.
- **Amazon S3 credentials** with read access to the Backup bucket for the restore.
  The production credential can create delete markers but cannot purge versions
  or change bucket protection. Keep the restore credential separate from it.
- **Healthchecks.io access.** You do not need it to restore, but the heartbeat
  alerts stay silent unless someone can read them after the restore.
- **Standard tools** on the restore host: `aws` (AWS CLI v2 or later), `age`
  1.x, `jq`, `sha256sum`, `tar`, and the PostgreSQL 19 client (`psql` and
  `pg_restore`). The PostgreSQL client must be major version 19, the same major
  as the server it restores into. Use the matching client from the
  `postgres:19` image if your host has none.
- **The Release image** the Backup came from, or the released image you are
  restoring with. Its version must match the Backup's manifest. See
  [Restoring unreleased Backups](#restoring-unreleased-backups) for the exception.

The restore host must be a clean PostgreSQL 19 server with no application
databases (only `postgres`, `template0` and `template1`). The restore commands
refuse to run into a server that holds other databases unless you confirm
(see [Confirm before overwriting](#confirm-before-overwriting)).

## Recovery environments

A copy of ERP2 booted from a restored database inherits the production Backup
settings and, usually, the production Backup bucket. Retention deletes objects,
so such a copy must not touch the bucket until an operator decides it may.

Mark every recovery environment with:

| Variable | Value | Effect |
|---|---|---|
| `BACKUP_RECOVERY_ENVIRONMENT` | `true` | Holds scheduled Backups and retention. Any value except empty or `false` marks a recovery environment, so a typo fails closed. |
| `BACKUP_RECOVERY_ALLOW_SCHEDULING_AND_RETENTION` | `true` | Releases the hold. Set it only after [Check ERP2 and the restored settings](#check-erp2-and-the-restored-settings). Only the exact value `true` releases it. |

While the hold applies, `GET /api/backups/status` reports scheduling as
`unavailable` with the reason, and the last retention pass is recorded as
`skipped`. Manual Backups still run, so do not start one from a recovery
environment unless you have decided that it may write to the bucket.

## Stop writers and scheduled jobs

Before you restore anything, stop every process that can write to the database,
uploads or the Backup bucket:

```bash
docker compose -f docker-compose.prod.yml stop backend
```

Stop any other ERP2 backend that shares the database or the bucket, and confirm
that no Backup is running on the source host. A running Backup is visible at
`GET /api/backups/status` as `running` (not `null`) until it finishes.

## Keep the existing data

If the existing database still answers, take a Backup of it before you overwrite
anything, so that a wrong choice can be undone:

1. Start the backend for the existing data only, with `BACKUP_RECOVERY_ENVIRONMENT=true`
   so that it cannot schedule or prune while you work.
2. Sign in as an administrator and start a Backup from the Backup page (or
   `POST /api/backups`).
3. Confirm the new Backup is listed as complete in the Backup page or
   `GET /api/backups`. Note its recovery point.
4. Stop the backend again.

If the database cannot be reached, the existing data is not reachable through
ERP2. Keep the host's PostgreSQL data directory and uploads directory as they
are, and copy them aside before you overwrite them.

## Restore commands

Each block below runs in one shell, in order. The Restore drill in CI runs
exactly these blocks against a clean PostgreSQL 19 cluster, so keep them
self-contained. Set the variables first:

| Variable | Meaning |
|---|---|
| `RESTORE_DIR` | An empty directory for the downloaded files, with mode `0700`. |
| `RESTORE_RECOVERY_POINT` | The Backup's recovery point, for example `20261128T100000000Z`. |
| `RESTORE_SOURCE` | `local` to copy from the Local copy directory, or `cloud` to copy from the bucket. |
| `RESTORE_LOCAL_COPY_DIR` | The Local copy directory (`BACKUP_LOCAL_COPY_DIR`), for `local` only. |
| `RESTORE_BUCKET` | The Backup bucket, for `cloud` only. |
| `RESTORE_RELEASE` | The version of the Release you are restoring with, for example `1.4.2`. |
| `RESTORE_ALLOW_UNRELEASED` | Set to `1` only for an unreleased Backup. |
| `AGE_IDENTITY_FILE` | The `age` private key file, copied from off the machine. Delete it afterwards. |
| `RESTORE_UPLOADS_DIR` | The empty uploads directory the restored ERP2 will mount. |
| `RESTORE_CONFIRM` | The recovery point, typed by the operator, when the target holds data. |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` | The clean PostgreSQL 19 server. `PGUSER` is its bootstrap superuser. |

### Fetch the Backup

```bash
set -euo pipefail
fail() { printf 'restore: %s\n' "$*" >&2; exit 1; }
for name in RESTORE_DIR RESTORE_RECOVERY_POINT RESTORE_SOURCE RESTORE_RELEASE AGE_IDENTITY_FILE \
  RESTORE_UPLOADS_DIR PGHOST PGPORT PGUSER PGPASSWORD; do
  [ -n "${!name:-}" ] || fail "$name is not set"
done
printf '%s' "$RESTORE_RECOVERY_POINT" | grep -Eq '^[0-9]{8}T[0-9]{9}Z$' || fail "RESTORE_RECOVERY_POINT is not a recovery point"
[ -d "$RESTORE_DIR" ] && [ -z "$(ls -A "$RESTORE_DIR")" ] || fail "RESTORE_DIR must be an empty directory"
case "$RESTORE_SOURCE" in
  local)
    [ -n "${RESTORE_LOCAL_COPY_DIR:-}" ] || fail "RESTORE_LOCAL_COPY_DIR is not set"
    cp "$RESTORE_LOCAL_COPY_DIR/$RESTORE_RECOVERY_POINT/manifest.json" "$RESTORE_DIR/manifest.json"
    cp "$RESTORE_LOCAL_COPY_DIR/$RESTORE_RECOVERY_POINT/backup.tar.age" "$RESTORE_DIR/backup.tar.age"
    ;;
  cloud)
    [ -n "${RESTORE_BUCKET:-}" ] || fail "RESTORE_BUCKET is not set"
    aws s3 cp "s3://$RESTORE_BUCKET/backups/$RESTORE_RECOVERY_POINT/manifest.json" "$RESTORE_DIR/manifest.json"
    aws s3 cp "s3://$RESTORE_BUCKET/backups/$RESTORE_RECOVERY_POINT/backup.tar.age" "$RESTORE_DIR/backup.tar.age"
    ;;
  *) fail "RESTORE_SOURCE must be local or cloud" ;;
esac
```

### Check the manifest, checksum and Release

Do this before anything touches the target. Every check must pass.

```bash
set -euo pipefail
fail() { printf 'restore: %s\n' "$*" >&2; exit 1; }
manifest="$RESTORE_DIR/manifest.json"
archive="$RESTORE_DIR/backup.tar.age"
jq -e --arg rp "$RESTORE_RECOVERY_POINT" '
  .format_version == 1
  and .recovery_point == $rp
  and .archive.name == "backup.tar.age"
  and .postgres.server_major == 19
  and .postgres.client_major == 19
  and .checks.uploads_references == "passed"
  and .checks.dump_readable == "passed"
  and .checks.application_role_in_globals == "passed"' "$manifest" >/dev/null \
  || fail "the manifest does not describe this Backup, or its checks did not pass"
want_sha="$(jq -r .archive.sha256 "$manifest")"
want_size="$(jq -r .archive.size "$manifest")"
got_sha="$(sha256sum "$archive" | cut -d' ' -f1)"
got_size="$(stat -c %s "$archive")"
[ "$got_sha" = "$want_sha" ] && [ "$got_size" = "$want_size" ] \
  || fail "the archive does not match the manifest checksum or size"
release="$(jq -r .release "$manifest")"
if [ "$release" = unreleased ]; then
  [ "${RESTORE_ALLOW_UNRELEASED:-}" = 1 ] \
    || fail "this Backup is unreleased; read 'Restoring unreleased Backups' before setting RESTORE_ALLOW_UNRELEASED=1"
  printf 'restore: unreleased Backup accepted by RESTORE_ALLOW_UNRELEASED\n'
else
  [ "$release" = "$RESTORE_RELEASE" ] \
    || fail "the Backup is from Release $release, but this restore uses Release $RESTORE_RELEASE"
fi
printf 'restore: manifest, checksum and Release (%s) checked\n' "$release"
```

### Decrypt and unpack

```bash
set -euo pipefail
fail() { printf 'restore: %s\n' "$*" >&2; exit 1; }
age -d -i "$AGE_IDENTITY_FILE" -o "$RESTORE_DIR/backup.tar" "$RESTORE_DIR/backup.tar.age"
members="$(tar -tf "$RESTORE_DIR/backup.tar" | sort | tr '\n' ' ')"
[ "$members" = "erp_db.dump globals.sql uploads.tar " ] || fail "unexpected archive members: $members"
mkdir -m 0700 "$RESTORE_DIR/parts"
tar -xf "$RESTORE_DIR/backup.tar" -C "$RESTORE_DIR/parts"
pg_restore --list "$RESTORE_DIR/parts/erp_db.dump" >/dev/null || fail "the database dump cannot be read"
rm -f "$RESTORE_DIR/backup.tar"
printf 'restore: archive decrypted and unpacked\n'
```

### Confirm before overwriting

The target must be a clean PostgreSQL 19 server. If it already holds a database
other than the maintenance ones, or the uploads directory is not empty, the
restore needs the recovery point typed again as `RESTORE_CONFIRM`. Take the
pre-restore Backup first (see [Keep the existing data](#keep-the-existing-data)).

```bash
set -euo pipefail
fail() { printf 'restore: %s\n' "$*" >&2; exit 1; }
server_major="$(psql -d postgres -Atc 'SHOW server_version_num')"
[ "$((server_major / 10000))" -eq 19 ] || fail "the target server must be PostgreSQL 19"
user_databases="$(psql -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1')")"
uploads_used=""
if [ -n "$(ls -A "$RESTORE_UPLOADS_DIR" 2>/dev/null || true)" ]; then uploads_used=1; fi
if [ "$user_databases" != "0" ] || [ -n "$uploads_used" ]; then
  [ "${RESTORE_CONFIRM:-}" = "$RESTORE_RECOVERY_POINT" ] \
    || fail "the target holds data; type the recovery point ($RESTORE_RECOVERY_POINT) as RESTORE_CONFIRM to overwrite it"
  printf 'restore: overwrite confirmed for %s\n' "$RESTORE_RECOVERY_POINT"
fi
```

### Restore globals, then the database, then uploads

Globals hold the roles. The bootstrap superuser already exists on the new
server, so its `CREATE ROLE` line is removed. That line must appear exactly once,
or the restore stops.

```bash
set -euo pipefail
fail() { printf 'restore: %s\n' "$*" >&2; exit 1; }
parts="$RESTORE_DIR/parts"
# pg_dumpall writes a role name unquoted when it is a plain identifier, and quoted otherwise.
quoted="CREATE ROLE \"$PGUSER\";"
plain="CREATE ROLE $PGUSER;"
bootstrap_count="$(grep -cxF -e "$quoted" -e "$plain" "$parts/globals.sql" || true)"
[ "$bootstrap_count" = 1 ] || fail "expected exactly one CREATE ROLE for the bootstrap role, found $bootstrap_count"
awk -v quoted="$quoted" -v plain="$plain" '$0 != quoted && $0 != plain' "$parts/globals.sql" > "$parts/globals.filtered.sql"
psql -d postgres -v ON_ERROR_STOP=1 --single-transaction -f "$parts/globals.filtered.sql" >/dev/null
pg_restore --exit-on-error --create -d postgres "$parts/erp_db.dump"
printf 'restore: globals and database restored\n'
```

```bash
set -euo pipefail
fail() { printf 'restore: %s\n' "$*" >&2; exit 1; }
mkdir -p "$RESTORE_UPLOADS_DIR"
[ -z "$(ls -A "$RESTORE_UPLOADS_DIR")" ] || fail "RESTORE_UPLOADS_DIR is not empty; the confirmation step should have stopped this"
tar -xf "$RESTORE_DIR/parts/uploads.tar" -C "$RESTORE_UPLOADS_DIR"
printf 'restore: uploads restored to %s\n' "$RESTORE_UPLOADS_DIR"
```

## Boot the recovery environment

Start ERP2 from the Release you chose, with the restored database and uploads,
the Backup settings it inherits, and the recovery marker. On a Compose host, set
`BACKUP_RECOVERY_ENVIRONMENT=true` in `.env` and start the production stack with
the restored data; `docker-compose.prod.yml` passes it to the backend. The
example below does the same with `docker run`. Keep
`BACKUP_RECOVERY_ALLOW_SCHEDULING_AND_RETENTION` unset for now.

```bash
docker run -d --name erp-recovery --network <recovery-network> \
  -v "$RESTORE_UPLOADS_DIR:/app/uploads" \
  -e BACKUP_RECOVERY_ENVIRONMENT=true \
  -e DB_HOST=<restored-server> -e DB_PORT=5432 -e DB_USERNAME="$PGUSER" \
  -e DB_PASSWORD="$PGPASSWORD" -e DB_DATABASE=<database-from-the-backup> \
  -e DB_SSL=false -e DB_SYNCHRONIZE=false \
  -e JWT_SECRET=<new-jwt-secret> -e REDIS_HOST=<redis> \
  -e BACKUP_LOCAL_COPY_DIR=/var/lib/erp-backups \
  -e BACKUP_S3_BUCKET="$RESTORE_BUCKET" -e BACKUP_S3_REGION=<region> \
  -e BACKUP_S3_ACCESS_KEY_ID=<restore-read-key-id> -e BACKUP_S3_SECRET_ACCESS_KEY=<restore-read-secret> \
  -e BACKUP_AGE_RECIPIENT=<age-public-recipient> \
  -e BACKUP_HEARTBEAT_URL_PRIMARY=<primary-check-url> -e BACKUP_HEARTBEAT_URL_SECONDARY=<secondary-check-url> \
  erp-backend:<release-version>
```

Give the recovery environment a storage credential you can revoke. The `BACKUP_HEARTBEAT_*`
variables may be left unset. Without them, a Backup in this environment is
reported as a configuration warning and nothing is pinged.

## Check ERP2 and the restored settings

Before scheduling and retention resume, confirm the restored system is what you
expect. Sign in as an administrator and check each item:

1. `GET /api/health` returns `200`.
2. The Backup settings are the ones you expect: `GET /api/backups/settings` returns
   `"state": "valid"` with the intended interval and retention values. If the
   state is `invalid` or `missing`, correct them with `PUT /api/backups/settings`
   before you allow scheduling. Scheduling stays off until the settings are valid.
3. `GET /api/backups/status` reports `scheduling.state` as `unavailable` with the
   recovery-environment reason. Nothing has been scheduled yet.
4. The business data and the logo are the ones from the Recovery point. Check a
   known record and the company logo on the Settings page.
5. A login as a user you know works.

Only then allow scheduling and retention. Set
`BACKUP_RECOVERY_ALLOW_SCHEDULING_AND_RETENTION=true` on the recovery environment,
restart it, and confirm `GET /api/backups/status` reports `scheduling.state` as
`scheduled`. From this point the environment writes to the bucket, so only do this
on the production host, or on a recovery host whose Backup bucket you intend to
use.

## Restoring unreleased Backups

A Backup made from an image without a release version has `"release": "unreleased"`
in its manifest. Such a Backup is not Verified and does not count towards the
RPO. You can still restore it, but only deliberately:

1. Use the image the Backup was made with, if you still have it. Otherwise use
   the newest Release whose migrations include every migration the Backup's
   database had applied. Forward migrations run on start, so a newer image can
   open an older database, but never an older image a newer one.
2. Set `RESTORE_ALLOW_UNRELEASED=1` for the fetch and check blocks. Without it,
   the check stops.
3. Record in the restore notes which image you used. The manifest does not say
   which commit the Backup came from.

## Restore drill

A Restore drill proves ERP2 works from an off-host Backup. Run it before the first
production deployment, and then monthly, using the Backup & Restore runbook:

1. Choose a Verified Backup from the bucket, not the Local copy.
2. Start a clean PostgreSQL 19 server and a clean uploads directory.
3. Time the procedure from the first fetch to a successful login and business read.
4. Record the start and end times, the Backup's recovery point and Release, the
   image used, and the checks in [Check ERP2 and the restored settings](#check-erp2-and-the-restored-settings).
5. Keep the record with the release notes or the operations log.

The first production deployment is blocked until a Restore drill has passed,
as described in [the README](../../README.md#deployment) and
[the rehearsal evidence rules](../../CODING_STANDARDS.md#runbook-rehearsal-evidence).
