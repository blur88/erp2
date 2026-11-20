const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const lib = path.join(root, 'scripts/lib/wait-ready.sh');

// Run a bash snippet with wait-ready.sh sourced (asynchronously, so the
// in-process HTTP server below can keep answering).
function runWait(snippet, env = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn('bash', ['-c', `set -e
print_compose_status() { echo "COMPOSE-STATUS"; }
. "${lib}"
${snippet}`], { env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const killer = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.on('close', status => {
      clearTimeout(killer);
      resolve({ status, out, seconds: (Date.now() - started) / 1000 });
    });
  });
}

// Server whose behaviour per request is chosen by the test.
async function server(t, handler) {
  const srv = http.createServer(handler);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => { srv.closeAllConnections(); srv.close(); });
  return `http://127.0.0.1:${srv.address().port}/`;
}

test('returns 0 as soon as the URL answers 200', async t => {
  const url = await server(t, (req, res) => res.end('ok'));
  const r = await runWait(`wait_for_http_200 ${url}`, { READY_TIMEOUT: '10' });
  assert.equal(r.status, 0, r.out);
  assert.ok(r.seconds < 5, `took ${r.seconds}s`);
});

test('retries until a non-200 URL turns 200 within the deadline', async t => {
  let calls = 0;
  const url = await server(t, (req, res) => {
    calls += 1;
    res.statusCode = calls < 2 ? 503 : 200;
    res.end();
  });
  const r = await runWait(`wait_for_http_200 ${url}`, { READY_TIMEOUT: '15' });
  assert.equal(r.status, 0, r.out);
  assert.equal(calls, 2);
});

test('a 200 that arrives after the deadline is a timeout, not a success', async t => {
  const url = await server(t, (req, res) => setTimeout(() => res.end('late'), 2500));
  const r = await runWait(`wait_for_http_200 ${url} || echo "rc=$?"`, { READY_TIMEOUT: '1' });
  assert.match(r.out, /rc=1/);
  assert.match(r.out, new RegExp(`No HTTP 200 from ${url} within 1s`));
  assert.match(r.out, /COMPOSE-STATUS/);
  assert.ok(r.seconds < 2.5, `took ${r.seconds}s; the request was not bounded`);
});

test('a stalled server cannot hold the wait past its deadline', async t => {
  const url = await server(t, () => { /* never respond */ });
  const r = await runWait(`wait_for_http_200 ${url} || echo "rc=$?"`, { READY_TIMEOUT: '2' });
  assert.match(r.out, /rc=1/);
  assert.match(r.out, /last status: 000/);
  assert.ok(r.seconds < 4, `took ${r.seconds}s`);
});

test('reports the failing URL, last status and compose status on timeout', async t => {
  const url = await server(t, (req, res) => { res.statusCode = 502; res.end(); });
  const r = await runWait(`wait_for_http_200 ${url} || echo "rc=$?"`, { READY_TIMEOUT: '2' });
  assert.match(r.out, /rc=1/);
  assert.match(r.out, new RegExp(`No HTTP 200 from ${url} within 2s \\(last status: 502\\)`));
  assert.match(r.out, /COMPOSE-STATUS/);
});

test('under set -e a timeout stops the caller', async t => {
  const url = await server(t, (req, res) => { res.statusCode = 500; res.end(); });
  const r = await runWait(`wait_for_http_200 ${url}; echo "kept going"`, { READY_TIMEOUT: '1' });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.out, /kept going/);
});

test('wait_for_command succeeds once the command succeeds', async () => {
  // The command runs in a background subshell, so count attempts in a file.
  const r = await runWait(`f=$(mktemp); probe() { echo x >> "$f"; [ "$(wc -l < "$f")" -ge 2 ]; }
wait_for_command "Probe" probe; echo "attempts=$(wc -l < "$f")"; rm -f "$f"`, { READY_TIMEOUT: '15' });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /attempts=2/);
});

test('wait_for_command terminates a hanging command at the deadline', async () => {
  const r = await runWait('wait_for_command "PostgreSQL" sleep 30 || echo "rc=$?"', { READY_TIMEOUT: '2' });
  assert.match(r.out, /rc=1/);
  assert.match(r.out, /PostgreSQL not ready within 2s/);
  assert.match(r.out, /COMPOSE-STATUS/);
  assert.ok(r.seconds < 4, `took ${r.seconds}s`);
});

test('setup.sh embeds wait-ready.sh verbatim', () => {
  const setup = readFileSync(path.join(root, 'setup.sh'), 'utf8');
  const match = setup.match(/^# BEGIN wait-ready\.sh[^\n]*\n([\s\S]*?)^# END wait-ready\.sh$/m);
  assert.ok(match, 'setup.sh is missing the BEGIN/END wait-ready.sh markers');
  assert.equal(match[1], readFileSync(lib, 'utf8'),
    'setup.sh copy of scripts/lib/wait-ready.sh has drifted; paste the library back in');
});

test('deploy.sh sources the library rather than defining its own waits', () => {
  const deploy = readFileSync(path.join(root, 'deploy.sh'), 'utf8');
  assert.match(deploy, /^\. "\$\(dirname "\$0"\)\/scripts\/lib\/wait-ready\.sh"$/m);
  assert.doesNotMatch(deploy, /^\s*(wait_for_http_200|wait_for_command)\(\)/m);
  assert.doesNotMatch(deploy, /^\s*until /m, 'unbounded until-loop in deploy.sh');
});
