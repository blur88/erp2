const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const nodeMajor = Number(process.versions.node.split('.')[0]);

function createReleaseFixture(t, nvmrc) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-tests-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.copyFileSync(path.resolve(__dirname, '../../package.json'), path.join(directory, 'package.json'));
  fs.mkdirSync(path.join(directory, 'scripts', '__tests__'), { recursive: true });
  fs.copyFileSync(
    path.resolve(__dirname, '../check-release-node.cjs'),
    path.join(directory, 'scripts', 'check-release-node.cjs'),
  );
  if (nvmrc !== undefined) {
    fs.writeFileSync(path.join(directory, '.nvmrc'), nvmrc);
  }
  return directory;
}

function runReleaseTests(directory) {
  const env = { ...process.env };
  // The nested Node test runner needs to start outside the parent test context.
  delete env.NODE_TEST_CONTEXT;
  env.PATH = [path.dirname(process.execPath), env.PATH].join(path.delimiter);
  const result = spawnSync('npm', ['run', 'test:release'], {
    cwd: directory,
    encoding: 'utf8',
    env,
  });

  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function addPassingTest(directory) {
  fs.writeFileSync(
    path.join(directory, 'scripts', '__tests__', 'fixture.test.js'),
    "require('node:test').test('release fixture executed', () => {});\n",
  );
}

test('test:release rejects an older Node major before running tests', (t) => {
  const directory = createReleaseFixture(t, `${nodeMajor + 1}\n`);
  addPassingTest(directory);

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 1, output);
  assert.doesNotMatch(output, /release fixture executed/);
  assert.ok(output.includes(`expected Node.js ${nodeMajor + 1}`), output);
  assert.ok(output.includes(`running Node.js ${process.version}`), output);
  assert.match(output, /nvm use/);
});

test('test:release rejects a newer Node major before running tests', (t) => {
  const directory = createReleaseFixture(t, `${nodeMajor - 1}\n`);
  addPassingTest(directory);

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 1, output);
  assert.doesNotMatch(output, /release fixture executed/);
  assert.ok(output.includes(`expected Node.js ${nodeMajor - 1}`), output);
});

test('test:release reports the actual version and runs tests when the major matches', (t) => {
  const directory = createReleaseFixture(t, `${nodeMajor}\n`);
  addPassingTest(directory);

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 0, output);
  assert.ok(output.includes(`Release tests are running on Node.js ${process.version}`), output);
  assert.match(output, /release fixture executed/);
});

test('test:release fails before running tests when .nvmrc is missing', (t) => {
  const directory = createReleaseFixture(t);
  addPassingTest(directory);

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 1, output);
  assert.match(output, /Cannot read \.nvmrc/);
  assert.doesNotMatch(output, /release fixture executed/);
});

test('test:release fails before running tests when .nvmrc is malformed', (t) => {
  const directory = createReleaseFixture(t, `${nodeMajor}.invalid\n`);
  addPassingTest(directory);

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 1, output);
  assert.match(output, /Unsupported \.nvmrc value/);
  assert.doesNotMatch(output, /release fixture executed/);
});

test('test:release fails when no release test files are found', (t) => {
  const directory = createReleaseFixture(t, `${nodeMajor}\n`);

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 1, output);
  assert.ok(output.includes(`Release tests are running on Node.js ${process.version}`), output);
});

test('test:release propagates release test failures', (t) => {
  const directory = createReleaseFixture(t, `${nodeMajor}\n`);
  fs.writeFileSync(
    path.join(directory, 'scripts', '__tests__', 'failure.test.js'),
    "require('node:test').test('release fixture failed', () => { throw new Error('fixture failure'); });\n",
  );

  const { status, output } = runReleaseTests(directory);

  assert.equal(status, 1, output);
  assert.match(output, /release fixture failed/);
});
