const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { historySnapshot, releases } = require('./fixtures/published-releases.json');

const cwd = resolve(__dirname, '../..');
const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' };
const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

// Fixture headings are from the published GitHub release bodies, excluding
// the advisory appended after the separator. Older tags can point to the
// release bot commit immediately after the merge commit.
test('Release preview replays the published history at 87527002a', async t => {
  assert.equal(git('rev-parse', '--is-shallow-repository'), 'false',
    'Release replay requires full Git history (checkout with fetch-depth: 0).');
  // Published release tags use vMAJOR.MINOR.PATCH. Git's version sort puts
  // those tags in release order even when several tags share a target.
  const tags = git('tag', '--merged', historySnapshot, '--sort=version:refname').split('\n');
  const requiredTags = new Set(releases.flatMap(({ tag, previousTag }) => [tag, previousTag]));
  const missingTags = [...requiredTags].filter(tag => !tags.includes(tag));
  assert.deepEqual(missingTags, [], 'Release replay requires the original release tags. Fetch the missing tags.');

  const { releasePreview } = await import('../release-preview/preview.mjs');
  const { withHistoricalConfig } = await import('../release-preview/historical-config.mjs');

  for (const release of releases) {
    await t.test(release.tag, async () => {
      const { tag, commit, mergeCommit, version, previousTag, headings } = release;
      assert.equal(git('rev-parse', `refs/tags/${tag}^{commit}`), commit, `${tag} target`);
      assert.equal(git('rev-list', '--first-parent', '--merges', '-1', commit), mergeCommit, `${tag} merge commit`);

      const preview = await withHistoricalConfig({ cwd, commit }, config =>
        releasePreview({
          cwd,
          head: commit,
          visibleTags: new Set(tags.slice(0, tags.indexOf(tag))),
          repositoryUrl: 'https://github.com/blur88/erp2.git',
          ...config,
        })
      );

      const diagnostics = `${tag} triggering commits:\n${preview.commits
        .map(({ hash, message }) => `${hash} ${message.split('\n')[0]}`)
        .join('\n')}`;
      const actual = { version: preview.version, previousTag: preview.lastRelease };
      const expected = { version, previousTag };
      if (headings) {
        actual.headings = preview.headings;
        expected.headings = headings;
      }
      assert.deepEqual(actual, expected, diagnostics);
    });
  }
});
