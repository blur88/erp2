const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const script = path.resolve(__dirname, '../run-gate.mjs');

function fixture(t, { gitRepo = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'run-gate-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repo = path.join(directory, 'repo');
  fs.mkdirSync(repo);
  let head = 'unknown';
  if (gitRepo) {
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    fs.writeFileSync(path.join(repo, 'tracked'), 'one\n');
    git('add', '.');
    git('commit', '-qm', 'fixture');
    head = git('rev-parse', 'HEAD');
  }
  const log = path.join(directory, 'gate.log');
  return {
    repo, head, log,
    // GIT_CEILING_DIRECTORIES keeps a non-repo fixture from resolving an enclosing checkout.
    run: (...args) => spawnSync(process.execPath, [script, ...args], {
      cwd: repo, encoding: 'utf8',
      env: { ...process.env, GIT_CEILING_DIRECTORIES: directory },
    }),
    read: () => fs.readFileSync(log, 'utf8'),
  };
}

const node = (source, ...args) => ['--', process.execPath, '-e', source, ...args];

test('a passing command records head, clean tree, argv, TAP counts and exit 0', (t) => {
  const f = fixture(t);
  const source = "console.log('1..2\\nok 1 - a\\n    ok 1 - nested\\nok 2 - b')";
  const result = f.run(f.log, ...node(source));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^ok 2 - b$/m, 'output is echoed to the caller');
  const log = f.read();
  assert.match(log, new RegExp(`^HEAD=${f.head}$`, 'm'));
  assert.match(log, /^TREE=clean$/m);
  assert.match(log, new RegExp(`^CWD=${f.repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.ok(log.includes(`ARGV=${JSON.stringify([process.execPath, '-e', source])}\n`));
  assert.match(log, /^STARTED=\d{4}-\d\d-\d\dT[\d:.]+Z$/m);
  assert.match(log, /^FINISHED=\d{4}-\d\d-\d\dT[\d:.]+Z$/m);
  assert.match(log, /^TAP=1\.\.2 ok=2 not_ok=0$/m, 'indented subtest lines are not counted');
  assert.match(log, /\nEXIT=0\n$/);
});

test('a failing command keeps both streams and propagates its status', (t) => {
  const f = fixture(t);
  const source = "console.log('1..2\\nok 1 - a\\nnot ok 2 - b'); console.error('boom'); process.exit(37)";
  const result = f.run(f.log, ...node(source));
  assert.equal(result.status, 37);
  assert.match(result.stderr, /boom/);
  const log = f.read();
  assert.match(log, /--- output ---\n[\s\S]*boom[\s\S]*--- end output ---/);
  assert.match(log, /^TAP=1\.\.2 ok=1 not_ok=1$/m);
  assert.match(log, /\nEXIT=37\n$/);
});

test('output without TAP records TAP=none and closes an unterminated last line', (t) => {
  const f = fixture(t);
  const result = f.run(f.log, ...node("process.stdout.write('no newline')"));
  assert.equal(result.status, 0, result.stderr);
  const log = f.read();
  assert.match(log, /no newline\n--- end output ---\n/);
  assert.match(log, /^TAP=none$/m);
});

test('an existing log is never overwritten and the command does not run', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.log, 'earlier evidence\n');
  const marker = path.join(f.repo, 'ran');
  const result = f.run(f.log, ...node(`require('fs').writeFileSync(${JSON.stringify(marker)}, '')`));
  assert.equal(result.status, 125);
  assert.match(result.stderr, /already exists; evidence is never overwritten/);
  assert.equal(f.read(), 'earlier evidence\n');
  assert.equal(fs.existsSync(marker), false);
});

test('a dirty tree is recorded with its path count', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'tracked'), 'changed\n');
  fs.writeFileSync(path.join(f.repo, 'untracked'), 'new\n');
  const result = f.run(f.log, ...node(''));
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.read(), /^TREE=dirty \(2 paths\)$/m);
});

test('outside a Git checkout head and tree are unknown', (t) => {
  const f = fixture(t, { gitRepo: false });
  const result = f.run(f.log, ...node(''));
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.read(), /^HEAD=unknown\nTREE=unknown$/m);
});

test('arguments are passed literally, not evaluated by a shell', (t) => {
  const f = fixture(t);
  const hostile = 'valid; exit 0 $(echo expanded) `echo expanded`';
  const result = f.run(f.log, '--', 'sh', '-c', 'test "$1" = valid; echo "status=$?"', 'checker', hostile);
  assert.equal(result.status, 0, result.stderr);
  const log = f.read();
  assert.match(log, /^status=1$/m);
  assert.ok(log.includes(`ARGV=${JSON.stringify(['sh', '-c', 'test "$1" = valid; echo "status=$?"', 'checker', hostile])}\n`));
  assert.doesNotMatch(log.split('--- output ---')[1], /expanded\n/);
});

test('a missing command records EXIT=127', (t) => {
  const f = fixture(t);
  const result = f.run(f.log, '--', 'run-gate-no-such-command');
  assert.equal(result.status, 127);
  const log = f.read();
  assert.match(log, /cannot run run-gate-no-such-command/);
  assert.match(log, /\nEXIT=127\n$/);
  assert.equal(log.match(/^EXIT=/gm).length, 1, 'one outcome is recorded');
});

test('a command killed by a signal records SIGNAL and 128 + signal number', (t) => {
  const f = fixture(t);
  const result = f.run(f.log, ...node("process.kill(process.pid, 'SIGTERM')"));
  assert.equal(result.status, 128 + os.constants.signals.SIGTERM);
  assert.match(f.read(), new RegExp(`^SIGNAL=SIGTERM\\n[\\s\\S]*EXIT=${128 + os.constants.signals.SIGTERM}\\n$`, 'm'));
});

for (const args of [[], ['gate.log'], ['gate.log', 'cmd'], ['gate.log', '--']]) {
  test(`usage errors exit 125 without creating a log: ${JSON.stringify(args)}`, (t) => {
    const f = fixture(t);
    const result = f.run(...args);
    assert.equal(result.status, 125);
    assert.match(result.stderr, /^Usage: /);
    assert.equal(fs.existsSync(path.join(f.repo, 'gate.log')), false);
  });
}
