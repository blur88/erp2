# PostgreSQL 19 Major upgrade runbook

Use this procedure for the ERP2 PostgreSQL 18 → 19 Major upgrade. TypeORM
Migrations run only after the restored database is ready. The Migration that
drops the three backup tables cannot be reversed through TypeORM. Keep the PG18
recovery artifacts until the maintainer explicitly approves their removal.

Rehearse with the last pre-upgrade release (for example, `v3.17.27`) and the
exact candidate backend on a disposable Compose project. Use a separate network,
private data paths, test credentials, and no published ports. Seed representative
records, an enabled and a disabled backup schedule, backup job history, and
unrelated Redis keys. Rehearse rollback on that same stack. The maintainer's
development cutover requires the final merge and separate explicit approval.

## Quiesce and inventory

Use Bash with tracing disabled. From the deployment directory, set `project`
to the existing Compose project name and set `old_file` and `new_file` to
the complete, pinned Compose configurations for that same directory and
environment. If the deployment uses several Compose files, include the complete
file list in each function. Preserve the old environment and image IDs. Verify
the resolved service names, repository paths, mounts and network privately
before running any command. Verify the old backend's Redis host and port before
stopping it. Set `compose_network` to the shared network from the inspected
containers. Use the existing database and Redis credentials. Before the first
live command, apply the
[deployment checkout checks](../agents/merge-and-branch-cleanup.md#worktrees)
to the deployment directory.

```bash
set -euo pipefail
umask 077
old() { docker compose -p "${project:?}" -f "${old_file:?}" "$@"; }
new() { docker compose -p "${project:?}" -f "${new_file:?}" "$@"; }
pg19_image=postgres:19.0-alpine3.24
old_image=$(docker inspect -f '{{.Image}}' "$(old ps -q backend)")
docker inspect -f '{{json .Mounts}} {{json .NetworkSettings.Networks}}' \
  "$(old ps -q postgres)" "$(old ps -q redis)"
REDIS_HOST=$(old exec -T backend sh -c 'printf "%s" "${REDIS_HOST:-redis}"')
REDIS_PORT=$(old exec -T backend sh -c 'printf "%s" "${REDIS_PORT:-6379}"')
export REDIS_HOST REDIS_PORT
read -rsp 'Redis password: ' REDIS_PASSWORD
printf '\n'
export REDIS_PASSWORD
read -rsp 'Database password: ' PGPASSWORD
printf '\n'
export PGPASSWORD
recovery=$(mktemp -d "${RECOVERY_ROOT:?Set an operator-owned directory outside Git}/erp-pg19.XXXXXX")
pg19() {
  docker run --rm -i --network "${compose_network:?}" -e PGPASSWORD \
    --entrypoint "$1" "$pg19_image" "${@:2}"
}
pg_sql() { pg19 psql -X -v ON_ERROR_STOP=1 -h postgres -U erp_user "$@"; }
```

### Operator handoff for root blocks

Three blocks call `sudo`:
[Preserve PG18 and initialize PG19](#preserve-pg18-and-initialize-pg19),
[Roll back to PG18](#roll-back-to-pg18) and
[Verify restored PG18 mounts](#verify-restored-pg18-mounts). Run each as a Bash
script, whether or not the person running this procedure has root access. Never
paste them into an interactive shell: an `exit` guard closes the terminal, and
without `set -e` a failed command does not stop the lines after it. If the
session has no root access, the maintainer runs the scripts in their own
terminal. Do not grant the session `sudo` access.

**Before stopping writers**, run the following in the shell that ran the setup
block, with `runbook` set to this file in a checkout of the approved revision.
It writes each script as the shell context followed by the exact runbook block,
and a `preflight` script that requires the same resolved Compose configuration
and the project's `postgres` container in the operator's terminal. The context
holds the deployment directory, `project`, `old_file` and `old()`, and no
passwords. If `old()` refers to other variables, such as additional Compose
files, add them to the `declare -p` list. The `awk` below is the extractor for
these scripts. Do not extract or edit their blocks by hand.

```bash
(
  set -euo pipefail
  umask 077
  runbook=$(realpath -e "${runbook:?Set the path of this runbook at the approved revision}")
  handoff=$(realpath -e "${recovery:?}")/handoff
  deployment=$(pwd -P)
  cd "$deployment"
  : "${project:?}" "${old_file:?}"
  config_digest=$(old config | sha256sum)
  mkdir "$handoff"
  {
    printf 'set -euo pipefail\numask 077\ncd %q\n' "$deployment"
    declare -p project old_file
    declare -f old
  } > "$handoff/context.sh"
  {
    cat "$handoff/context.sh"
    printf 'test "$(old config | sha256sum)" = %q ||\n' "$config_digest"
    printf '  { echo "Compose resolves differently in this terminal" >&2; exit 1; }\n'
    printf 'test -n "$(old ps -aq postgres)" ||\n'
    printf '  { echo "No postgres container for this project" >&2; exit 1; }\n'
    printf 'sudo -v\n'
  } > "$handoff/preflight.sh"
  bash -n "$handoff/preflight.sh"
  for spec in \
    'preserve:## Preserve PG18 and initialize PG19' \
    'rollback:## Roll back to PG18' \
    'rollback-mounts:### Verify restored PG18 mounts'; do
    script="$handoff/${spec%%:*}.sh"
    cp "$handoff/context.sh" "$script"
    awk -v heading="${spec#*:}" '
      $0 == heading { found = 1; next }
      found && !copy && /^#+ / { exit }
      found && !copy && /^```bash$/ { copy = 1; next }
      copy && /^```$/ { complete = 1; exit }
      copy
      END { if (!complete) { print "No bash block under " heading > "/dev/stderr"; exit 1 } }
    ' "$runbook" >> "$script"
    bash -n "$script"
  done
  sha256sum "$runbook" "$handoff"/*.sh
  for name in preflight preserve rollback rollback-mounts; do
    printf 'bash %q || echo "STOPPED: exit $?"\n' "$handoff/$name.sh"
  done
)
```

If generation fails, hand over nothing. Fix the cause, move any `handoff`
directory it left aside, and generate again.

Hand over the printed commands, the expected result of each and the approval it
needs. Support the expected results as
[Runbook rehearsal evidence](../../CODING_STANDARDS.md#runbook-rehearsal-evidence)
requires. A successful script prints no `STOPPED` line, and:

| Script | When | Expected result |
|---|---|---|
| `preflight` | Before stopping writers, and again before rollback | No output of its own is expected. `sudo` may prompt for a password, depending on host policy. |
| `preserve` | [Preserve PG18 and initialize PG19](#preserve-pg18-and-initialize-pg19) | `./data/postgres-18-preupgrade.tar: OK` |
| `rollback` | [Roll back to PG18](#roll-back-to-pg18) | The archive reports `OK` twice. Compose reports PostgreSQL healthy and the backend started. |
| `rollback-mounts` | [Verify restored PG18 mounts](#verify-restored-pg18-mounts) | `true`. A `STOPPED` line after it is still a failure. |

Run `preflight` now, from the terminal that will run the other scripts. A fresh
terminal has none of this shell's exports. If Compose resolves differently
there, put the values in the deployment's own files and generate again.

The person running the scripts must own `$recovery`. Run one script at a time
with its printed command, and never with `sudo bash`: the blocks elevate only
the commands that need it, and the archive and checksum must stay owned by the
operator. Running a script does not replace the approval its section requires.
A script stops at the first failing command and leaves the terminal open.
`preflight` and `rollback-mounts` change nothing, so fix the cause and rerun
them. After a `STOPPED` line from `preserve` or `rollback`, do not rerun that
script or continue to a later step. Inspect the state and follow the recovery
instructions in its section.

Run root recovery commands the same way, never by pasting them. Create a new
file in `handoff` from `context.sh`, append only the commands that the recovery
instructions still require, copied from the runbook where it has them, and have
them approved. Run it with `bash <file> || echo "STOPPED: exit $?"`. Do not
repeat a step that already completed, such as a directory move.

Keep the generator output, `context.sh`, any recovery script, and each script's
output and exit status with the cutover evidence.

All other blocks run in the shell that ran the setup block. They depend on its
options, functions, variables and exports. Record `project`, `old_file`,
`new_file`, `compose_network`, `recovery`, `old_image`, `REDIS_HOST` and
`REDIS_PORT`. A replacement shell runs the setup block's `set`, `umask`,
function and `pg19_image` lines, assigns the recorded values, exports the Redis
endpoint and reads both passwords again. It must not rerun the lines that compute
`recovery`, `old_image` or the endpoint: they create a new recovery directory or
need the old backend running.

### Stop writers and inventory

Block ingress and other database writers, including scripts and maintenance
jobs. Let backup jobs finish, then run `old stop backend`. Stop any other
application workers and Redis writers. Check `pg_stat_activity` and Redis
clients for unexpected connections. Leave PostgreSQL and Redis up for inventory.
Stop if writers cannot be quiesced.

- Confirm PG18 and its active data directory with `SHOW server_version` and
  `SHOW data_directory`. The old bind mount ends at
  `/var/lib/postgresql/data/pgdata`. Inspect the anonymous parent volume
  read-only and record its ID and contents. Keep it through the cutover and
  rollback. Avoid volume removal and pruning.
- Require the database list to be exactly `erp_db`, `erp_gate_candidate`,
  `erp_gate_reference`, `postgres`, `template0`, and `template1`. Confirm the
  gate databases are disposable and inspect the maintenance database and
  templates for custom objects. Check template0 through catalog metadata and
  the deployment's initialization history, since it normally disallows
  connections. Stop for any custom objects in those three databases or if
  their contents cannot be verified. Only `erp_db` is restored. Excluded
  databases stay in PG18.
- Inventory roles, databases, ownership, extensions, user tablespaces,
  non-default settings, init scripts and PG18 data size. Stop for external
  tablespaces, customized init scripts, missing extensions or unexpected
  roles/settings until the restore plan has accounted for them. Confirm that
  the bootstrap superuser is `erp_user`.
- Confirm `./data/postgres-18-preupgrade`, `./data/postgres-18-preupgrade.tar`
  and its checksum path are absent, including dangling symlinks. Confirm
  the operator can create files in `./data` and has root access for PG18
  directory operations. Confirm sufficient free space on each filesystem for
  the dumps, test restore, pristine archive and new cluster alongside retained
  PG18 data. Keep `backups/` in place.

### Source database inventory

**Checkpoint.** Require zero unexpected writers, a verified PG18 data path,
and this exact database inventory. Stop on any mismatch.

```bash
pg_sql -d postgres -Atc 'SELECT datname FROM pg_database ORDER BY datname COLLATE "C"' > "$recovery/databases.before"
diff -u - "$recovery/databases.before" <<'DATABASES'
erp_db
erp_gate_candidate
erp_gate_reference
postgres
template0
template1
DATABASES
```

Capture the verification queries in [Compare and reopen](#compare-and-reopen)
now, while writers are stopped. Save the pre-upgrade output under `$recovery`.

## Dump and validate

**Checkpoint.** Require both dumps, a readable TOC, matching checksums, and
a successful test restore. Stop before Redis cleanup if any check fails.

```bash
(
  set -o noclobber
  cd "$recovery"
  for artifact in erp_db.dump globals.sql erp_db.toc SHA256SUMS; do
    if [[ -e "$artifact" || -L "$artifact" ]]; then
      printf 'Recovery artifact already exists: %s\n' "$artifact" >&2
      exit 1
    fi
  done
  pg19 pg_dump -h postgres -U erp_user -Fc --quote-all-identifiers erp_db > erp_db.dump
  pg19 pg_dumpall -h postgres -U erp_user --globals-only --quote-all-identifiers > globals.sql
  pg19 pg_restore --list < erp_db.dump > erp_db.toc
  sha256sum erp_db.dump globals.sql > SHA256SUMS
  sha256sum -c SHA256SUMS
)
```

Check the dump exits, review the TOC, and test the globals and database restore
using the commands below against a fresh disposable PG19 cluster with the same
bootstrap role, password, and locale. Initialize it with `POSTGRES_DB=postgres`. Point the test commands at that cluster's network.
Require a clean restore and compare with the baseline before proceeding to
Redis cleanup. Recheck checksums before each restore. Keep the original globals
file private. It contains password hashes. Recovery files are operator-owned
with mode `600`, and recovery directories use mode `700`.

## One-time Redis queue cleanup

Perform this during the Major upgrade after all application writers and workers
have stopped and before starting the new backend. Let active backup jobs finish
before stopping the workers. Keep the pre-upgrade backend image and the existing
host `backups/` files. Use the exact Compose project and network for the
deployment throughout.

Confirm the Redis container on the deployment network matches the endpoint
recorded before stopping the backend. Compare the dry run's `runId` with
`INFO server` on that Redis container. Keep the Redis credentials out of logs.

Use the pre-upgrade image's Node runtime and its installed BullMQ. Save the
following block as `cleanup-backup-queue.cjs` under `$recovery`.
It selects DB 0 explicitly because the old backend connection ignores
`REDIS_DB`. It inventories the exact queue, checks for external parent jobs,
and compares unrelated DB 0 keys using their serialized bytes and absolute
expiry times. Keep all Redis writers quiesced while taking the inventories.

```js
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const name = 'backup-queue';
const prefix = 'bull';
const keyPrefix = Buffer.from(`${prefix}:${name}:`);
const isQueueKey = (key) => key.subarray(0, keyPrefix.length).equals(keyPrefix);
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  protocol: 2,
  lazyConnect: true,
  connectTimeout: 5000,
  retryStrategy: () => null,
});

async function keys() {
  const found = new Map();
  let cursor = '0';
  do {
    const [next, batch] = await redis.scanBuffer(cursor, 'COUNT', 500);
    cursor = next.toString();
    for (const key of batch) found.set(key.toString('hex'), key);
  } while (cursor !== '0');
  return [...found.values()].sort(Buffer.compare);
}

async function fingerprint(unrelatedKeys) {
  const result = [];
  for (const key of unrelatedKeys) {
    const dump = await redis.dumpBuffer(key);
    const expiresAt = await redis.pexpiretime(key);
    assert.ok(dump && expiresAt !== -2, 'A key disappeared during inventory');
    result.push([key.toString('hex'), createHash('sha256').update(dump).digest('hex'), expiresAt]);
  }
  return result;
}

async function main() {
  const [mode, confirmation, expectedRunId] = process.argv.slice(2);
  assert.ok(mode === 'dry-run' || mode === 'apply', 'Choose dry-run or apply');
  assert.ok(process.env.REDIS_HOST && process.env.REDIS_PORT, 'Set the Redis endpoint');
  await redis.connect();
  assert.match(await redis.client('INFO'), /(?:^| )db=0(?: |$)/);
  const runId = (await redis.info('server')).match(/^run_id:(\w+)\r?$/m)?.[1];
  assert.ok(runId, 'Redis run_id is unavailable');
  console.log({ runId, db: 0, queue: name, prefix });

  if (mode === 'apply') {
    assert.equal(confirmation, 'delete bull:backup-queue in DB 0');
    assert.equal(runId, expectedRunId, 'Redis instance changed after inspection');
  }

  const before = await keys();
  const target = before.filter(isQueueKey);
  if (target.length === 0) {
    console.log('Queue keys absent. No changes.');
    return;
  }

  let queue;
  try {
    queue = new Queue(name, { prefix, connection: redis, skipMetasUpdate: true });
    assert.equal(queue.toKey(''), keyPrefix.toString());
    console.log('Keys:', target.map((key) => key.toString()));
    console.log('Schedulers:', (await queue.getJobSchedulers()).map(({ key, name }) => ({ key, name })));
    console.log('Jobs:', (await queue.getJobs()).map(({ id, name }) => ({ id, name })));
    if (mode === 'dry-run') return;

    assert.equal(await queue.getActiveCount(), 0, 'Active jobs remain');
    assert.equal(await queue.getWaitingChildrenCount(), 0, 'Flow dependencies remain');
    for (const key of target) {
      if (await redis.type(key) !== 'hash') continue;
      const parent = await redis.hgetBuffer(key, 'parentKey');
      assert.ok(!parent?.length || isQueueKey(parent), 'External parent job found');
    }
    const unrelated = await fingerprint(before.filter((key) => !isQueueKey(key)));
    await queue.obliterate();
    const after = await keys();
    assert.deepEqual(after.filter(isQueueKey).map((key) => key.toString()), [], 'Queue keys remain');
    assert.deepEqual(await fingerprint(after), unrelated, 'Unrelated Redis data changed');
    console.log(`Queue removed. Verified ${unrelated.length} unrelated DB 0 keys.`);
  } finally {
    await queue?.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => redis.disconnect());
```

**Destructive step and confirmation.** Apply calls BullMQ's `obliterate()`
on the targeted queue, permanently removing its jobs and schedulers. Review the
dry run's queue, DB, keys, schedulers and jobs. Verify the Redis identity, then
type the exact confirmation only if the inventory matches.

```bash
cleanup_queue() {
  docker run --rm -i --network "${compose_network:?Set the Compose network}" \
    -e REDIS_HOST -e REDIS_PORT -e REDIS_PASSWORD \
    --entrypoint node "${old_image:?Set the old backend image ID}" - "$@" \
    < "$recovery/cleanup-backup-queue.cjs"
}

cleanup_queue dry-run
# Set run_id to the verified Redis runId from the dry run.
read -rp 'Confirm by typing delete bull:backup-queue in DB 0: ' confirmation
cleanup_queue apply "$confirmation" "${run_id:?Set the verified Redis runId}"
```

**Checkpoint.** Proceed when the command reports that the queue is absent and the unrelated
keys match. Repeat the dry run and apply against the same instance to check
that subsequent runs report no changes. If active jobs, dependencies, or
leftover keys are reported, stop and investigate the listed state.

A PostgreSQL rollback alone cannot restore the deleted Redis jobs. On startup
the compatible old app recreates schedulers for enabled rows with valid cron
settings. One-off and completed jobs remain removed.

## Preserve PG18 and initialize PG19

Run `old stop postgres` and confirm clean shutdown in the PostgreSQL logs.
**Destructive steps and confirmation.** Confirm the stopped container and
inspect the source and destinations. Approve the removal of the empty PG19
directories (if present) and the PG18 directory rename before running the block.
The following commands assume the repository's local Alpine layout and use
`sudo` to read PG18's mode-`700` data directory as root. Run the block only as
its [handoff script](#operator-handoff-for-root-blocks).

If PG19 previously refused to start against the unrenamed directory, stop that
container first. Verify the root `PG_VERSION` still reports 18. If both
`19/docker/` and `19/` were left behind, confirm `19/docker/` has no entries
and `19/` contains only that empty directory. Stop if either is a symlink
or contains unexpected data. Remove the directories with `rmdir`, starting
with the child, so a nonempty directory is refused even if state changes.

```bash
test "$(sudo cat ./data/postgres/PG_VERSION)" = 18 ||
  { printf 'Active data directory must be PG18\n' >&2; exit 1; }
for path in ./data/postgres-18-preupgrade{,.tar,.tar.sha256}; do
  if [[ -e "$path" || -L "$path" ]]; then
    printf 'Preservation destination already exists: %s\n' "$path" >&2
    exit 1
  fi
done
if sudo test -e ./data/postgres/19 || sudo test -L ./data/postgres/19; then
  sudo test ! -L ./data/postgres/19 ||
    { printf '19 must not be a symlink\n' >&2; exit 1; }
  sudo test ! -L ./data/postgres/19/docker ||
    { printf '19/docker must not be a symlink\n' >&2; exit 1; }
  parent_entries=$(sudo find ./data/postgres/19 -mindepth 1 -maxdepth 1 -print)
  child_entries=$(sudo find ./data/postgres/19/docker -mindepth 1 -maxdepth 1 -print)
  test "$parent_entries" = ./data/postgres/19/docker ||
    { printf 'Unexpected entries in 19\n' >&2; exit 1; }
  test -z "$child_entries" ||
    { printf '19/docker must be empty\n' >&2; exit 1; }
  sudo rmdir ./data/postgres/19/docker ./data/postgres/19
fi

sudo mv -T ./data/postgres ./data/postgres-18-preupgrade
(
  set -o noclobber
  sudo tar --numeric-owner -cpf - -C ./data postgres-18-preupgrade > ./data/postgres-18-preupgrade.tar
  sha256sum ./data/postgres-18-preupgrade.tar > ./data/postgres-18-preupgrade.tar.sha256
)
sha256sum -c ./data/postgres-18-preupgrade.tar.sha256
mkdir -m 700 ./data/postgres
sudo chown 70:70 ./data/postgres
```

If archive creation fails after the rename, keep both clusters stopped.
Confirm the saved PG18 directory is intact and finish the archive and checksum
before starting PG19. Preserve any partial files under separate private names.

**Checkpoint.** Inspect the archive with `tar --numeric-owner -tvf`. Require numeric ownership,
original modes, and a PG18 control directory in the archive. Treat the archive
and its checksum as private operator-owned files outside version control.
Leave the renamed directory offline.

Verify the new Compose configuration mounts
`./data/postgres:/var/lib/postgresql` without a `PGDATA` override. Set the
same bootstrap username and database credentials and retain
`--encoding=UTF8 --locale=C`. For the first start, initialize only the maintenance
database so `pg_restore --create` can create `erp_db` with its original
properties. In the repository Compose files, run
`DATABASE_NAME=postgres new up -d --wait postgres`. If the deployment's pinned
Compose config sets the database literally, use a temporary postgres-only
override that sets `POSTGRES_DB=postgres` and adjusts its health check to use
`postgres`. Inspect the bind mount and permissions with
`docker inspect` and `new exec -T postgres stat -c '%u %a %n' /var/lib/postgresql/19/docker`.
Expect owner UID 70 and mode 700 for the pinned Alpine image. Verify
`SHOW server_version` reports 19 and `SHOW data_directory` reports
`/var/lib/postgresql/19/docker`. Stop if the cluster is not fresh or any
check differs.

## Restore globals, then the database

Confirm `postgres` on `$compose_network` now points to the intended fresh PG19
cluster. Stop if its version, data path, database inventory, role, or
checksums differ from the guarded expectations below. For a test restore, change `compose_network` only inside a subshell
so the main session retains the deployment network.

```bash
target_version=$(pg_sql -d postgres -Atc 'SHOW server_version_num')
test "$((target_version / 10000))" -eq 19 ||
  { printf 'Restore target must be PG19\n' >&2; exit 1; }
target_data=$(pg_sql -d postgres -Atc 'SHOW data_directory')
test "$target_data" = /var/lib/postgresql/19/docker ||
  { printf 'Unexpected PG19 data directory\n' >&2; exit 1; }
target_databases=$(pg_sql -d postgres -Atc 'SELECT datname FROM pg_database ORDER BY datname COLLATE "C"')
test "$target_databases" = $'postgres\ntemplate0\ntemplate1' ||
  { printf 'Restore target must contain only maintenance and template databases\n' >&2; exit 1; }
(cd "$recovery" && sha256sum -c SHA256SUMS)
test "$(pg_sql -d postgres -Atc "SELECT rolname FROM pg_roles WHERE rolname = 'erp_user' AND rolsuper")" = erp_user ||
  { printf 'erp_user must be a bootstrap superuser\n' >&2; exit 1; }
bootstrap_create=$(grep -Ei '^[[:space:]]*create[[:space:]]+role[[:space:]]+("erp_user"|erp_user)([[:space:];]|$)' "$recovery/globals.sql" || true)
test "$bootstrap_create" = 'CREATE ROLE "erp_user";' ||
  { printf 'Expected exactly one canonical CREATE ROLE for erp_user\n' >&2; exit 1; }
(
  set -o noclobber
  cd "$recovery"
  if [[ ! -e globals.filtered.sql && ! -L globals.filtered.sql ]]; then
    awk '$0 != "CREATE ROLE \"erp_user\";"' globals.sql > globals.filtered.sql
    sha256sum globals.filtered.sql > globals.filtered.sha256
  fi
  sha256sum -c globals.filtered.sha256
  awk '$0 != "CREATE ROLE \"erp_user\";"' globals.sql | cmp -s - globals.filtered.sql ||
    { printf 'Filtered globals differ from the exact role filter\n' >&2; exit 1; }
)
pg_sql -d postgres --single-transaction -f - < "$recovery/globals.filtered.sql"
pg19 pg_restore --exit-on-error --create -h postgres -U erp_user -d postgres < "$recovery/erp_db.dump"
```

The filter omits only the already bootstrapped role's exact quoted CREATE
statement. A missing, repeated, or differently formatted bootstrap statement
stops the procedure. The filtered file retains the original role alterations
and password hash. The restore creates `erp_db` with the original ownership,
privileges and database settings. Require zero errors. Stop and investigate
any restore failure before starting the backend. Retry on a fresh target once
the cause is fixed.

**Checkpoint.** Require a clean globals and database restore and a matching
PG18 baseline before starting the backend.
Return to the normal PG19 Compose configuration for `erp_db` and run
`new up -d --wait postgres`.

**Destructive step and confirmation.** Confirm the matching baseline and
verified PG18 recovery artifacts before running `new up -d backend`. Startup
runs the irreversible Migration that drops `backup_logs`, `backup_schedules`,
and `backup_retention_settings`. Keep ingress and scheduled external jobs
blocked. Stop if startup logs show a Migration failure.

## Compare and reopen

**Checkpoint.** Stop before reopening ingress if any verification check
fails or any difference remains unexplained.

Capture these checks in PG18, on restored PG19 before starting the backend,
and again after the Migration. Save the outputs privately and compare them.
Use the PG19 clients for both versions.

- Capture exact row counts, and sequence values plus `is_called`. For example,
  run the following through `psql -X -v ON_ERROR_STOP=1 -At -d erp_db` on each
  target. Expect one extra `migrations` row and the removal of the three backup
  tables and their rows after the Migration. The `migrations_id_seq` advances
  with that row. The running backend also appends a Redis memory sample on boot
  and periodically thereafter. Record those rows separately from the Migration
  changes, and collect counts before login or other smoke tests write data.
  To confirm the Migration-only delta, run the candidate TypeORM
  `migration:run` against the disposable test restore, leaving its backend
  process stopped, and compare that result to PG18.

  ```sql
  SELECT format('SELECT %L, count(*) FROM %I.%I;', schemaname || '.' || tablename,
                schemaname, tablename)
  FROM pg_tables WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
  ORDER BY schemaname, tablename
  \gexec
  SELECT format('SELECT %L, last_value, is_called FROM %I.%I;',
                schemaname || '.' || sequencename, schemaname, sequencename)
  FROM pg_sequences WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema'
  ORDER BY schemaname, sequencename
  \gexec
  SELECT extname, extversion FROM pg_extension ORDER BY extname;
  ```

- Compare schema-only dumps from `pg_dump --schema-only --quote-all-identifiers`.
  Include `--create` to compare database-level attributes and privileges.
  Normalize away dump version headers and the generated `\restrict` and
  `\unrestrict` lines. Review the diff including ownership and ACLs. Before
  the Migration expect no application schema differences. Afterward expect
  only the three dropped tables and their associated objects.
- Compare custom-role attributes and role settings, using
  `pg_roles` by name (omit OIDs and the masked password column) and
  `pg_db_role_setting` joined to role and database names. Compare memberships
  from `pg_auth_members` by role, member and grantor names, including admin,
  inherit and set options. Built-in roles may differ. Compare database, schema,
  table, sequence and routine privileges using ACLs in the catalogs and the
  schema dumps. Stop for unexpected differences.
- Compare the digest of the stored password hash with
  `SELECT md5(rolpassword) FROM pg_authid WHERE rolname = 'erp_user'` in each
  cluster. Keep the digest private and never select the raw hash into a log.
  Connect over TCP with the existing database credentials.
- Run `new exec -T backend node node_modules/.bin/typeorm migration:show -d dist/config/database.config.js`.
  Require every Migration to be marked applied. Authenticate through the existing
  application login and verify an authenticated request such as `GET /api/auth/me`.
- Check search. `GET /api/search/global` is not strictly read-only: each accepted
  request saves one `search_queries` row as search analytics (query text, user,
  result count and duration). Take the row counts first.
  - **Live API search.** Use `GET /api/search/global?q=<typo>` with a
    misspelling that misses the normal substring search and returns a known
    record through the trigram fallback. Record one new `search_queries` row per
    request as an expected smoke-test write.
  - **Empty live database.** When live data holds no such record, and the
    maintainer approves this path, do not insert records or call the search API.
    Run the following read-only statements on live PG19 through
    `pg_sql -d erp_db -At`.

    ```sql
    BEGIN READ ONLY;
    SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
    SELECT show_limit();
    SELECT similarity('Widget', 'Widgte'), 'Widget' % 'Widgte';
    SELECT c.relname, x.indisvalid, x.indisready, pg_get_indexdef(c.oid)
      FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
      WHERE c.relname LIKE 'idx\_%\_trgm'
      ORDER BY c.relname COLLATE "C";
    ROLLBACK;
    ```

    Between `BEGIN` and `ROLLBACK`, expect `pg_trgm` with the version captured by
    the verification queries above, then `0.3`, then `0.4|t`, then eight
    `idx_*_trgm` rows. Each row reports `t|t` and a `USING gin` definition with
    `gin_trgm_ops`. These live results show that the extension works and that the
    indexes exist and are valid. They do not show application search results or
    the planner's choice of index.

    Search behaviour then rests on disposable API evidence. Record it apart from
    the live results, with its revision and PostgreSQL version.
    [`fuzzy-search.e2e-spec.ts`](../../backend/test/fuzzy-search.e2e-spec.ts)
    covers the trigram fallback by calling the search services, and
    [`search.e2e-spec.ts`](../../backend/test/search.e2e-spec.ts) covers the HTTP
    route with exact terms. Neither sends a misspelling through the route. To
    show that, run the typo request against the seeded rehearsal stack.
- Verify the prior queue cleanup result. Recreate PostgreSQL with
  `new up -d --wait --force-recreate postgres` and recheck the data directory,
  row counts and application connectivity.
- Run the [operational health gate](REDIS_MEMORY_PRESSURE_RUNBOOK.md#interpreting-the-pressure-state)
  using `setup.sh` from the PG19 release checkout. The probe runs inside the
  selected Compose project's backend container. Adjust the URL for a custom
  backend port.

  ```bash
  bash ./setup.sh check-health http://localhost:3001/api/health "$(new ps -q backend)"
  ```

  Reopen ingress and enable external writers only after all checks pass.

## Roll back to PG18

First run the handoff `preflight` again, from the terminal that will run the
rollback scripts. Stop if it reports `STOPPED`.

Block ingress and all database and Redis writers again. Record any writes
accepted on PG19 and arrange their separate recovery before restarting
writers on PG18. Stop the new backend and then PostgreSQL with
`new stop backend` followed by `new stop postgres`. Confirm clean shutdown. Verify the
archive checksum. Confirm the active directory is PG19 and the saved directory
is PG18, and that `./data/postgres-19-rollback` is absent including dangling
symlinks.

**Destructive steps and confirmation.** Approve moving PG19 aside and
reactivating the PG18 directory before running the block. Stop if either major,
the archive checksum, or the rollback destination fails its check. Run the
block only as its [handoff script](#operator-handoff-for-root-blocks).

```bash
test "$(sudo cat ./data/postgres/19/docker/PG_VERSION)" = 19 ||
  { printf 'Active data directory must be PG19\n' >&2; exit 1; }
test "$(sudo cat ./data/postgres-18-preupgrade/PG_VERSION)" = 18 ||
  { printf 'Saved data directory must be PG18\n' >&2; exit 1; }
sha256sum -c ./data/postgres-18-preupgrade.tar.sha256
if [[ -e ./data/postgres-19-rollback || -L ./data/postgres-19-rollback ]]; then
  printf 'Rollback destination already exists\n' >&2
  exit 1
fi
sudo mv -T ./data/postgres ./data/postgres-19-rollback
sudo mv -T ./data/postgres-18-preupgrade ./data/postgres
# Recreate the image-declared volume without inheriting the PG19 bind.
old up -d --wait --renew-anon-volumes postgres
old up -d backend
sha256sum -c ./data/postgres-18-preupgrade.tar.sha256
```

If cutover failed before a PG19 cluster was initialized, keep all services
stopped and inspect the paths before using the rollback commands. If PG18 was
already renamed, identify any partial PG19 files from the failed startup and
set them aside, then move the verified saved PG18 directory back. If PG18 was
never renamed, verify its path and version and leave it in place.

**Checkpoint.** Require a matching archive checksum, a healthy backend,
PostgreSQL and Redis, and the expected Redis schedulers before reopening
ingress. Use the pinned pre-upgrade application and old Compose environment,
including the old image and `PGDATA`. Verify the PG18 version.

### Verify restored PG18 mounts

From the deployment directory, verify that the PG18 container has exactly two
mounts under `/var/lib/postgresql`: an anonymous Docker volume at the parent
path and the restored host bind at `/var/lib/postgresql/data/pgdata`. Also
verify that `./data/postgres/data` is absent. Run the host check with root
permissions so an unreadable data directory cannot hide a leftover mountpoint.
Stop with ingress blocked if either check fails. Run the block only as its
[handoff script](#operator-handoff-for-root-blocks).

```bash
(
  set -euo pipefail
  pg18_container=$(old ps -q postgres)
  restored_bind=$(realpath -e ./data/postgres)
  parent_volume=$(
    docker inspect "$pg18_container" |
      jq -er --arg source "$restored_bind" '
      .[0].Mounts
      | map(select(.Destination == "/var/lib/postgresql" or
                   (.Destination | startswith("/var/lib/postgresql/"))))
      | select(length == 2 and
               any(.[]; .Destination == "/var/lib/postgresql/data/pgdata"
                   and .Type == "bind" and .Source == $source))
      | .[]
      | select(.Destination == "/var/lib/postgresql" and .Type == "volume")
      | .Name
      '
  ) || { printf 'Unexpected PG18 PostgreSQL mounts\n' >&2; exit 1; }
  docker volume inspect "$parent_volume" |
    jq -e '.[0].Labels | type == "object" and has("com.docker.volume.anonymous")'
  sudo sh -ec 'test -d ./data/postgres && test -x ./data/postgres &&
    test ! -e ./data/postgres/data && test ! -L ./data/postgres/data'
)
```

Wait for `old ps backend` to show the backend container as healthy. Then run
the [operational health gate](REDIS_MEMORY_PRESSURE_RUNBOOK.md#interpreting-the-pressure-state)
using `setup.sh` from the PG19 release checkout. The probe runs inside the
restored PG18 backend container. Adjust the URL for a custom backend port.

```bash
bash ./setup.sh check-health http://localhost:3001/api/health "$(old ps -q backend)"
```

If Redis reports a transient connection-state error, wait about 30 seconds
before rerunning the gate. Stop and investigate a persistent error or a warm-up
timeout. Keep ingress blocked until the gate passes. PG18 startup writes into
the restored directory. Retain the pristine archive, both globals files, the
database dump and their checksums.

The old backend recreates Redis schedulers only for enabled
`backup_schedules` rows with valid cron expressions and disables rows with
invalid cron expressions. Disabled schedules stay disabled. Deleted job
history and one-off jobs, including delayed manual jobs, remain absent.
Inventory Redis using the pre-upgrade image and compare with the old database
schedule rows before returning the stack to service. Retain the PG18
directory, PG19 rollback directory, dumps, pristine archive, host backup
archives, and anonymous volume pending explicit approval for disposal.

## Interim manual backup and recovery

Until the replacement backup feature is available, use the official image's
clients. Quiesce writers and use
`recovery=$(mktemp -d "${RECOVERY_ROOT:?}/erp-pg19-backup.XXXXXX")` to create a
new private directory for each backup. Follow [Dump and validate](#dump-and-validate)
with the running server reachable as `postgres`. Keep a checksummed copy of
the database dump and original globals on separate storage with the same
restrictive ownership and modes. Test recovery to a fresh private PG19
cluster as described in [Restore globals, then the database](#restore-globals-then-the-database).
**Checkpoint.** Stop if the restore, checksums, or application checks fail.
Use the compatible application to verify Migrations, login and representative
records there before a recovery cutover. For a backup taken after the upgrade,
boot the PG19-compatible app. To recover the removed backup tables, use the
preserved pre-upgrade materials with the matching pre-upgrade release and
PG18 from [Roll back to PG18](#roll-back-to-pg18).
