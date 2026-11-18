const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-restart-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const command = (name, body) => writeFileSync(path.join(dir, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  command('docker', `
    printf '%s\\n' "$*" >> "$TRACE"
    case "$1" in
      run)
        cat >> "$TRACE"
        if [[ "$*" == *SELECT* ]]; then
          printf '%s\\n' "\${ROW_STATE-t}"
        fi ;;
      restart) exit "\${RESTART_STATUS:-0}" ;;
      inspect) echo '2026-11-18T00:00:00.123456789Z' ;;
      logs)
        if [[ "$*" == *--since* ]]; then
          echo "\${RESTART_LOG:-Failed to initialize backup schedule 19230000-0000-4000-8000-000000000001}"
        else
          echo 'old log: 19230000-0000-4000-8000-000000000001'
        fi ;;
      exec) cat >> "$TRACE"; exit "\${REDIS_STATUS:-0}" ;;
      *) exit 99 ;;
    esac
  `);
  command('curl', 'printf "%s" "${HEALTH_CODE:-200}"');
  command('sleep', 'exit 0');
  return {
    run(env = {}) {
      return spawnSync('bash', ['scripts/verify-backup-restart.sh'], {
        cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TRACE: path.join(dir, 'trace'), ...env },
      });
    },
    trace: () => readFileSync(path.join(dir, 'trace'), 'utf8'),
  };
}

test('seeds enabled schedules and verifies recovery after restarting the existing image', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const trace = f.trace();
  assert.match(trace, /0 0 \* \* 1-5L/);
  assert.match(trace, /restart.*erp_ci_backend/);
  assert.match(trace, /logs --since 2026-11-18T00:00:00\.123456789Z erp_ci_backend/);
  assert.match(trace, /getJobScheduler/);
});

for (const [name, env, message] of [
  ['health never succeeds', { HEALTH_CODE: '503' }, /never became healthy/],
  ['only old logs mention the invalid ID', { RESTART_LOG: 'startup completed' }, /missing from post-restart logs/],
  ['invalid schedule remains enabled', { ROW_STATE: 'f' }, /not disabled with a null nextRunAt/],
  ['invalid schedule row is missing', { ROW_STATE: '' }, /not disabled with a null nextRunAt/],
  ['valid scheduler is absent', { REDIS_STATUS: '1' }, null],
  ['restart fails', { RESTART_STATUS: '1' }, null],
]) {
  test(`fails when ${name}`, t => {
    const f = fixture(t);
    const result = f.run(env);
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(result.signal, null, 'check must finish within its bound');
    if (message) assert.match(result.stderr, message);
  });
}
