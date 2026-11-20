// Script-level tests for deployment readiness (#1959): the real deploy.sh and
// the deployment checklist's readiness snippet, run against stubbed docker and
// curl so no stack is built.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

// docker: logs every call; `compose ... ps --format` prints a health status
// (REDIS_HEALTH / POSTGRES_HEALTH, default healthy); plain `compose ... ps`
// prints STUB-PS; everything else succeeds.
// curl: logs the URL; prints FAIL_CODE (and exits FAIL_EXIT) for FAIL_URL,
// otherwise 200.
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-readiness-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const work = path.join(dir, 'work');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(work, 'scripts/lib'), { recursive: true });
  fs.copyFileSync(path.join(root, 'deploy.sh'), path.join(work, 'deploy.sh'));
  fs.chmodSync(path.join(work, 'deploy.sh'), 0o755);
  fs.copyFileSync(path.join(root, 'scripts/lib/wait-ready.sh'), path.join(work, 'scripts/lib/wait-ready.sh'));
  fs.copyFileSync(path.join(root, '.env.example'), path.join(work, '.env.example'));
  const stub = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  stub('docker', `
    printf '%s\\n' "$*" >> "$TRACE"
    if [[ "$*" == *" ps --format "* ]]; then
      case "$*" in
        *redis) echo "\${REDIS_HEALTH:-healthy}" ;;
        *postgres) echo "\${POSTGRES_HEALTH:-healthy}" ;;
        *) echo healthy ;;
      esac
    elif [[ "$*" == *" ps"* ]]; then
      echo STUB-PS
    fi
    exit 0
  `);
  stub('curl', `
    url="\${@: -1}"
    printf '%s\\n' "$url" >> "$CURL_TRACE"
    if [ "$url" = "\${FAIL_URL:-}" ]; then
      printf '%s' "\${FAIL_CODE:-503}"
      exit "\${FAIL_EXIT:-0}"
    fi
    printf '200'
  `);
  const env = extra => ({
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    TRACE: path.join(dir, 'docker.trace'),
    CURL_TRACE: path.join(dir, 'curl.trace'),
    READY_TIMEOUT: '2',
    ...extra,
  });
  const read = f => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');
  return {
    deploy(extra = {}) {
      const r = spawnSync('./deploy.sh', ['deploy'], { cwd: work, encoding: 'utf8', timeout: 30000, env: env(extra) });
      return { status: r.status, out: r.stdout + r.stderr };
    },
    bash(script, extra = {}, flags = []) {
      const r = spawnSync('bash', [...flags, '-c', script], { cwd: work, encoding: 'utf8', timeout: 60000, env: env(extra) });
      return { status: r.status, out: r.stdout + r.stderr };
    },
    dockerCalls: () => read('docker.trace'),
    curlUrls: () => read('curl.trace').split('\n').filter(Boolean),
  };
}

test('deploy.sh pulls only non-buildable images and probes both Ingress URLs', t => {
  const f = fixture(t);
  const r = f.deploy();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /All services are ready/);
  assert.match(f.dockerCalls(), /compose .* pull --ignore-buildable$/m);
  assert.match(f.dockerCalls(), /compose .* ps --format \{\{\.Health\}\} postgres$/m);
  assert.match(f.dockerCalls(), /compose .* ps --format \{\{\.Health\}\} redis$/m);
  assert.deepEqual(f.curlUrls(), ['http://localhost/api/health', 'http://localhost/']);
});

for (const [label, extra, message] of [
  ['backend probe fails', { FAIL_URL: 'http://localhost/api/health' }, /No HTTP 200 from http:\/\/localhost\/api\/health within 2s \(last status: 503\)/],
  ['frontend probe fails', { FAIL_URL: 'http://localhost/' }, /No HTTP 200 from http:\/\/localhost\/ within 2s \(last status: 503\)/],
  ['backend transfer is cut off', { FAIL_URL: 'http://localhost/api/health', FAIL_CODE: '200', FAIL_EXIT: '18' }, /last status: 200, curl exit 18/],
  ['Redis never becomes healthy', { REDIS_HEALTH: 'starting' }, /Redis not ready within 2s/],
  ['PostgreSQL never becomes healthy', { POSTGRES_HEALTH: 'unhealthy' }, /PostgreSQL not ready within 2s/],
]) {
  test(`deploy.sh fails with diagnostics when the ${label}`, t => {
    const f = fixture(t);
    const r = f.deploy(extra);
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, message);
    assert.match(r.out, /STUB-PS/);
    assert.doesNotMatch(r.out, /All services are ready/);
  });
}

// --- Deployment checklist snippet ------------------------------------------

const checklist = fs.readFileSync(path.join(root, 'docs/deployment/DEPLOYMENT_CHECKLIST.md'), 'utf8');
const snippet = checklist.match(/\*\*Ingress Readiness Check\*\*[^\n]*\n```bash\n([\s\S]*?)```/)[1];

for (const flags of [[], ['-e']]) {
  const mode = flags.length ? 'under set -e' : 'without set -e';

  test(`checklist snippet passes on two 200s (${mode})`, t => {
    const f = fixture(t);
    const r = f.bash(snippet, {}, flags);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /OK: http:\/\/localhost\/api\/health\nOK: http:\/\/localhost\/\n/);
  });

  for (const [label, extra, status] of [
    ['a connection failure', { FAIL_URL: 'http://localhost/', FAIL_CODE: '000', FAIL_EXIT: '7' }, '000'],
    ['a non-200 status', { FAIL_URL: 'http://localhost/api/health', FAIL_CODE: '502' }, '502'],
    ['a cut-off 200', { FAIL_URL: 'http://localhost/', FAIL_CODE: '200', FAIL_EXIT: '18' }, '200'],
  ]) {
    test(`checklist snippet reports ${label} and returns 1 (${mode})`, t => {
      const f = fixture(t);
      const r = f.bash(snippet, extra, flags);
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, new RegExp(`FAIL: ${extra.FAIL_URL.replace(/\//g, '\\/')} \\(status ${status}\\)`));
      assert.match(r.out, /STUB-PS/);
    });
  }
}
