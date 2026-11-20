const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const reporter = resolve(__dirname, '../report-lockfile-changes.cjs');

test('reports staged paths and branch changes from the merge base', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'lockfile-report-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const report = (...args) => execFileSync(process.execPath, [reporter, ...args], {
    cwd,
    encoding: 'utf8',
  });
  const writeLockfile = (path, packages) =>
    writeFileSync(join(cwd, path), JSON.stringify({ packages }));

  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
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
