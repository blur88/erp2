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
const http2 = require('node:http2');
const net = require('node:net');
const nodeTls = require('node:tls');
const crypto = require('node:crypto');
const path = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, chmodSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { parse } = require('yaml');
const { loadIntermediateProfile, nginxProfileProblems, directiveValues } = require('./fixtures/tls-profile');

const repo = path.resolve(__dirname, '../..');
const NGINX_IMAGE = 'nginx:1.30.0-alpine3.23-slim';
const NODE_IMAGE = 'node:24.15.0-alpine3.23';

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const dockerAvailable = docker('info', '--format', '{{.ServerVersion}}').status === 0;
const requireDocker = process.env.INGRESS_REQUIRE_DOCKER === '1';

// Shared policy for application responses served through the Ingress.
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
function startStack(label, ingressArgs) {
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
    ...ingressArgs,
  ]);
  return { backend: `${id}-backend`, frontend: `${id}-frontend`, ingress: `${id}-ingress` };
}

function portOf(container, port = 80) {
  const result = docker('port', container, `${port}/tcp`);
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim().split(':').pop());
}

async function startDevStack(label) {
  const stack = startStack(label, [
    '--read-only', '--tmpfs', '/var/cache/nginx:size=10M', '--tmpfs', '/var/run:size=1M', ingressImage,
  ]);
  const ingress = portOf(stack.ingress);
  await waitForOk(ingress, '/api/health');
  await waitForOk(ingress, '/');
  return { ingress, frontend: portOf(stack.frontend) };
}

async function startProductionStack(service, label = 'https') {
  assert.equal(service.read_only, true);
  const stack = startStack(label, ['--read-only', ...productionArgs(service)]);
  await waitForOk(portOf(stack.frontend), '/');
  return {
    ingress: portOf(stack.ingress),
    secure: portOf(stack.ingress, 443),
    backend: stack.backend,
    container: stack.ingress,
  };
}

function productionCompose(env, ...args) {
  return spawnSync('docker', [
    'compose', '--env-file', '/dev/null', '-f', path.join(repo, 'docker-compose.prod.yml'),
    ...args,
  ], { encoding: 'utf8', env });
}

function composeConfig(publicHost, tlsDir, acmeWebroot) {
  const env = { ...process.env };
  delete env.ERP_PUBLIC_HOST;
  if (publicHost !== undefined) env.ERP_PUBLIC_HOST = publicHost;
  if (tlsDir) env.TLS_DIR = tlsDir;
  if (acmeWebroot) env.ACME_WEBROOT = acmeWebroot;
  return productionCompose(env, 'config', '--format', 'json');
}

