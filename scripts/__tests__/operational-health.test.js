const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { createServer } = require('node:http');
const { join, resolve } = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const setup = resolve(__dirname, '../../setup.sh');
const healthy = {
  status: 'healthy',
  services: {
    backend: { status: 'healthy' },
    database: { status: 'healthy' },
    redis: { status: 'healthy' },
  },
};
const warming = {
  status: 'degraded',
  services: {
    ...healthy.services,
    redis: { status: 'degraded', pressure: { reason: 'insufficient-samples' } },
  },
};

async function serve(t, responses, sleep = ':') {
  let requests = 0;
  const server = createServer((_, res) => {
    const [status, body] = responses[Math.min(requests++, responses.length - 1)];
    const wire = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status).end(wire);
  });
  t.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  return {
    url,
    requests: () => requests,
    check: (...args) => exec(
      'bash', [setup, 'check-health', url, ...args],
      {
        env: {
          ...process.env,
          'BASH_FUNC_sleep%%': `() { ${sleep}; }`,
          'BASH_FUNC_docker%%': '() { [[ $1 == exec && $2 == isolated-backend && $3 == curl ]] || return 1; shift 2; "$@"; }',
        },
        timeout: 5000,
      },
    ),
  };
}

test('operational health accepts a healthy HTTP response', async (t) => {
  const body = {
    ...healthy,
    message: 'Redis connecté. Quoted strings can contain "NaN", backslashes (\\), and line breaks (\n).',
    uptime: 0.01,
    readings: [-0.1, 1e-8, 1e23],
  };
  const probe = await serve(t, [[200, body]]);
  const { stdout } = await probe.check();
  assert.match(stdout, /Backend, database and Redis are healthy/);
  assert.equal(probe.requests(), 1);
});

const unhealthy = {
  status: 'unhealthy',
  services: {
    ...healthy.services,
    redis: {
      status: 'unhealthy',
      message: 'Redis error: Redis is already connecting/connected',
      memory: null,
      pressure: null,
    },
  },
};

for (const [name, status, body, diagnostic] of [
  ['unhealthy Redis', 200, unhealthy, /redis=unhealthy/],
  ['unhealthy Redis with a warm-up reason', 200, {
    ...unhealthy,
    services: { ...healthy.services, redis: { ...warming.services.redis, status: 'unhealthy' } },
  }, /redis=unhealthy/],
  ['unhealthy database during Redis warm-up', 200, {
    ...warming,
    status: 'unhealthy',
    services: { ...warming.services, database: { status: 'unhealthy' } },
  }, /database=unhealthy/],
  ['missing aggregate status', 200, { services: healthy.services }, /status=missing/],
  ['missing database status', 200, { ...healthy, services: { ...healthy.services, database: {} } }, /database=missing/],
  ['unsuccessful HTTP request', 503, healthy, /Health request failed/],
  ['redirect without a successful response', 302, healthy, /HTTP 302/],
  ['non-JSON response', 200, '<html>starting</html>', /Invalid health JSON/],
  ['a NUL byte in the response', 200, JSON.stringify(healthy) + '\0', /Invalid health JSON/],
  ...['NaN', 'Infinity', '+1', '01', '1.'].map((value) => [
    `the non-JSON numeric token ${value}`, 200,
    JSON.stringify({ ...healthy, uptime: 0 }).replace('"uptime":0', `"uptime":${value}`),
    /Invalid health JSON/,
  ]),
  ['invalid UTF-8 in a JSON string', 200, Buffer.concat([
    Buffer.from(JSON.stringify(healthy).slice(0, -1) + ',"message":"'),
    Buffer.from([0xff]),
    Buffer.from('"}'),
  ]), /Invalid health JSON: response must use UTF-8/],
  ['multiple JSON values', 200, JSON.stringify(unhealthy) + '\n' + JSON.stringify(healthy), /Invalid health JSON/],
]) {
  test(`operational health rejects ${name}`, async (t) => {
    const probe = await serve(t, [[status, body]]);
    await assert.rejects(probe.check(), { code: 1, stderr: diagnostic });
    assert.equal(probe.requests(), 1);
  });
}

test('operational health rejects a refused connection', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  await promisify(server.close.bind(server))();

  await assert.rejects(
    exec('bash', [setup, 'check-health', url], { timeout: 5000 }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /curl: \(7\)/);
      assert.match(error.stderr, /Health request failed \(HTTP 000\)/);
      return true;
    },
  );
});

test('the warm-up reason from the issue retries until healthy', async (t) => {
  const probe = await serve(t, [[200, warming], [200, healthy]]);
  const result = await probe.check();
  assert.match(result.stderr, /Waiting for Redis pressure samples/);
  assert.match(result.stdout, /Backend, database and Redis are healthy/);
  assert.equal(probe.requests(), 2);
});

test('the backend warm-up state with a null reason retries until healthy', async (t) => {
  const actualWarmup = {
    ...warming,
    services: {
      ...healthy.services,
      redis: { status: 'degraded', pressure: { state: 'insufficient-samples', reason: null } },
    },
  };
  const probe = await serve(t, [[200, actualWarmup], [200, healthy]]);
  await probe.check();
  assert.equal(probe.requests(), 2);
});

test('Redis warm-up fails after the ten-minute window', async (t) => {
  const probe = await serve(t, [[200, warming]], 'SECONDS=$((SECONDS + 600))');
  await assert.rejects(probe.check(), { code: 1, stderr: /Redis warm-up timed out/ });
  assert.equal(probe.requests(), 1);
});

test('operational health uses the selected backend container', async (t) => {
  const probe = await serve(t, [[200, healthy]]);
  const result = await probe.check('isolated-backend');
  assert.match(result.stdout, /Backend, database and Redis are healthy/);
  assert.equal(probe.requests(), 1);
});

test('a missing container ID fails without trying the host URL', async (t) => {
  const probe = await serve(t, [[200, healthy]]);
  await assert.rejects(probe.check(''), { code: 1, stderr: /explicit backend container ID/ });
  assert.equal(probe.requests(), 0);
});

for (const script of ['setup.sh', 'deploy.sh']) {
  for (const payload of [healthy, unhealthy]) {
    test(`${script} requires operational health before announcing deployment success (${payload.status})`, async (t) => {
      const probe = await serve(t, [[200, payload]]);
      const cwd = mkdtempSync(join(tmpdir(), 'erp-health-deploy-'));
      t.after(() => rmSync(cwd, { recursive: true, force: true }));
      writeFileSync(join(cwd, '.env'), '');
      writeFileSync(join(cwd, 'docker-compose.prod.yml'), '');
      const run = exec('bash', [resolve(__dirname, '../../', script)], {
        cwd,
        env: {
          ...process.env,
          HEALTH_FIXTURE_URL: probe.url,
          'BASH_FUNC_docker%%': '() { echo "docker $*"; }',
          'BASH_FUNC_curl%%': '() { if [[ " $* " == *" --write-out "* ]]; then command curl "${@:1:$#-1}" "$HEALTH_FIXTURE_URL"; fi; }',
        },
        timeout: 5000,
      });

      if (payload === healthy) {
        const { stdout } = await run;
        assert.match(stdout, /ERP System deployed successfully/);
      } else {
        await assert.rejects(run, (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, /redis=unhealthy/);
          assert.doesNotMatch(error.stdout, /ERP System deployed successfully|docker .* down/);
          return true;
        });
      }
      assert.equal(probe.requests(), 1);
    });
  }
}
