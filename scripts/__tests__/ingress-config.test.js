// Regression tests for the Ingress and Frontend server nginx configs and the
// Compose port layout (docs/adr/0003-ingress-only-entry-point.md).
//
// Runs the real nginx/nginx.conf and frontend/nginx.conf in containers on a
// private network. The backend is a stub nginx that answers every request and
// sends Helmet-like security headers, a cache header and CORS, so the tests
// can tell which layer produced each response header.
//
// Needs Docker. Outside CI the suite is skipped when Docker is unavailable;
// in CI (CI=true) a missing Docker fails it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const NGINX_IMAGE = 'nginx:1.30.0-alpine3.23-slim';
const SHARED_SECURITY_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'x-xss-protection',
  'referrer-policy',
];

const dockerAvailable = spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;
if (!dockerAvailable && process.env.CI) {
  throw new Error('ingress-config tests need Docker in CI');
}
const skip = dockerAvailable ? false : 'Docker is not available';

const id = `erp-ingress-test-${process.pid}-${Date.now()}`;
const names = { network: id, backend: `${id}-backend`, frontend: `${id}-frontend`, ingress: `${id}-ingress` };
let workdir;
let base;

function docker(...args) {
  const r = spawnSync('docker', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`);
  }
  return r.stdout.trim();
}

// One request; returns the status and every response header (duplicates kept).
function request(method, urlPath, { headers = {} } = {}) {
  const args = ['-s', '-o', '/dev/null', '-D', '-', '--max-time', '10', '-X', method];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (method === 'POST') args.push('-H', 'Content-Type: application/json', '--data', '{}');
  args.push(`${base}${urlPath}`);
  const r = spawnSync('curl', args, { encoding: 'utf8' });
  const lines = r.stdout.split('\r\n').filter(Boolean);
  const status = Number((lines.shift() || '').split(' ')[1]);
  const list = lines.map(l => {
    const i = l.indexOf(':');
    return [l.slice(0, i).toLowerCase(), l.slice(i + 1).trim()];
  });
  return {
    status,
    all: name => list.filter(([k]) => k === name).map(([, v]) => v),
    one(name) {
      const values = this.all(name);
      assert.equal(values.length, 1, `${method} ${urlPath}: expected one ${name}, got ${JSON.stringify(values)}`);
      return values[0];
    },
  };
}

function waitForIngress() {
  const deadline = Date.now() + 30000;
  for (;;) {
    base = `http://${docker('port', names.ingress, '80').split('\n')[0]}`;
    if (request('GET', '/').status === 200) return;
    if (Date.now() > deadline) throw new Error(`Ingress never answered:\n${docker('logs', names.ingress)}`);
    spawnSync('sleep', ['0.5']);
  }
}

// Restarting nginx discards the limit_req zones, isolating rate-limit tests.
function freshRateLimits() {
  docker('restart', '-t', '1', names.ingress);
  waitForIngress();
}