function productionArgs(service, env = service.environment) {
  return [
    '-p', '127.0.0.1::443',
    ...service.tmpfs.flatMap(mount => ['--tmpfs', mount]),
    ...service.volumes.flatMap(({ source, target, read_only }) => [
      '--mount', `type=bind,source=${source},target=${target}${read_only ? ',readonly' : ''}`,
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

// Expected values come from the pinned Mozilla Intermediate guidelines 6.0
// fixture (fixtures/mozilla-tls-guidelines-6.0.provenance.json records its
// source and checksum), never from memory. nginx/tls-intermediate.conf is
// hand-written; the tests below inspect it and the running Ingress against
// these values (#2016).
const PROFILE = loadIntermediateProfile();
// The test certificate is RSA, so only the RSA suites can complete a handshake.
const RSA_TLS12_CIPHERS = PROFILE.tls12Ciphers.filter(name => name.startsWith('ECDHE-RSA-'));

// OpenSSL 3 refuses TLS 1.0 and 1.1 at the default security level, so a client
// has to lower it to offer them.
const LEGACY_TLS_CIPHERS = 'ALL:@SECLEVEL=0';

// Both ends of one TLS connection are pinned to a single protocol version.
const pinned = (version, extra = {}) => ({ minVersion: version, maxVersion: version, ...extra });

// ClientHello client_version bytes for a client that offers only TLS 1.0 or 1.1.
const CLIENT_VERSION = { TLSv1: 0x0301, 'TLSv1.1': 0x0302 };

// A TCP forwarder that records the first bytes each side sends, so a test can
// read the ClientHello the client really sent and the reply it got.
async function recordingForwarder(targetPort) {
  const seen = { client: null, server: null };
  const server = net.createServer(client => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    client.once('data', chunk => { seen.client ??= chunk; });
    upstream.once('data', chunk => { seen.server ??= chunk; });
    client.pipe(upstream).pipe(client);
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', close);
    upstream.on('close', close);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, seen, close: () => new Promise(resolve => server.close(resolve)) };
}

function tlsConnect(port, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = nodeTls.connect({ host: '127.0.0.1', port, ...options });
    socket.once('secureConnect', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function withPermissiveTlsServer(tlsDir, serverOptions, fn) {
  const server = nodeTls.createServer({
    key: readFileSync(path.join(tlsDir, 'privkey.pem')),
    cert: readFileSync(path.join(tlsDir, 'fullchain.pem')),
    ...serverOptions,
  }, socket => socket.on('error', () => {}).end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

// A minimal Socket.IO client for the WebSocket transport (Engine.IO v4,
// Socket.IO v5). It exists so the root release tests need no extra dependency.
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function socketIoOverWss(port, tlsOptions) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = https.request({
      host: '127.0.0.1',
      port,
      path: '/socket.io/?EIO=4&transport=websocket',
      headers: {
        Host: 'erp.test',
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
      ...tlsOptions,
    });
    const seen = [];
    const send = (socket, text) => {
      const payload = Buffer.from(text);
      const mask = crypto.randomBytes(4);
      const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]));
      socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));
    };
    req.on('response', res => reject(new Error(`no upgrade: HTTP ${res.statusCode}`)));
    req.on('error', reject);
    req.on('upgrade', (res, socket, head) => {
      const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
      if (res.headers['sec-websocket-accept'] !== accept) return reject(new Error('bad Sec-WebSocket-Accept'));
      socket.on('error', reject);
      // The backend sends the Engine.IO open frame right after the 101, so it
      // may arrive in `head` or in the same read as other frames. Buffer them.
      let pending = Buffer.alloc(0);
      const onText = text => {
        seen.push(text);
        if (text.startsWith('0{')) send(socket, '40');
        else if (text.startsWith('40{')) send(socket, '42["echo"]');
        else if (text.startsWith('42["echo"')) {
          socket.end();
          resolve({ seen, alpn: socket.alpnProtocol, protocol: socket.getProtocol(), echo: JSON.parse(text.slice(2)) });
        }
      };
      const onBytes = chunk => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 2 && pending.length >= 2 + (pending[1] & 0x7f)) {
          const length = pending[1] & 0x7f;
          onText(pending.subarray(2, 2 + length).toString());
          pending = pending.subarray(2 + length);
        }
      };
      socket.on('data', onBytes);
      if (head.length) onBytes(head);
    });
    req.end();
  });
}

