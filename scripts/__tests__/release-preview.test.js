const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const { historySnapshot, releases } = require('./fixtures/published-releases.json');
const { offlineGitOptions } = require('../release-preview/offline-git.cjs');

const cwd = resolve(__dirname, '../..');
const gitAt = cwd => {
  const options = { ...offlineGitOptions(cwd), encoding: 'utf8' };
  return (...args) => execFileSync('git', args, options).trim();
};
const git = gitAt(cwd);

function replayTags(cwd, snapshot, requiredTags) {
  const git = gitAt(cwd);
  assert.equal(git('rev-parse', '--is-shallow-repository'), 'false',
    'Release replay requires full Git history (checkout with fetch-depth: 0).');
  const snapshotCheck = spawnSync('git', ['cat-file', '-e', `${snapshot}^{commit}`], offlineGitOptions(cwd));
  if (snapshotCheck.error) throw snapshotCheck.error;
  assert.equal(snapshotCheck.status, 0,
    `Release replay snapshot ${snapshot} is missing. Fetch the full repository history.`);
  // Published release tags use vMAJOR.MINOR.PATCH. Git's version sort puts
  // those tags in release order even when several tags share a target.
  const tags = git('tag', '--merged', snapshot, '--sort=version:refname').split('\n');
  const missingTags = [...requiredTags].filter(tag => !tags.includes(tag));
  assert.equal(missingTags.length, 0, `Release replay requires the original release tags. Fetch: ${missingTags.join(', ')}.`);
  return tags;
}

test('Release replay diagnoses incomplete Git history', async t => {
  const repo = mkdtempSync(join(tmpdir(), 'erp2-release-history-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = gitAt(repo);
  git('init', '--quiet');
  git('-c', 'user.name=Release Test', '-c', 'user.email=release@example.test',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Initial commit');
  const head = git('rev-parse', 'HEAD');
  git('tag', 'v1.0.0');
  assert.deepEqual(replayTags(repo, head, ['v1.0.0']), ['v1.0.0']);

  await t.test('reports a missing snapshot commit', () => {
    assert.throws(() => replayTags(repo, historySnapshot, ['v1.0.0']),
      /Release replay snapshot .* is missing\. Fetch the full repository history\./);
  });
  await t.test('names missing release tags', () => {
    assert.throws(() => replayTags(repo, head, ['v1.0.0', 'v1.1.0']),
      /Release replay requires the original release tags\. Fetch: v1\.1\.0\./);
  });
  await t.test('reports a shallow checkout', () => {
    writeFileSync(join(repo, '.git', 'shallow'), `${head}\n`);
    assert.throws(() => replayTags(repo, head, ['v1.0.0']), /Release replay requires full Git history/);
  });
});

// Fixture headings are from the published GitHub release bodies, excluding
// the advisory appended after the separator. Older tags can point to the
// release bot commit immediately after the merge commit.
test(`Release preview replays the published history at ${historySnapshot.slice(0, 9)}`, async t => {
  const requiredTags = new Set(releases.flatMap(({ tag, previousTag }) => [tag, previousTag]));
  const tags = replayTags(cwd, historySnapshot, requiredTags);

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
