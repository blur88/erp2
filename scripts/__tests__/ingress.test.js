// Behaviour of the Ingress as the only published entry point (#1959, ADR 0003).
//
// Runs the real Ingress image (built from ./nginx) and the real Frontend
// server config (frontend/nginx.conf) in Docker, in front of a stub backend
// that sends Helmet- and CORS-shaped headers (fixtures/ingress-stub-backend.js).
// Skipped when Docker is not reachable.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, chmodSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { parse } = require('yaml');

const repo = path.resolve(__dirname, '../..');
const NGINX_IMAGE = 'nginx:1.30.0-alpine3.23-slim';
const NODE_IMAGE = 'node:24.15.0-alpine3.23';

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const dockerAvailable = docker('info', '--format', '{{.ServerVersion}}').status === 0;

// The Ingress policy: every response, every location.
const POLICY = {
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'x-xss-protection': '1; mode=block',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss:;",
};

// Raw HTTP so duplicate header lines stay visible; fetch() folds them together.
function request(port, { method = 'GET', url = '/', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const lines = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          lines.push([res.rawHeaders[i].toLowerCase(), res.rawHeaders[i + 1]]);
        }
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString(),
          all: name => lines.filter(([n]) => n === name).map(([, v]) => v),
          one: name => {
            const values = lines.filter(([n]) => n === name).map(([, v]) => v);
            assert.equal(values.length, 1, `${method} ${url}: expected exactly one ${name}, got ${JSON.stringify(values)}`);
            return values[0];
          },
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function assertPolicy(res, label) {
  assert.deepEqual(res.all('strict-transport-security'), [], `${label}: HTTP must omit HSTS`);
  for (const [name, value] of Object.entries(POLICY)) {
    assert.equal(res.one(name), value, `${label}: ${name}`);
  }
}

async function waitForOk(port, url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await request(port, { url })).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`${url} never returned 200 on port ${port}`);
}

const stacks = [];
let workdir;
let ingressImage;

function start(name, args) {
  const r = docker('run', '-d', '--name', name, ...args);
  assert.equal(r.status, 0, `docker run ${name}: ${r.stderr}`);
  stacks.push(name);
}