function http2Request(port, tlsOptions, authority = 'erp.test') {
  return new Promise((resolve, reject) => {
    const client = http2.connect('https://erp.test', {
      createConnection: () => nodeTls.connect({ host: '127.0.0.1', port, ALPNProtocols: ['h2'], ...tlsOptions }),
    });
    client.on('error', reject);
    const req = client.request({ ':path': '/api/health', ':authority': authority });
    let responseHeaders;
    req.on('response', received => { responseHeaders = received; });
    req.resume();
    req.on('end', () => {
      client.close();
      resolve({ alpn: client.alpnProtocol, headers: responseHeaders });
    });
    req.on('error', reject);
  });
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
    let tlsDir;
    const canonical = { Host: 'erp.test' };

    before(async () => {
      tlsDir = path.join(workdir, 'tls');
      mkdirSync(tlsDir);
      createTestCertificate(tlsDir);
      tls = { ca: readFileSync(path.join(tlsDir, 'ca.pem')), servername: 'erp.test', rejectUnauthorized: true };
      const webroot = path.join(workdir, 'acme');
      const challenges = path.join(webroot, '.well-known/acme-challenge');
      mkdirSync(path.join(challenges, 'tokens'), { recursive: true });
      writeFileSync(path.join(challenges, 'tokens/visible-token'), 'directory listing probe');
      writeFileSync(path.join(challenges, 'fixture.html'), 'fixture-token.fixture-thumbprint\n');
      const config = composeConfig('erp.test', tlsDir, webroot);
      assert.equal(config.status, 0, config.stderr);
      production = JSON.parse(config.stdout).services.nginx;
      stack = await startProductionStack(production);
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

    test('noncanonical HTTP Host returns 421 from either TLS server without reaching the backend', async () => {
      const defaultRequest = '/api/health?probe=default';
      // An absolute request target selects the canonical server before nginx
      // processes Host. The canonical server still has to reject that Host.
      const canonicalRequest = 'https://erp.test/api/health?probe=canonical';
      for (const url of [defaultRequest, canonicalRequest]) {
        const res = await request(stack.secure, { url, tls, headers: { Host: 'other.test' } });
        assert.equal(res.status, 421, url);
        for (const name of ['location', 'strict-transport-security', 'x-backend']) {
          assert.deepEqual(res.all(name), [], name);
        }
        if (url === canonicalRequest) {
          assertPolicy(res, url);
        } else {
          assert.deepEqual(res.all('x-frame-options'), [], 'response came from the default server');
        }
      }

      const control = '/api/health?probe=accepted';
      assert.equal((await request(stack.secure, { url: control, tls, headers: canonical })).status, 200);
      const logs = docker('logs', stack.backend);
      assert.equal(logs.status, 0, logs.stderr);
      assert.ok(logs.stdout.split('\n').includes(control), 'backend log must record the accepted request');
      assert.doesNotMatch(logs.stdout, /probe=(default|canonical)/);
    });

    test('HTTP serves an ACME token verbatim as plain text without security headers', async () => {
      const res = await request(stack.ingress, { url: '/.well-known/acme-challenge/fixture.html' });
      assert.equal(res.status, 200);
      assert.equal(res.one('content-type'), 'text/plain');
      assert.equal(res.body, 'fixture-token.fixture-thumbprint\n');
      for (const name of [...Object.keys(POLICY), 'strict-transport-security', 'x-backend']) {
        assert.deepEqual(res.all(name), [], name);
      }
    });

    test('missing ACME tokens and directories return 404 without redirecting or listing files', async () => {
      for (const name of ['missing-token', 'tokens/']) {
        const url = `/.well-known/acme-challenge/${name}`;
        const res = await request(stack.ingress, { url });
        assert.equal(res.status, 404, url);
        assert.doesNotMatch(res.body, /visible-token/, url);
        for (const header of ['location', ...Object.keys(POLICY), 'strict-transport-security', 'x-backend']) {
          assert.deepEqual(res.all(header), [], `${url}: ${header}`);
        }
      }
    });

    test('production Compose fails when the ACME webroot is absent and leaves it absent', () => {
      const webroot = path.join(workdir, 'missing-acme');
      const override = path.join(workdir, 'compose.ingress-image.yml');
      writeFileSync(override, `services:\n  nginx:\n    image: ${ingressImage}\n`);
      const env = { ...process.env, ERP_PUBLIC_HOST: 'erp.test', TLS_DIR: tlsDir, ACME_WEBROOT: webroot };
      const args = ['-f', override, '--project-name', `ingress-acme-test-${process.pid}`];
      assert.equal(existsSync(webroot), false);
      try {
        const result = productionCompose(env, ...args, 'run', '--no-deps', '--rm', '--pull', 'never',
          '--entrypoint', '/bin/true', 'nginx');
        assert.ifError(result.error);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /bind source path does not exist/);
        assert.ok(result.stderr.includes(webroot), result.stderr);
        assert.equal(existsSync(webroot), false);
      } finally {
        const cleanup = productionCompose(env, ...args, 'down');
        assert.equal(cleanup.status, 0, cleanup.stderr);
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
      const output = path.join(workdir, 'startup-render');
      mkdirSync(output);
      const observed = {
        ...production,
        volumes: [...production.volumes, { source: output, target: '/observed-render' }],
      };
      const environment = {
        ...production.environment,
        NGINX_ENVSUBST_OUTPUT_DIR: '/observed-render',
        NGINX_ENTRYPOINT_QUIET_LOGS: '1',
      };
      // Positive control: the entrypoint renders here even though nginx then
      // exits because its normal runtime config path is empty.
      const control = docker('run', '--rm', '--read-only', ...productionArgs(observed, environment));
      assert.equal(control.status, 1, control.stderr);
      assert.match(control.stderr, /runtime\/servers\.conf/);
      assert.match(readFileSync(path.join(output, 'servers.conf'), 'utf8'), /server_name erp\.test;/);
      rmSync(path.join(output, 'servers.conf'));
      for (const ERP_PUBLIC_HOST of ['https://erp.test', 'erp.test:443', 'erp.test/path',
        '*.erp.test', '192.0.2.1', '[::1]', '0x7f000001', 'erp..test', '-erp.test', 'erp.test\n']) {
        const result = docker('run', '--rm', '--read-only', ...productionArgs(observed, {
          ...environment, ERP_PUBLIC_HOST,
        }));
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /ERP_PUBLIC_HOST must be a bare DNS hostname/);
        assert.deepEqual(readdirSync(output), [], ERP_PUBLIC_HOST);
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

  describe('production TLS profile', () => {
    let stack;
    let tls;
    let tlsDir;
    let nginxConfig;

    before(async () => {
      tlsDir = path.join(workdir, 'tls-profile');
      mkdirSync(tlsDir);
      createTestCertificate(tlsDir);
      tls = { ca: readFileSync(path.join(tlsDir, 'ca.pem')), servername: 'erp.test', rejectUnauthorized: true };
      const webroot = path.join(workdir, 'acme-profile');
      mkdirSync(webroot);
      const config = composeConfig('erp.test', tlsDir, webroot);
      assert.equal(config.status, 0, config.stderr);
      stack = await startProductionStack(JSON.parse(config.stdout).services.nginx, 'tls-profile');
      await waitForOk(stack.secure, '/api/health', { tls, headers: { Host: 'erp.test' } });
      const dump = docker('exec', stack.container, 'nginx', '-c', '/etc/nginx/nginx-https.conf', '-T');
      assert.equal(dump.status, 0, dump.stderr);
      nginxConfig = dump.stdout.replace(/#.*$/gm, '');
    });

    for (const version of PROFILE.tlsVersions) {
      test(`${version} handshakes succeed with certificate verification`, async () => {
        const socket = await tlsConnect(stack.secure, { ...tls, ...pinned(version) });
        try {
          assert.equal(socket.authorized, true, String(socket.authorizationError));
          assert.equal(socket.getProtocol(), version);
          const suites = version === 'TLSv1.2' ? PROFILE.tls12Ciphers : PROFILE.tls13CipherSuites;
          assert.ok(suites.includes(socket.getCipher().name), socket.getCipher().name);
        } finally {
          socket.destroy();
        }
      });
    }

    for (const version of ['TLSv1', 'TLSv1.1'].filter(name => !PROFILE.tlsVersions.includes(name))) {
      test(`${version} is refused by nginx with a protocol_version alert, for a client shown to offer it`, async () => {
        const legacy = { ...tls, ...pinned(version, { ciphers: LEGACY_TLS_CIPHERS }) };
        const clientVersion = (record) => record.readUInt16BE(9);

        // Positive control: through the same forwarder, a permissive server
        // negotiates this version, and the recorded ClientHello offers it.
        await withPermissiveTlsServer(tlsDir, pinned(version, { ciphers: LEGACY_TLS_CIPHERS }), async port => {
          const forwarder = await recordingForwarder(port);
          try {
            const socket = await tlsConnect(forwarder.port, legacy);
            assert.equal(socket.getProtocol(), version);
            socket.destroy();
            assert.equal(forwarder.seen.client[0], 0x16, 'ClientHello record');
            assert.equal(clientVersion(forwarder.seen.client), CLIENT_VERSION[version]);
            assert.equal(forwarder.seen.server[0], 0x16, 'the permissive server answers with a handshake record');
          } finally {
            await forwarder.close();
          }
        });

        const forwarder = await recordingForwarder(stack.secure);
        try {
          await assert.rejects(tlsConnect(forwarder.port, legacy), /alert protocol version/i);
          assert.equal(forwarder.seen.client[0], 0x16, 'the client sent a ClientHello');
          assert.equal(clientVersion(forwarder.seen.client), CLIENT_VERSION[version], 'and it offered only this version');
          // TLS alert record: type 0x15, fatal (2), protocol_version (70).
          assert.deepEqual([...forwarder.seen.server.subarray(0, 1), ...forwarder.seen.server.subarray(5, 7)], [0x15, 2, 70]);
        } finally {
          await forwarder.close();
        }
      });
    }

    for (const cipher of RSA_TLS12_CIPHERS) {
      test(`TLS 1.2 negotiates ${cipher} when it is the only suite the client offers`, async () => {
        const socket = await tlsConnect(stack.secure, { ...tls, ...pinned('TLSv1.2', { ciphers: cipher }) });
        try {
          assert.equal(socket.authorized, true, String(socket.authorizationError));
          assert.equal(socket.getCipher().name, cipher);
        } finally {
          socket.destroy();
        }
      });
    }

    test('TLS 1.2 cipher suites outside the Intermediate profile are refused, DHE and RSA key exchange included', async () => {
      for (const ciphers of ['AES128-SHA', 'DHE-RSA-AES128-GCM-SHA256']) {
        const weak = { ...tls, maxVersion: 'TLSv1.2', ciphers };
        await withPermissiveTlsServer(tlsDir, { maxVersion: 'TLSv1.2', ciphers, dhparam: 'auto' }, async port => {
          const socket = await tlsConnect(port, weak);
          assert.equal(socket.getCipher().name, ciphers);
          socket.destroy();
        });
        await assert.rejects(tlsConnect(stack.secure, weak), /handshake failure|no shared cipher/i, ciphers);
      }
    });

    test('key exchange groups follow the profile, including the X25519MLKEM768 hybrid', async () => {
      assert.deepEqual(directiveValues(nginxConfig, 'ssl_ecdh_curve'), [PROFILE.curves.join(':')]);
      for (const ecdhCurve of PROFILE.curves) {
        const socket = await tlsConnect(stack.secure, { ...tls, ...pinned('TLSv1.3', { ecdhCurve }) });
        assert.equal(socket.authorized, true, ecdhCurve);
        // Node reports no name for the hybrid group. It was the only group
        // offered, so the handshake succeeding means nginx accepted it.
        if (ecdhCurve !== 'X25519MLKEM768') assert.equal(socket.getEphemeralKeyInfo().name, ecdhCurve);
        socket.destroy();
      }
      // A group outside the profile finds no common group. The control server
      // shows the client really negotiates it.
      const outside = { ...tls, ...pinned('TLSv1.3', { ecdhCurve: 'secp521r1' }) };
      await withPermissiveTlsServer(tlsDir, pinned('TLSv1.3', { ecdhCurve: 'secp521r1' }), async port => {
        const socket = await tlsConnect(port, outside);
        assert.equal(socket.getEphemeralKeyInfo().name, 'secp521r1');
        socket.destroy();
      });
      await assert.rejects(tlsConnect(stack.secure, outside), /alert handshake failure/i);
    });

    test('ALPN negotiates h2, and HTTP/1.1 clients still get http/1.1', async () => {
      const h2 = await tlsConnect(stack.secure, { ...tls, ALPNProtocols: ['h2', 'http/1.1'] });
      assert.equal(h2.alpnProtocol, 'h2');
      h2.destroy();
      const h1 = await tlsConnect(stack.secure, { ...tls, ALPNProtocols: ['http/1.1'] });
      assert.equal(h1.alpnProtocol, 'http/1.1');
      h1.destroy();
    });

    test('an HTTP/2 request reaches the backend with one HSTS header, and a foreign :authority gets 421', async () => {
      const canonicalResponse = await http2Request(stack.secure, tls);
      assert.equal(canonicalResponse.alpn, 'h2');
      assert.equal(canonicalResponse.headers[':status'], 200);
      assert.equal(canonicalResponse.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
      assert.equal(canonicalResponse.headers['x-backend'], 'stub');

      const misdirected = await http2Request(stack.secure, tls, 'other.test');
      assert.equal(misdirected.headers[':status'], 421);
      assert.equal(misdirected.headers['strict-transport-security'], undefined);
      assert.equal(misdirected.headers['x-backend'], undefined);
    });

    test('Socket.IO connects over wss with the WebSocket transport through the backend', async () => {
      const session = await socketIoOverWss(stack.secure, tls);
      assert.equal(session.alpn, false, 'the WebSocket upgrade runs over HTTP/1.1');
      assert.match(session.seen[0], /^0\{.*"sid":"stub-eio"/);
      assert.ok(session.seen.includes('40{"sid":"stub-sio"}'), JSON.stringify(session.seen));
      assert.deepEqual(session.echo[1], { proto: 'https', host: 'erp.test' });
      const logs = docker('logs', stack.backend);
      assert.ok(logs.stdout.split('\n').includes('/socket.io/?EIO=4&transport=websocket'), 'backend log must record the upgrade');
    });

    test('session tickets are off and the shared session cache resumes sessions', async () => {
      assert.match(nginxConfig, /^\s*ssl_session_tickets off;/m);
      assert.match(nginxConfig, /^\s*ssl_session_cache shared:\w+:\d+m;/m);

      const options = { ...tls, ...pinned('TLSv1.2') };
      // Positive control: Node's own server issues a ticket to the same client.
      await withPermissiveTlsServer(tlsDir, pinned('TLSv1.2'), async port => {
        const socket = await tlsConnect(port, options);
        assert.ok(Buffer.isBuffer(socket.getTLSTicket()), 'the control server must issue a ticket');
        socket.destroy();
      });

      const first = await tlsConnect(stack.secure, options);
      assert.equal(first.getTLSTicket(), undefined, 'nginx must not issue a session ticket');
      const session = first.getSession();
      first.destroy();
      const resumed = await tlsConnect(stack.secure, { ...options, session });
      assert.equal(resumed.isSessionReused(), true, 'the shared cache must resume the session by ID');
      resumed.destroy();
    });

    test('the running config states the pinned profile, with HTTP/2 and no OCSP stapling', () => {
      assert.deepEqual(nginxProfileProblems(nginxConfig, PROFILE), []);
      assert.equal((nginxConfig.match(/^\s*http2 on;/gm) ?? []).length, 2, 'both :443 servers');
      assert.doesNotMatch(nginxConfig, /ssl_stapling\s+on/);
    });
  });

  describe('responses', () => {
    let stack;
    before(async () => { stack = await startDevStack('responses'); });

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
    before(async () => { stack = await startDevStack('limits'); });

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
  const appServer = readFileSync(path.join(repo, 'nginx/app-server.conf'), 'utf8').replace(/#.*$/gm, '');
  assert.match(conf, /server\s*\{[^]*?include \/etc\/nginx\/app-server\.conf;/);
  assert.match(appServer, /^include \/etc\/nginx\/security-headers\.conf;/m);

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
      assert.ok(!path.isAbsolute(local) && local !== '..' && !local.startsWith('../') && !/[*?\[]/.test(local),
        'Expected a local nginx include file: ' + argument);
      visit(local, chain);
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
