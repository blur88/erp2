const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyRelease,
  buildInternalChangesCommits,
} = require('../release-notes-helpers.cjs');

function makeCommit(type, scope, subject) {
  const scope_ = scope ? `(${scope})` : '';
  return { type, scope, subject, header: `${type}${scope_}: ${subject}` };
}

test('feat commit → user-facing', () => {
  assert.equal(classifyRelease([makeCommit('feat', null, 'add thing')]), 'user-facing');
});

test('fix commit → user-facing', () => {
  assert.equal(classifyRelease([makeCommit('fix', 'auth', 'fix login')]), 'user-facing');
});

test('perf commit → user-facing', () => {
  assert.equal(classifyRelease([makeCommit('perf', null, 'speed up query')]), 'user-facing');
});

test('mixed fix + chore → user-facing', () => {
  const commits = [makeCommit('fix', null, 'fix thing'), makeCommit('chore', 'deps', 'update deps')];
  assert.equal(classifyRelease(commits), 'user-facing');
});

test('chore-only → internal-only', () => {
  assert.equal(classifyRelease([makeCommit('chore', 'deps', 'update deps')]), 'internal-only');
});

test('refactor + docs → internal-only', () => {
  const commits = [makeCommit('refactor', 'ui', 'simplify'), makeCommit('docs', null, 'add plan')];
  assert.equal(classifyRelease(commits), 'internal-only');
});

test('empty commits → internal-only', () => {
  assert.equal(classifyRelease([]), 'internal-only');
});

test('release auto-commit excluded from classification', () => {
  const commits = [{ type: 'chore', scope: 'release', subject: '1.2.1', header: 'chore(release): 1.2.1 [skip ci]' }];
  assert.equal(classifyRelease(commits), 'internal-only');
});

test('classifies transformed feat commit via raw type as user-facing', () => {
  const commits = [
    {
      type: 'Features',
      scope: 'release',
      subject: 'add fallback',
      header: 'feat(release): add fallback',
      raw: makeCommit('feat', 'release', 'add fallback'),
    },
  ];

  assert.equal(classifyRelease(commits), 'user-facing');
});

test('excludes release auto-commit', () => {
  const commits = [
    { type: 'chore', scope: 'release', subject: '1.2.1', header: 'chore(release): 1.2.1 [skip ci]' },
    makeCommit('chore', 'deps', 'update packages'),
  ];
  const result = buildInternalChangesCommits(commits);
  assert.equal(result.length, 1);
  assert.equal(result[0], 'chore(deps): update packages');
});

test('preserves type(scope): subject format', () => {
  const commits = [makeCommit('refactor', 'purchasing', 'migrate toolbar')];
  assert.deepEqual(buildInternalChangesCommits(commits), ['refactor(purchasing): migrate toolbar']);
});

test('no scope formats correctly', () => {
  const commits = [makeCommit('docs', null, 'add plan')];
  assert.deepEqual(buildInternalChangesCommits(commits), ['docs: add plan']);
});

test('only includes internal types', () => {
  const commits = [
    makeCommit('feat', null, 'add feature'),
    makeCommit('chore', 'deps', 'update deps'),
  ];
  const result = buildInternalChangesCommits(commits);
  assert.deepEqual(result, ['chore(deps): update deps']);
});

test('dep-update chore(deps) commit included', () => {
  const commits = [makeCommit('chore', 'deps', 'update frontend and backend dependencies')];
  assert.deepEqual(buildInternalChangesCommits(commits), ['chore(deps): update frontend and backend dependencies']);
});

test('builds internal changes entries from transformed commit raw data', () => {
  const commits = [
    {
      type: 'Internal Changes',
      subject: 'chore(deps): update packages',
      header: 'chore(deps): update packages',
      raw: makeCommit('chore', 'deps', 'update packages'),
    },
  ];

  assert.deepEqual(buildInternalChangesCommits(commits), ['chore(deps): update packages']);
});