// A fresh stack per call: the rate-limit zones live in the Ingress's memory.
async function startStack(label) {
  const id = `ingress-test-${process.pid}-${label}`;
  const net = id;
  const r = docker('network', 'create', net);
  assert.equal(r.status, 0, r.stderr);
  stacks.push({ network: net });

  start(`${id}-backend`, [
    '--network', net, '--network-alias', 'backend',
    '-v', `${path.join(__dirname, 'fixtures/ingress-stub-backend.js')}:/stub.js:ro`,
    NODE_IMAGE, 'node', '/stub.js',
  ]);
  start(`${id}-frontend`, [
    '--network', net, '--network-alias', 'frontend', '-p', '127.0.0.1::80',
    '-v', `${path.join(repo, 'frontend/nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
    '-v', `${path.join(workdir, 'html')}:/usr/share/nginx/html:ro`,
    NGINX_IMAGE,
  ]);
  // Same hardening as docker-compose.yml: the Ingress must not need a writable rootfs.
  start(`${id}-ingress`, [
    '--network', net, '-p', '127.0.0.1::80',
    '--read-only', '--tmpfs', '/var/cache/nginx:size=10M', '--tmpfs', '/var/run:size=1M',
    ingressImage,
  ]);

  const portOf = name => Number(docker('port', name, '80/tcp').stdout.trim().split('\n')[0].split(':').pop());
  const ingress = portOf(`${id}-ingress`);
  const frontend = portOf(`${id}-frontend`);
  await waitForOk(ingress, '/api/health');
  await waitForOk(ingress, '/');
  return { ingress, frontend };
}

describe('Ingress as the only entry point', { skip: !dockerAvailable && 'docker is not available' }, () => {
  before(() => {
    workdir = mkdtempSync(path.join(tmpdir(), 'ingress-'));
    const html = path.join(workdir, 'html');
    mkdirSync(path.join(html, 'assets'), { recursive: true });
    writeFileSync(path.join(html, 'index.html'), '<!doctype html><div id="root"></div>');
    writeFileSync(path.join(html, 'env-config.js'), 'window.__ENV__ = {};');
    writeFileSync(path.join(html, 'assets/app-abc12345.js'), 'console.log(1);');
    for (const f of ['index.html', 'env-config.js', 'assets/app-abc12345.js']) chmodSync(path.join(html, f), 0o644);

    ingressImage = `erp-ingress-test:${process.pid}`;
    const build = docker('build', '-q', '-t', ingressImage, path.join(repo, 'nginx'));
    assert.equal(build.status, 0, build.stderr);
  });

  after(() => {
    for (const item of stacks.reverse()) {
      if (typeof item === 'string') docker('rm', '-f', item);
      else docker('network', 'rm', item.network);
    }
    if (ingressImage) docker('rmi', '-f', ingressImage);
    if (workdir) rmSync(workdir, { recursive: true, force: true });
  });

  describe('responses', () => {
    let stack;
    before(async () => { stack = await startStack('responses'); });

    const surfaces = [
      ['a client-side route', { url: '/dashboard/reports' }, 200],
      ['/env-config.js', { url: '/env-config.js' }, 200],
      ['a hashed asset', { url: '/assets/app-abc12345.js' }, 200],
      ['an API error', { url: '/api/missing' }, 404],
      ['an API error with its own cache header', { url: '/api/error' }, 500],
      ['an upload', { url: '/uploads/logo.png' }, 200],
      ['socket.io polling', { url: '/socket.io/?EIO=4&transport=polling' }, 200],
      ['a login rejection', { method: 'POST', url: '/api/auth/login' }, 401],
      ['an upload endpoint', { url: '/api/uploads/anything' }, 404],
    ];
    for (const [label, req, status] of surfaces) {
      test(`${label} carries exactly one copy of each shared security header`, async () => {
        const res = await request(stack.ingress, req);
        assert.equal(res.status, status);
        assertPolicy(res, label);
      });
    }

    test('the API error keeps SAMEORIGIN, replacing Helmet DENY', async () => {
      const res = await request(stack.ingress, { url: '/api/missing' });
      assert.equal(res.one('x-frame-options'), 'SAMEORIGIN');
      assert.equal(res.one('x-backend'), 'stub', 'response must come from the backend');
    });

    test('only the hashed asset is immutable; the route and /env-config.js are no-cache', async () => {
      const asset = await request(stack.ingress, { url: '/assets/app-abc12345.js' });
      assert.equal(asset.one('cache-control'), 'public, max-age=31536000, immutable');

      for (const url of ['/dashboard/reports', '/env-config.js', '/']) {
        const res = await request(stack.ingress, { url });
        assert.equal(res.one('cache-control'), 'no-cache', url);
        assert.equal(res.all('pragma').length + res.all('expires').length, 0, `${url}: legacy cache headers`);
      }
    });

    test('a missing asset is a 404, not the SPA fallback', async () => {
      const res = await request(stack.ingress, { url: '/assets/app-gone.js' });
      assert.equal(res.status, 404);
      assert.equal(res.all('cache-control').some(v => /immutable/.test(v)), false);
    });

    test('backend cache headers pass through', async () => {
      const err = await request(stack.ingress, { url: '/api/error' });
      assert.equal(err.one('cache-control'), 'no-store');

      const upload = await request(stack.ingress, { url: '/uploads/logo.png' });
      assert.equal(upload.status, 200);
      assert.equal(upload.one('cache-control'), 'public, max-age=0');
      assert.equal(upload.one('etag'), 'W/"stub-logo"');
      assert.equal(upload.all('x-cache-status').length, 0, 'the inert upload cache header is gone');
    });

    test('an allowed cross-origin request carries exactly one Access-Control-Allow-Origin', async () => {
      const res = await request(stack.ingress, { url: '/api/missing', headers: { Origin: 'http://localhost' } });
      assert.equal(res.one('access-control-allow-origin'), 'http://localhost');
      assert.equal(res.one('access-control-allow-credentials'), 'true');
    });

    for (const url of ['/api/missing', '/api/auth/login']) {
      test(`an allowed preflight to ${url} is answered by the backend with one Access-Control-Allow-Origin`, async () => {
        const res = await request(stack.ingress, {
          method: 'OPTIONS',
          url,
          headers: {
            Origin: 'http://localhost',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
        assert.equal(res.status, 200, 'the backend, not the Ingress, answers preflights');
        assert.equal(res.one('access-control-allow-origin'), 'http://localhost');
        assert.equal(res.one('access-control-allow-methods'), 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
        assert.equal(res.one('x-backend'), 'stub');
        assertPolicy(res, `preflight ${url}`);
      });
    }

    test('the Ingress adds no CORS headers of its own for a disallowed origin', async () => {
      const res = await request(stack.ingress, { url: '/api/missing', headers: { Origin: 'http://localhost:3000' } });
      assert.equal(res.all('access-control-allow-origin').length, 0);

      const preflight = await request(stack.ingress, {
        method: 'OPTIONS',
        url: '/api/missing',
        headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'GET' },
      });
      assert.equal(preflight.all('access-control-allow-origin').length, 0);
      assert.equal(preflight.one('x-backend'), 'stub');
    });

    test('the Frontend server serves static files only: it does not proxy the API, uploads or socket.io', async () => {
      for (const url of ['/api/health', '/uploads/logo.png', '/socket.io/?EIO=4']) {
        const res = await request(stack.frontend, { url });
        assert.equal(res.all('x-backend').length, 0, `${url} reached the backend through the Frontend server`);
        assert.doesNotMatch(res.body, /"status":"ok"|"sid"/, url);
      }
    });
  });

  describe('rate limits', () => {
    let stack;
    before(async () => { stack = await startStack('limits'); });

    const login = (url = '/api/auth/login') => request(stack.ingress, { method: 'POST', url });

    test('session traffic below the general limit leaves the login budget available', async () => {
      const calls = [];
      for (let i = 0; i < 8; i++) calls.push(await request(stack.ingress, { url: '/api/auth/me' }));
      assert.deepEqual(calls.map(c => c.status), Array(8).fill(401));
      for (const url of ['/api/auth/refresh', '/api/auth/show-default-credentials']) {
        assert.notEqual((await request(stack.ingress, { url })).status, 429, url);
      }
      assert.equal((await login()).status, 401, 'first login attempt must not be limited');
    });

    test('a burst of login attempts still returns 429', async () => {
      const statuses = [];
      for (let i = 0; i < 8; i++) statuses.push((await login()).status);
      assert.ok(statuses.includes(429), `no 429 in ${statuses}`);
    });

    test('the limit follows the route, not its spelling, and covers register', async () => {
      assert.equal((await login('/api/auth/register')).status, 429);
      assert.equal((await login('/api/auth/LOGIN')).status, 429);
      assert.equal((await login('/api/auth/login/')).status, 429);
    });

    test('other auth routes stay under the general limit while login is exhausted', async () => {
      const res = await request(stack.ingress, { url: '/api/auth/me' });
      assert.equal(res.status, 401);
    });

    // Last: it drains the general budget for this IP.
    test('/api/uploads is rate limited like the rest of the API', async () => {
      const statuses = [];
      for (let i = 0; i < 40; i++) statuses.push((await request(stack.ingress, { url: '/api/uploads/x' })).status);
      assert.ok(statuses.includes(429), `no 429 in ${statuses}`);
    });
  });
});

// nginx drops every inherited add_header (and proxy_hide_header) in a location
// that declares its own. A location that adds a header must therefore include
// the policy again, or its responses silently lose the security headers.
test('every location that declares an add_header includes the security-header policy', () => {
  const conf = readFileSync(path.join(repo, 'nginx/nginx.conf'), 'utf8').replace(/#.*$/gm, '');
  assert.match(conf, /server\s*\{[^]*?include \/etc\/nginx\/security-headers\.conf;/, 'server scope includes the policy');

  const configs = readdirSync(path.join(repo, 'nginx'))
    .filter(file => file.endsWith('.conf'))
    .map(file => readFileSync(path.join(repo, 'nginx', file), 'utf8').replace(/#.*$/gm, ''));
  const locations = configs.flatMap(config =>
    [...config.matchAll(/location\s+[^{]+\{([^{}]*)\}/g)].map(match => match[1]),
  );
  assert.ok(locations.length > 0, 'found no locations to check');
  for (const body of locations) {
    if (/add_header|proxy_hide_header/.test(body)) {
      assert.match(body, /include \/etc\/nginx\/security-headers\.conf;/, `location is missing the policy:\n${body}`);
    }
  }
});

test('the HTTPS-only HSTS policy sets a one-year max age with subdomains', () => {
  const conf = readFileSync(path.join(repo, 'nginx/hsts.conf'), 'utf8').replace(/#.*$/gm, '').trim();
  assert.equal(conf, 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
});

test('the development Ingress does not include the HTTPS-only HSTS policy', () => {
  const conf = readFileSync(path.join(repo, 'nginx/nginx.conf'), 'utf8').replace(/#.*$/gm, '');
  assert.doesNotMatch(conf, /\binclude\s+[^;]*\bhsts\.conf\s*;/);
});

describe('Compose publishes only the Ingress', () => {
  for (const file of ['docker-compose.yml', 'docker-compose.prod.yml']) {
    test(`${file} publishes no frontend, backend or 443 port`, () => {
      const { services } = parse(readFileSync(path.join(repo, file), 'utf8'));
      assert.equal(services.frontend.ports, undefined, 'frontend');
      assert.equal(services.backend.ports, undefined, 'backend');
      assert.deepEqual(services.nginx.ports, ['80:80']);
    });
  }
});
