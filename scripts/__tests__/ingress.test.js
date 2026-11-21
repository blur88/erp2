// Behaviour of the Ingress as the only published entry point (#1959, ADR 0003).
//
// Runs the real Ingress image (built from ./nginx) and the real Frontend
// server config (frontend/nginx.conf) in Docker, in front of a stub backend
// that sends Helmet- and CORS-shaped headers (fixtures/ingress-stub-backend.js).
// Docker is optional unless INGRESS_REQUIRE_DOCKER=1.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, chmodSync, globSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { parse } = require('yaml');

const repo = path.resolve(__dirname, '../..');
const NGINX_IMAGE = 'nginx:1.30.0-alpine3.23-slim';
const NODE_IMAGE = 'node:24.15.0-alpine3.23';

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const dockerAvailable = docker('info', '--format', '{{.ServerVersion}}').status === 0;
const requireDocker = process.env.INGRESS_REQUIRE_DOCKER === '1';

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
function request(port, { method = 'GET', url = '/', headers = {}, tls } = {}) {
  return new Promise((resolve, reject) => {
    const client = tls ? https : http;
    const req = client.request({ host: '127.0.0.1', port, method, path: url, headers, ...tls }, res => {
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

function assertPolicy(res, label, hsts = []) {
  assert.deepEqual(res.all('strict-transport-security'), hsts, label);
  for (const [name, value] of Object.entries(POLICY)) {
    assert.equal(res.one(name), value, `${label}: ${name}`);
  }
}

async function waitForOk(port, url, options = {}) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await request(port, { url, ...options })).status === 200) return;
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
async function startStack(label, production) {
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
  // Both Compose modes run the Ingress on a read-only root filesystem.
  start(`${id}-ingress`, [
    '--network', net, '-p', '127.0.0.1::80',
    ...(production ? [
      ...(production.read_only ? ['--read-only'] : []),
      ...productionArgs(production),
    ] : [
      '--read-only', '--tmpfs', '/var/cache/nginx:size=10M', '--tmpfs', '/var/run:size=1M', ingressImage,
    ]),
  ]);

  const portOf = (name, port = 80) => Number(docker('port', name, `${port}/tcp`).stdout.trim().split('\n')[0].split(':').pop());
  const ingress = portOf(`${id}-ingress`);
  const frontend = portOf(`${id}-frontend`);
  if (production) {
    await waitForOk(frontend, '/');
    return { ingress, secure: portOf(`${id}-ingress`, 443) };
  }
  await waitForOk(ingress, '/api/health');
  await waitForOk(ingress, '/');
  return { ingress, frontend };
}

function composeConfig(publicHost, tlsDir) {
  const env = { ...process.env };
  delete env.ERP_PUBLIC_HOST;
  if (publicHost !== undefined) env.ERP_PUBLIC_HOST = publicHost;
  if (tlsDir) env.TLS_DIR = tlsDir;
  return spawnSync('docker', [
    'compose', '--env-file', '/dev/null', '-f', path.join(repo, 'docker-compose.prod.yml'),
    'config', '--format', 'json',
  ], { encoding: 'utf8', env });
}

function productionArgs(service, env = service.environment) {
  return [
    '-p', '127.0.0.1::443',
    ...service.tmpfs.flatMap(mount => ['--tmpfs', mount]),
    ...service.volumes.flatMap(({ source, target, read_only }) => [
      '-v', `${source}:${target}${read_only ? ':ro' : ''}`,
    ]),
    ...Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
    ingressImage, ...service.command,
  ];
}

function createTestCertificate(directory) {
  const openssl = (...args) => {
    const result = spawnSync('openssl', args, { cwd: directory, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  };
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-days', '1',
    '-subj', '/CN=ERP Ingress Test CA', '-keyout', 'ca.key', '-out', 'ca.pem',
    '-addext', 'basicConstraints=critical,CA:TRUE');
  openssl('req', '-new', '-newkey', 'rsa:2048', '-noenc', '-subj', '/CN=erp.test',
    '-keyout', 'privkey.pem', '-out', 'server.csr');
  writeFileSync(path.join(directory, 'server.ext'), 'subjectAltName=DNS:erp.test\n');
  openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key',
    '-CAcreateserial', '-days', '1', '-extfile', 'server.ext', '-out', 'fullchain.pem');
}

describe('Ingress as the only entry point', { skip: !requireDocker && !dockerAvailable && 'docker is not available' }, () => {
  before(() => {
    assert.ok(dockerAvailable, 'Docker is required for the Ingress suite. Start Docker and check that docker info succeeds.');
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

  describe('production canonical HTTPS', () => {
    let stack;
    let production;
    let tls;
    const canonical = { Host: 'erp.test' };

    before(async () => {
      const directory = path.join(workdir, 'tls');
      mkdirSync(directory);
      createTestCertificate(directory);
      tls = { ca: readFileSync(path.join(directory, 'ca.pem')), servername: 'erp.test', rejectUnauthorized: true };
      const config = composeConfig('erp.test', directory);
      assert.equal(config.status, 0, config.stderr);
      production = JSON.parse(config.stdout).services.nginx;
      stack = await startStack('https', production);
      await waitForOk(stack.secure, '/api/health', { tls, headers: canonical });
    });

    for (const publicHost of [undefined, '']) {
      test(`Compose rejects an ${publicHost === undefined ? 'unset' : 'empty'} ERP_PUBLIC_HOST`, () => {
        const result = composeConfig(publicHost);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /ERP_PUBLIC_HOST.*canonical DNS hostname/);
      });
    }

    test('the app and API serve verified HTTPS with exactly one HSTS header', async () => {
      for (const url of ['/', '/api/health']) {
        const res = await request(stack.secure, { url, tls, headers: canonical });
        assert.equal(res.status, 200, url);
        assertPolicy(res, url, ['max-age=31536000; includeSubDomains']);
        if (url === '/api/health') assert.equal(res.one('x-backend'), 'stub');
        else assert.match(res.body, /<div id="root">/);
      }
    });

    test('noncanonical HTTP Host over valid TLS returns 421 without reaching the backend', async () => {
      const res = await request(stack.secure, { url: '/api/health', tls, headers: { Host: 'other.test' } });
      assert.equal(res.status, 421);
      for (const name of ['location', 'strict-transport-security', 'x-backend']) {
        assert.deepEqual(res.all(name), [], name);
      }
    });

    test('HTTP redirects to the canonical HTTPS URL verbatim for either Host', async () => {
      const url = '/api/a%2Fb?keep=%2F&x=1';
      for (const Host of ['erp.test', 'other.test']) {
        const res = await request(stack.ingress, { url, headers: { Host } });
        assert.equal(res.status, 301);
        assert.equal(res.one('location'), 'https://erp.test/api/a%2Fb?keep=%2F&x=1');
        assert.deepEqual(res.all('strict-transport-security'), []);
      }
    });

    test('the image rejects malformed canonical hostnames before envsubst', () => {
      for (const ERP_PUBLIC_HOST of ['https://erp.test', 'erp.test:443', 'erp.test/path',
        '*.erp.test', '192.0.2.1', '[::1]', '0x7f000001', 'erp..test', '-erp.test', 'erp.test\n']) {
        const result = docker('run', '--rm', '--read-only', ...productionArgs(production, {
          ...production.environment, ERP_PUBLIC_HOST,
        }));
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /ERP_PUBLIC_HOST must be a bare DNS hostname/);
        assert.doesNotMatch(result.stdout + result.stderr, /20-envsubst-on-templates/);
      }
    });

    test('nginx fails to start without the rendered production configuration', () => {
      const result = docker('run', '--rm', '--read-only', ...productionArgs(production, {
        ...production.environment, NGINX_ENVSUBST_TEMPLATE_DIR: '/missing-templates',
      }));
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /open\(\) "\/etc\/nginx\/runtime\/servers\.conf" failed/);
    });
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

function assertNoDevelopmentHsts(directory) {
  function visit(file, parents) {
    const chain = [...parents, file];
    assert.ok(!parents.includes(file), 'nginx include cycle: ' + chain.join(' -> '));

    let config;
    try {
      config = readFileSync(path.join(directory, file), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') assert.fail('Missing nginx include: ' + file);
      throw error;
    }

    // Tokenize quoted values as a unit so an embedded semicolon or # stays
    // inside its value. Only complete directives can declare headers/includes.
    const tokens = config.match(/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[;{}]|[^\s#;{}"']+/g) ?? [];
    let directive = [];
    for (const token of tokens) {
      if (token.startsWith('#')) continue;
      if (![';', '{', '}'].includes(token)) {
        directive.push(token.replace(/^(["'])(.*)\1$/, '$2'));
        continue;
      }

      const [name, argument] = directive;
      directive = [];
      if (token !== ';') continue;
      assert.ok(name !== 'add_header' || argument.toLowerCase() !== 'strict-transport-security',
        'HSTS policy in development: ' + file);
      if (name !== 'include') continue;

      // mime.types is supplied by the base image and contains only MIME data.
      if (argument === '/etc/nginx/mime.types') continue;
      const local = path.posix.normalize(argument.replace(/^\/etc\/nginx\//, ''));
      assert.ok(!path.isAbsolute(local) && local !== '..' && !local.startsWith('../'),
        'Unsupported nginx include: ' + argument);
      const matches = /[*?\[]/.test(local) ? globSync(local, { cwd: directory }).sort() : [local];
      assert.ok(matches.length, 'Missing nginx include: ' + local);
      for (const match of matches) visit(match, chain);
    }
  }

  visit('nginx.conf', []);
}

test('the development Ingress does not include the HTTPS-only HSTS policy', () => {
  assertNoDevelopmentHsts(path.join(repo, 'nginx'));
});

test('the development HSTS check follows shared includes', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ingress-includes-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const put = (file, config) => writeFileSync(path.join(directory, file), config);
  put('nginx.conf', 'http { include /etc/nginx/shared.conf; }');
  put('shared.conf', 'include "policy.conf";');
  put('policy.conf', 'proxy_hide_header Strict-Transport-Security; # shared policy');
  assert.doesNotThrow(() => assertNoDevelopmentHsts(directory));

  put('shared.conf', 'include "policy.conf"; include hsts.conf;');
  put('hsts.conf', 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
  assert.throws(() => assertNoDevelopmentHsts(directory), /HSTS policy in development: hsts\.conf/);

  put('shared.conf', 'include policy.conf;');
  put('policy.conf', 'include missing.conf;');
  assert.throws(() => assertNoDevelopmentHsts(directory), /Missing nginx include: missing\.conf/);

  put('policy.conf', 'include shared.conf;');
  assert.throws(() => assertNoDevelopmentHsts(directory), /nginx include cycle: nginx\.conf -> shared\.conf -> policy\.conf -> shared\.conf/);
});

describe('Compose publishes only the Ingress', () => {
  for (const file of ['docker-compose.yml', 'docker-compose.prod.yml']) {
    test(`${file} publishes only the expected Ingress ports`, () => {
      const { services } = parse(readFileSync(path.join(repo, file), 'utf8'));
      assert.equal(services.frontend.ports, undefined, 'frontend');
      assert.equal(services.backend.ports, undefined, 'backend');
      assert.deepEqual(services.nginx.ports, file === 'docker-compose.yml' ? ['80:80'] : ['80:80', '443:443']);
    });
  }
});
