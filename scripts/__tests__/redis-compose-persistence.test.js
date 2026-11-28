const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

// Redis holds no data that must survive a restart (#2108). Monitoring history and
// alert state live in PostgreSQL, so both Compose files run Redis with RDB and AOF off.
const composeFiles = ['docker-compose.yml', 'docker-compose.prod.yml'];

function redisService(relativePath) {
  const compose = parse(fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8'));
  return compose.services.redis;
}

// Compose splits `command` with shell quoting, so `""` is one empty argument.
function commandArgs(command) {
  return command
    .trim()
    .split(/\s+/)
    .map((token) => (token === '""' ? '' : token));
}

function optionValues(args, name) {
  return args.flatMap((arg, index) => (arg === name ? [args[index + 1]] : []));
}

for (const file of composeFiles) {
  test(`${file}: Redis disables RDB snapshots and AOF`, () => {
    const args = commandArgs(redisService(file).command);

    assert.deepEqual(optionValues(args, '--save'), ['']);
    assert.deepEqual(optionValues(args, '--appendonly'), ['no']);
  });

  test(`${file}: Redis keeps the memory cap, eviction policy and authentication`, () => {
    const service = redisService(file);
    const args = commandArgs(service.command);

    assert.deepEqual(optionValues(args, '--maxmemory'), ['256mb']);
    assert.deepEqual(optionValues(args, '--maxmemory-policy'), ['noeviction']);
    assert.deepEqual(optionValues(args, '--requirepass'), ['${REDIS_PASSWORD}']);
    assert.equal(args[0], 'redis-server');
  });

  test(`${file}: Redis keeps its health check, resource limits, security and logging`, () => {
    const service = redisService(file);

    assert.deepEqual(service.healthcheck.test, ['CMD', 'redis-cli', '--pass', '${REDIS_PASSWORD}', 'ping']);
    assert.deepEqual(service.deploy.resources.limits, { cpus: '0.5', memory: '512M' });
    assert.deepEqual(service.deploy.resources.reservations, { cpus: '0.25', memory: '256M' });
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert.equal(service.logging.driver, 'json-file');
  });

  test(`${file}: Redis has no data bind mount`, () => {
    const service = redisService(file);
    const volumes = service.volumes ?? [];

    assert.equal(
      volumes.some((volume) => String(volume).includes('/data')),
      false,
      'Redis data must not be bind-mounted; old host files are never loaded or deleted',
    );
  });
}

test('development and production Redis commands are identical', () => {
  assert.deepEqual(
    commandArgs(redisService('docker-compose.yml').command),
    commandArgs(redisService('docker-compose.prod.yml').command),
  );
});