before(() => {
  if (skip) return;
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingress-test-'));
  fs.chmodSync(workdir, 0o755);
  const html = path.join(workdir, 'html');
  fs.mkdirSync(path.join(html, 'assets'), { recursive: true, mode: 0o755 });
  fs.writeFileSync(path.join(html, 'index.html'), '<!doctype html><script src="/env-config.js"></script>');
  fs.writeFileSync(path.join(html, 'env-config.js'), 'window.__ENV__ = {};');
  fs.writeFileSync(path.join(html, 'assets', 'index-AbC123.js'), 'console.log(1);');
  fs.writeFileSync(path.join(workdir, 'backend.conf'), `
server {
    listen 3001;
    add_header X-Stub backend always;
    add_header X-Frame-Options DENY always;
    add_header Content-Security-Policy "default-src 'none'" always;
    add_header Strict-Transport-Security "max-age=1" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection 0 always;
    add_header Referrer-Policy no-referrer always;
    add_header Cache-Control "private, max-age=7" always;
    add_header Access-Control-Allow-Origin $http_origin always;
    location = /api/missing { return 404; }
    location / {
        if ($request_method = OPTIONS) { return 204; }
        return 200 "stub\\n";
    }
}
`);
  docker('network', 'create', names.network);
  docker('run', '-d', '--name', names.backend, '--network', names.network, '--network-alias', 'backend',
    '-v', `${path.join(workdir, 'backend.conf')}:/etc/nginx/conf.d/default.conf:ro`, NGINX_IMAGE);
  docker('run', '-d', '--name', names.frontend, '--network', names.network, '--network-alias', 'frontend',
    '-v', `${path.join(root, 'frontend/nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
    '-v', `${html}:/usr/share/nginx/html:ro`, NGINX_IMAGE);
  docker('run', '-d', '--name', names.ingress, '--network', names.network, '-p', '127.0.0.1::80',
    '-v', `${path.join(root, 'nginx/nginx.conf')}:/etc/nginx/nginx.conf:ro`, NGINX_IMAGE);
  waitForIngress();
});

after(() => {
  if (skip) return;
  spawnSync('docker', ['rm', '-f', names.ingress, names.frontend, names.backend]);
  spawnSync('docker', ['network', 'rm', names.network]);
  if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
});

const securityProbes = [
  ['client-side route', '/settings/price-lists', 200],
  ['env-config.js', '/env-config.js', 200],
  ['hashed asset', '/assets/index-AbC123.js', 200],
  ['API error', '/api/missing', 404],
  ['upload', '/uploads/logos/logo.png', 200],
];

for (const [label, urlPath, status] of securityProbes) {
  test(`${label}: one Ingress copy of each shared security header`, { skip }, () => {
    const r = request('GET', urlPath);
    assert.equal(r.status, status);
    for (const name of SHARED_SECURITY_HEADERS) r.one(name);
    assert.equal(r.one('x-frame-options'), 'SAMEORIGIN');
    assert.equal(r.one('strict-transport-security'), 'max-age=31536000; includeSubDomains; preload');
    assert.match(r.one('content-security-policy'), /^default-src 'self';/);
  });
}

test('Frontend server cache policy passes through the Ingress', { skip }, () => {
  assert.equal(request('GET', '/settings/price-lists').one('cache-control'), 'no-cache');
  assert.equal(request('GET', '/env-config.js').one('cache-control'), 'no-cache');
  assert.equal(request('GET', '/assets/index-AbC123.js').one('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(request('GET', '/assets/index-AbC123.js').all('expires').length, 0);
});

test('a missing hashed asset is a 404 that is not cached as immutable', { skip }, () => {
  const r = request('GET', '/assets/index-NotBuilt.js');
  assert.equal(r.status, 404);
  assert.equal(r.one('cache-control'), 'no-cache');
});

test('backend cache headers pass through for API responses and uploads', { skip }, () => {
  assert.equal(request('GET', '/api/missing').one('cache-control'), 'private, max-age=7');
  assert.equal(request('GET', '/uploads/logos/logo.png').one('cache-control'), 'private, max-age=7');
});

test('CORS comes only from the backend, including preflight', { skip }, () => {
  const origin = 'http://client.example';
  const preflight = request('OPTIONS', '/api/inventory/products', {
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.one('x-stub'), 'backend', 'preflight was answered by the Ingress, not the backend');
  assert.equal(preflight.one('access-control-allow-origin'), origin);
  assert.equal(request('GET', '/api/thing', { headers: { Origin: origin } }).one('access-control-allow-origin'), origin);
  assert.equal(request('GET', '/api/thing').all('access-control-allow-origin').length, 0);
});

test('session traffic does not spend the sign-in budget', { skip }, () => {
  freshRateLimits();
  for (let i = 0; i < 12; i += 1) {
    assert.notEqual(request('GET', '/api/auth/me').status, 429);
  }
  for (const p of ['/api/auth/refresh', '/api/auth/logout']) assert.notEqual(request('POST', p).status, 429);
  assert.notEqual(request('GET', '/api/auth/show-default-credentials').status, 429);
  const logins = Array.from({ length: 5 }, () => request('POST', '/api/auth/login').status);
  assert.deepEqual(logins, [200, 200, 200, 200, 429]);
});

test('sign-in budget matches login and register case-insensitively, like the backend router', { skip }, () => {
  freshRateLimits();
  const statuses = ['/api/auth/login', '/api/AUTH/LOGIN', '/api/auth/Login/', '/api/Auth/Register', '/api/auth/REGISTER']
    .map(p => request('POST', p).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 429]);
});

test('user-creation budget matches POST /api/users case-insensitively', { skip }, () => {
  freshRateLimits();
  const statuses = Array.from({ length: 11 }, (_, i) => request('POST', i % 2 ? '/api/USERS' : '/api/users/').status);
  assert.deepEqual(statuses, [...Array(10).fill(200), 429]);
  assert.equal(request('GET', '/api/users').status, 200);
});

test('paths outside the case-sensitive /api prefix never reach the backend', { skip }, () => {
  const r = request('POST', '/API/auth/login');
  assert.equal(r.all('x-stub').length, 0);
});

// --- Compose port layout -------------------------------------------------

function renderCompose(file) {
  const envFile = path.join(workdir, 'empty.env');
  fs.writeFileSync(envFile, '');
  const r = spawnSync('docker', ['compose', '--env-file', envFile, '-f', path.join(root, file), 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, PORT: '4301' } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

for (const file of ['docker-compose.yml', 'docker-compose.prod.yml']) {
  test(`${file}: only the Ingress is published, on port 80`, { skip }, () => {
    const { services } = renderCompose(file);
    assert.equal(services.backend.ports, undefined);
    assert.equal(services.frontend.ports, undefined);
    assert.deepEqual(services.nginx.ports.map(p => [String(p.published), p.target]), [['80', 80]]);
  });

  test(`${file}: backend listener, healthcheck and Ingress upstream share one port`, { skip }, () => {
    const { services } = renderCompose(file);
    const upstream = fs.readFileSync(path.join(root, 'nginx/nginx.conf'), 'utf8').match(/server backend:(\d+)/)[1];
    assert.equal(services.backend.environment.PORT, upstream, 'a PORT override must not move the backend off the upstream port');
    assert.match(services.backend.healthcheck.test.join(' '), new RegExp(`localhost:${upstream}/`));
  });
}
