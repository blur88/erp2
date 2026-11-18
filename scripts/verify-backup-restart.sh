#!/usr/bin/env bash
# Verify saved backup schedule recovery on production-image restart (#1923).
set -euo pipefail

invalid_id=19230000-0000-4000-8000-000000000001
valid_id=19230000-0000-4000-8000-000000000002

# This database belongs to migrations-fresh-db's disposable service. Bypass the
# DTO deliberately: a saved expression from an older parser must survive boot.
psql_ci() {
  docker run --rm -i --network host -e PGPASSWORD=erp_ci_password \
    postgres:18.3-alpine psql -X -v ON_ERROR_STOP=1 \
    -h localhost -U erp_ci -d erp_fresh "$@"
}

psql_ci <<SQL
INSERT INTO backup_schedules (id, name, "cronExpression", enabled, "nextRunAt")
VALUES ('$invalid_id', 'ci-invalid-cron', '0 0 * * 1-5L', true, '2099-01-01'),
       ('$valid_id', 'ci-valid-cron', '0 0 1 1 *', true, '2099-01-01');
SQL

docker restart --timeout 10 erp_ci_backend
# Docker's actual start timestamp excludes all output from the pristine boot,
# including shutdown output; retain its nanosecond precision for --since.
started_at=$(docker inspect --format '{{.State.StartedAt}}' erp_ci_backend)

for attempt in $(seq 1 60); do
  code=$(curl --connect-timeout 1 --max-time 2 -s -o /dev/null -w '%{http_code}' \
    http://localhost:3001/api/health || true)
  if [ "$code" = 200 ]; then
    echo "healthy after restart probe $attempt"
    break
  fi
  sleep 1
done
if [ "$code" != 200 ]; then
  echo '::error::application never became healthy after schedule recovery restart' >&2
  exit 1
fi

restart_logs=$(docker logs --since "$started_at" erp_ci_backend 2>&1)
if ! grep -Fq "$invalid_id" <<< "$restart_logs"; then
  echo '::error::invalid schedule ID missing from post-restart logs' >&2
  exit 1
fi

recovered=$(psql_ci -tAc \
  "SELECT NOT enabled AND \"nextRunAt\" IS NULL FROM backup_schedules WHERE id = '$invalid_id';")
if [ "$recovered" != t ]; then
  echo '::error::invalid schedule was not disabled with a null nextRunAt' >&2
  exit 1
fi

# Use the image's installed BullMQ to read the scheduler from the same Redis
# as the app, without depending on BullMQ's private key representation.
docker exec -i erp_ci_backend node - "$valid_id" <<'JS'
const { Queue } = require('bullmq');
(async () => {
  const queue = new Queue('backup-queue', {
    connection: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
  });
  try {
    const scheduler = await queue.getJobScheduler(`schedule-${process.argv[2]}`);
    if (!scheduler) throw new Error('Valid backup scheduler missing from Redis');
  } finally {
    await queue.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS

echo 'Backup schedule restart recovery verified'
