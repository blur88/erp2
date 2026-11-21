// scripts/ingress-smoke.sh asserts the real Ingress behaviour recorded in
// PR #1965 (#1966). It must exit non-zero when ANY assertion fails.
//
// Here it runs against a stub HTTP server that behaves like the Ingress (one
// copy of each security header, immutable only on hashed assets, one CORS
// header), plus one fault per assertion. Closed ports stand in for the ports
// that must refuse connections. The real stack is exercised by the Frontend CI
// job's "Ingress smoke test" step, not here.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const script = path.resolve(__dirname, '../ingress-smoke.sh');
const ORIGIN = 'http://localhost';
const ASSET = '/assets/index-abc123.js';

const SECURITY = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'",
};

// `faults` is a Set of names; each one breaks exactly one assertion.
function startStub(faults) {
  const has = name => faults.has(name);
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const headers = [];
    const add = (name, value) => headers.push([name, value]);
    for (const [name, value] of Object.entries(SECURITY)) {
      add(name, value);
    }
    if (has('http-hsts') && url.startsWith('/api/nope')) {
      add('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (has('duplicate-xfo') && url === '/api/health') add('X-Frame-Options', 'DENY');
    if (has('deny-xfo')) headers.splice(headers.findIndex(([n]) => n === 'X-Frame-Options'), 1, ['X-Frame-Options', 'DENY']);

    let status = 200;
    let type = 'application/json';
    let body = '{}';

    if (url === '/' || url === '/dashboard') {
      type = 'text/html';
      body = `<!doctype html><div id="root"></div><script type="module" src="${ASSET}"></script>`;
      add('Cache-Control', has('immutable-shell') ? 'public, max-age=31536000, immutable' : 'no-cache');
      if (has('app-down') && url === '/') status = 502;
    } else if (url === ASSET) {
      type = 'text/javascript';
      body = 'console.log(1)';
      add('Cache-Control', has('mutable-asset') ? 'no-cache' : 'public, max-age=31536000, immutable');
    } else if (url.startsWith('/assets/')) {
      if (has('spa-fallback-for-missing-asset')) {
        type = 'text/html';
        body = '<!doctype html><div id="root"></div>';
        add('Cache-Control', 'no-cache');
      } else {
        status = 404;
        if (has('immutable-missing-asset')) add('Cache-Control', 'public, max-age=31536000, immutable');
      }
    } else if (url === '/api/health') {
      body = '{"status":"ok"}';
      if (has('api-down')) status = 500;
    } else if (url.startsWith('/api/')) {
      status = req.method === 'OPTIONS' ? 204 : url === '/api/auth/login' ? 401 : 404;
    }

    if (url.startsWith('/api/') && req.headers.origin) {
      const preflight = req.method === 'OPTIONS';
      const origin = has('wrong-origin') && !preflight ? 'http://evil.example' : req.headers.origin;
      const skip = (has('no-acao-preflight') && preflight) || (has('no-acao-actual') && !preflight);
      if (!skip) add('Access-Control-Allow-Origin', origin);
      if (has('duplicate-acao-preflight') && preflight) add('Access-Control-Allow-Origin', origin);
      if (has('duplicate-acao-actual') && !preflight) add('Access-Control-Allow-Origin', origin);
    }

    add('Content-Type', type);
    // Flat array so repeated names are sent as separate header lines.
    res.writeHead(status, headers.flat());
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function runScript(env) {
  return new Promise(resolve => {
    const child = spawn('bash', [script], { env: { ...process.env, ...env } });
    let output = '';
    child.stdout.on('data', d => (output += d));
    child.stderr.on('data', d => (output += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function smoke({ faults = [], openForbiddenPort = false } = {}) {
  const stub = await startStub(new Set(faults));
  try {
    const port = stub.address().port;
    const closed = [await freePort(), await freePort()];
    const refused = openForbiddenPort ? [...closed, port] : closed;
    return await runScript({
      BASE_URL: `http://127.0.0.1:${port}`,
      REFUSED_HOST: '127.0.0.1',
      REFUSED_PORTS: refused.join(' '),
      EXPECTED_ORIGIN: ORIGIN,
      CURL_MAX_TIME: '10',
    });
  } finally {
    await new Promise(resolve => stub.close(resolve));
  }
}

describe('scripts/ingress-smoke.sh', () => {
  test('exits 0 against a compliant Ingress and reports each assertion', async () => {
    const { code, output } = await smoke();
    assert.equal(code, 0, output);
    for (const topic of [
      'serves the app',
      'serves the API',
      'refuses connections',
      'security header',
      'immutable',
      'Access-Control-Allow-Origin',
    ]) {
      assert.match(output, new RegExp(topic), `output should mention "${topic}":\n${output}`);
    }
    assert.doesNotMatch(output, /FAIL/);
  });

  const faults = [
    ['app-down', 'port 80 serves the app', /FAIL.*serves the app/],
    ['api-down', 'port 80 serves the API', /FAIL.*serves the API/],
    ['duplicate-xfo', 'a security header sent twice', /FAIL.*X-Frame-Options/],
    ['http-hsts', 'HSTS present on an HTTP error response', /FAIL.*Strict-Transport-Security/],
    ['deny-xfo', 'X-Frame-Options other than SAMEORIGIN', /FAIL.*X-Frame-Options/],
    ['mutable-asset', 'a hashed asset that is not immutable', /FAIL.*immutable/],
    ['immutable-shell', 'an immutable app shell', /FAIL.*immutable/],
    ['immutable-missing-asset', 'an immutable 404 for a missing asset', /FAIL.*immutable/],
    ['spa-fallback-for-missing-asset', 'the SPA fallback for a missing asset', /FAIL.*missing asset/],
    ['duplicate-acao-preflight', 'two CORS origin headers on the preflight', /FAIL.*preflight/],
    ['no-acao-preflight', 'no CORS origin header on the preflight', /FAIL.*preflight/],
    ['duplicate-acao-actual', 'two CORS origin headers on the API response', /FAIL.*API response/],
    ['wrong-origin', 'the wrong CORS origin on the API response', /FAIL.*API response/],
    ['no-acao-actual', 'no CORS origin header on the API response', /FAIL.*API response/],
  ];
  for (const [fault, label, expected] of faults) {
    test(`exits non-zero for ${label}`, async () => {
      const { code, output } = await smoke({ faults: [fault] });
      assert.notEqual(code, 0, output);
      assert.match(output, expected);
    });
  }

  test('exits non-zero when a port that must refuse connections accepts them', async () => {
    const { code, output } = await smoke({ openForbiddenPort: true });
    assert.notEqual(code, 0, output);
    assert.match(output, /FAIL.*refuse/);
  });

  test('keeps checking after a failure, so one run reports every broken assertion', async () => {
    const { code, output } = await smoke({ faults: ['duplicate-xfo', 'mutable-asset'] });
    assert.notEqual(code, 0);
    assert.match(output, /FAIL.*X-Frame-Options/);
    assert.match(output, /FAIL.*immutable/);
  });

  test('exits non-zero when nothing is listening at BASE_URL', async () => {
    const dead = await freePort();
    const { code, output } = await runScript({
      BASE_URL: `http://127.0.0.1:${dead}`,
      REFUSED_PORTS: String(await freePort()),
      CURL_MAX_TIME: '5',
    });
    assert.notEqual(code, 0, output);
    assert.match(output, /FAIL/);
  });
});
