// deploy.sh and setup.sh wait for the Ingress, the only published entry point
// (#1959, ADR 0003): HTTP 200 from http://localhost/api/health and
// http://localhost/, within a time limit, naming the failing URL on timeout.
//
// docker and curl are stubs on PATH; sleep is real, so the time bound is too.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '../..');
const HEALTH = 'http://localhost/api/health';
const ROOT = 'http://localhost/';

function fixture(t, script) {
  const dir = mkdtempSync(path.join(tmpdir(), 'readiness-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const work = path.join(dir, 'work');
  mkdirSync(bin);
  mkdirSync(work);
  const command = (name, body) => writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });

  // Bind-mounted dirs left by a previous run belong to the container user, so
  // chmod on them fails for the invoking user.
  command('chmod', 'echo "chmod: changing permissions: Operation not permitted" >&2; exit 1');
  // In the dev stack (the override file is in play) `compose pull` exits
  // non-zero for build-only images (erp-backend etc.) unless told to skip
  // them, as real Compose does. The prod stack is all prebuilt images.
  command('docker', `
    printf '%s\\n' "$*" >> "$TRACE"
    if [[ " $* " == *" pull "* && "$*" == *docker-compose.override.yml* && " $* " != *" --ignore-buildable "* ]]; then
      echo 'pull access denied for erp-backend' >&2; exit 1
    fi
    exit 0`);
  // The last argument is the URL. CODE_<n> is the status served for the nth
  // request to that URL; CODE_DEFAULT_<key> after that. key: HEALTH | ROOT.
  command('curl', `
    url="\${@: -1}"
    printf '%s\\n' "$url" >> "$CURLS"
    case "$url" in
      ${HEALTH}) key=HEALTH ;;
      ${ROOT}) key=ROOT ;;
      *) key=OTHER ;;
    esac
    n=$(grep -c -x -F "$url" "$CURLS")
    seq_var="SEQ_$key"
    code="\${!seq_var:-200}"
    IFS=, read -ra codes <<< "$code"
    idx=$((n - 1)); [ "$idx" -ge "\${#codes[@]}" ] && idx=$((\${#codes[@]} - 1))
    printf '%s' "\${codes[$idx]}"
  `);

  copyFileSync(path.join(repo, script), path.join(work, script));
  if (script === 'deploy.sh') {
    writeFileSync(path.join(work, '.env.example'), 'NODE_ENV=development\n');
  } else {
    writeFileSync(path.join(work, 'docker-compose.prod.yml'), 'services: {}\n');
    writeFileSync(path.join(work, '.env'), 'NODE_ENV=production\n');
  }

  return {
    run(env = {}) {
      return spawnSync('bash', [script, script === 'deploy.sh' ? 'deploy' : 'setup'], {
        cwd: work, encoding: 'utf8', timeout: 30000,
        env: {
          ...process.env, PATH: `${bin}:${process.env.PATH}`,
          TRACE: path.join(dir, 'trace'), CURLS: path.join(dir, 'curls'),
          READY_TIMEOUT: '2', READY_INTERVAL: '1', ...env,
        },
      });
    },
    curls: () => (existsSync(path.join(dir, 'curls')) ? readFileSync(path.join(dir, 'curls'), 'utf8').trim().split('\n') : []),
    trace: () => (existsSync(path.join(dir, 'trace')) ? readFileSync(path.join(dir, 'trace'), 'utf8') : ''),
  };
}

for (const script of ['deploy.sh', 'setup.sh']) {
  test(`${script} finishes once the Ingress serves /api/health and /`, t => {
    const f = fixture(t, script);
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual([...new Set(f.curls())].sort(), [HEALTH, ROOT].sort());
  });

  test(`${script} never probes the unpublished 3000, 3001 or 8080 ports`, t => {
    const f = fixture(t, script);
    f.run();
    assert.ok(f.curls().length >= 2);
    assert.doesNotMatch(f.curls().join('\n'), /:(3000|3001|8080)/);
  });

  test(`${script} keeps waiting while the Ingress is still coming up`, t => {
    const f = fixture(t, script);
    const result = f.run({ SEQ_HEALTH: '000,502,200', SEQ_ROOT: '503,200', READY_TIMEOUT: '10' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(f.curls().filter(u => u === HEALTH).length, 3);
  });

  for (const [name, env, failing] of [
    ['the API health check returns 503', { SEQ_HEALTH: '503' }, HEALTH],
    ['the API health check is unreachable', { SEQ_HEALTH: '000' }, HEALTH],
    ['the web app returns 404', { SEQ_ROOT: '404' }, ROOT],
    ['the web app redirects instead of answering 200', { SEQ_ROOT: '301' }, ROOT],
  ]) {
    test(`${script} fails within its time limit, naming the URL, when ${name}`, t => {
      const f = fixture(t, script);
      const started = Date.now();
      const result = f.run(env);
      const elapsed = Date.now() - started;
      const output = result.stdout + result.stderr;

      assert.notEqual(result.status, 0, output);
      assert.equal(result.signal, null, 'must finish on its own');
      assert.ok(elapsed < 15000, `took ${elapsed}ms with READY_TIMEOUT=2`);
      assert.ok(output.includes(`${failing} did not return HTTP 200`), output);
      if (failing === HEALTH) assert.ok(!output.includes(`${ROOT} did not return`), output);
      assert.match(f.trace(), /compose .* ps\b/, 'reports docker compose ps');
    });
  }
}
