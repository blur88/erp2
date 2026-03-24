const { test } = require('node:test');
const assert = require('node:assert/strict');

const config = require('../../release.config.cjs');

const notesPlugin = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === '@semantic-release/release-notes-generator');
const { finalizeContext, transform } = notesPlugin[1].writerOpts;

function makeCommit(type, scope, subject) {
  const scope_ = scope ? `(${scope})` : '';
  return {
    type,
    scope,
    subject,
    header: `${type}${scope_}: ${subject}`,
    hash: 'abcdef1234567890',
    notes: [],
    references: [],
  };
}

test('mixed releases keep user-facing groups and drop Internal Changes', () => {
  const feat = {
    type: 'Features',
    scope: 'release',
    subject: 'add fallback',
    header: 'feat(release): add fallback',
    raw: makeCommit('feat', 'release', 'add fallback'),
  };
  const internal = {
    type: 'Internal Changes',
    subject: 'chore(deps): update packages',
    header: 'chore(deps): update packages',
    raw: makeCommit('chore', 'deps', 'update packages'),
  };
  const templateContext = {
    commitGroups: [
      { title: 'Features', commits: [{ subject: 'add fallback' }] },
      { title: 'Internal Changes', commits: [{ subject: 'chore(deps): update packages' }] },
    ],
  };

  const result = finalizeContext(templateContext, {}, [feat, internal], feat, [feat, internal]);

  assert.deepEqual(result.commitGroups, [{ title: 'Features', commits: [{ subject: 'add fallback' }] }]);
});

test('internal-only releases render Internal Changes entries from raw commits', () => {
  const internal = {
    type: 'Internal Changes',
    subject: 'chore(deps): update packages',
    header: 'chore(deps): update packages',
    raw: makeCommit('chore', 'deps', 'update packages'),
  };
  const templateContext = { commitGroups: [] };

  const result = finalizeContext(templateContext, {}, [internal], internal, [internal]);

  assert.deepEqual(result.commitGroups, [
    {
      title: 'Internal Changes',
      commits: [{ subject: 'chore(deps): update packages' }],
    },
  ]);
});

test('transform preserves internal commits for fallback rendering', async () => {
  const commit = makeCommit('chore', 'deps', 'update packages');

  const result = await transform(commit, {
    host: 'https://github.com',
    owner: 'blur',
    repository: 'erp2',
  });

  assert.equal(result.type, 'Internal Changes');
  assert.equal(result.subject, 'chore(deps): update packages');
});
