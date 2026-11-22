const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const reporter = resolve(__dirname, '../report-lockfile-changes.cjs');

function createRepo(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'lockfile-report-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  return {
    cwd,
    git,
    report: (...args) => execFileSync(process.execPath, [reporter, ...args], {
      cwd,
      encoding: 'utf8',
    }),
    writeLockfile: (path, packages) =>
      writeFileSync(join(cwd, path), JSON.stringify({ packages })),
  };
}

// Stages one root lockfile change and returns the reported change lines in order.
function stagedChangeLines(t, beforePackages, afterPackages) {
  const { git, report, writeLockfile } = createRepo(t);
  writeLockfile('package-lock.json', beforePackages);
  git('add', '.');
  git('commit', '-qm', 'Before');
  writeLockfile('package-lock.json', afterPackages);
  git('add', '.');
  return report('staged').split('\n').filter((line) => line.startsWith('    '));
}

test('reports staged paths and branch changes from the merge base', (t) => {
  const { cwd, git, report, writeLockfile } = createRepo(t);

  mkdirSync(join(cwd, 'frontend'));
  mkdirSync(join(cwd, 'backend'));
  writeLockfile('package-lock.json', { 'node_modules/root': { version: '1' } });
  writeLockfile('frontend/package-lock.json', {
    'node_modules/msw': { version: '1' },
    'node_modules/eslint/node_modules/ajv': { version: '2' },
  });
  git('add', '.');
  git('commit', '-qm', 'Initial lockfiles');
  git('branch', 'topic');
  writeLockfile('package-lock.json', { 'node_modules/root': { version: '2' } });
  git('commit', '-qam', 'Main-only change');
  git('switch', '-q', 'topic');

  writeLockfile('frontend/package-lock.json', {
    'node_modules/msw': { version: '2' },
    'node_modules/ajv': { version: '2' },
  });
  writeLockfile('backend/package-lock.json', { 'node_modules/nest': { version: '1' } });
  git('add', '.');
  writeLockfile('frontend/package-lock.json', { 'node_modules/msw': { version: '3' } });

  const staged = report('staged');
  assert.match(staged, /node_modules\/msw.*1 → 2/);
  assert.match(staged, /Added.*node_modules\/ajv.*2/);
  assert.match(staged, /Removed.*node_modules\/eslint\/node_modules\/ajv.*2/);
  assert.match(staged, /Added.*node_modules\/nest.*1/);
  assert.match(staged, /backend\/package-lock\.json/);
  assert.doesNotMatch(staged, /1 → 3/);
  git('commit', '-qm', 'Topic lockfile changes');
  assert.equal(report('branch', 'main', 'topic'), staged);
  assert.equal(report('staged'), '');
});

test('flags a patch-level downgrade', (t) => {
  const lines = stagedChangeLines(
    t,
    { 'node_modules/minimatch': { version: '11.0.9' } },
    { 'node_modules/minimatch': { version: '11.0.5' } },
  );
  assert.deepEqual(lines, ['    DOWNGRADED node_modules/minimatch 11.0.9 → 11.0.5']);
});

test('lists downgrades before upgrades and other changes', (t) => {
  const lines = stagedChangeLines(
    t,
    {
      'node_modules/@inquirer/core': { version: '12.0.0' },
      'node_modules/mute-stream': { version: '4.0.0' },
    },
    {
      'node_modules/@inquirer/core': { version: '12.1.1' },
      'node_modules/mute-stream': { version: '3.0.0' },
      'node_modules/zod': { version: '4.1.0' },
    },
  );
  assert.deepEqual(lines, [
    '    DOWNGRADED node_modules/mute-stream 4.0.0 → 3.0.0',
    '    UPGRADED node_modules/@inquirer/core 12.0.0 → 12.1.1',
    '    Added node_modules/zod 4.1.0',
  ]);
});

test('orders prereleases by semantic-version precedence', (t) => {
  const lines = stagedChangeLines(
    t,
    {
      'node_modules/beta-to-rc': { version: '3.0.0-beta.11' },
      'node_modules/candidate': { version: '3.0.0-rc.1' },
      'node_modules/longer': { version: '1.0.0-alpha' },
      'node_modules/numeric': { version: '1.0.0-alpha.10' },
      'node_modules/numeric-up': { version: '1.0.0-alpha.9' },
      'node_modules/promoted': { version: '2.0.0-rc.1' },
      'node_modules/released': { version: '2.0.0' },
    },
    {
      'node_modules/beta-to-rc': { version: '3.0.0-rc.1' },
      'node_modules/candidate': { version: '3.0.0-beta.11' },
      'node_modules/longer': { version: '1.0.0-alpha.1' },
      'node_modules/numeric': { version: '1.0.0-alpha.9' },
      'node_modules/numeric-up': { version: '1.0.0-alpha.10' },
      'node_modules/promoted': { version: '2.0.0' },
      'node_modules/released': { version: '2.0.0-rc.1' },
    },
  );
  assert.deepEqual(lines, [
    '    DOWNGRADED node_modules/candidate 3.0.0-rc.1 → 3.0.0-beta.11',
    '    DOWNGRADED node_modules/numeric 1.0.0-alpha.10 → 1.0.0-alpha.9',
    '    DOWNGRADED node_modules/released 2.0.0 → 2.0.0-rc.1',
    '    UPGRADED node_modules/beta-to-rc 3.0.0-beta.11 → 3.0.0-rc.1',
    '    UPGRADED node_modules/longer 1.0.0-alpha → 1.0.0-alpha.1',
    '    UPGRADED node_modules/numeric-up 1.0.0-alpha.9 → 1.0.0-alpha.10',
    '    UPGRADED node_modules/promoted 2.0.0-rc.1 → 2.0.0',
  ]);
});

test('keeps neutral wording for versions that cannot be ordered and for moves', (t) => {
  const lines = stagedChangeLines(
    t,
    {
      'node_modules/build-only': { version: '1.0.0+build.2' },
      'node_modules/eslint/node_modules/minimatch': { version: '11.0.9' },
      'node_modules/from-git': { version: '2.0.0' },
      'node_modules/loose': { version: '1.10' },
      'node_modules/unversioned': { version: '5.0.0' },
    },
    {
      'node_modules/build-only': { version: '1.0.0+build.1' },
      'node_modules/from-git': { version: 'git+https://example.com/from-git.git#abc' },
      'node_modules/loose': { version: '1.9' },
      'node_modules/minimatch': { version: '11.0.9' },
      'node_modules/unversioned': {},
    },
  );
  assert.deepEqual(lines, [
    '    Version changed node_modules/build-only 1.0.0+build.2 → 1.0.0+build.1',
    '    Removed node_modules/eslint/node_modules/minimatch 11.0.9',
    '    Version changed node_modules/from-git 2.0.0 → git+https://example.com/from-git.git#abc',
    '    Version changed node_modules/loose 1.10 → 1.9',
    '    Added node_modules/minimatch 11.0.9',
    '    Version changed node_modules/unversioned 5.0.0 → (no version)',
  ]);
});
