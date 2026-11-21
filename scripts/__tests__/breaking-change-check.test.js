const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const root = resolve(__dirname, '../..');
const standardBody = [
  '## Breaking release',
  '- Breaking change: no',
  '- Upgrade documentation: N/A: No upgrade steps.',
  '## Release boundary',
  '- Maintainer decision: None',
].join('\n');

function fixture(t, { messages = ['fix: correct an error'], baseMessage, files = {}, mergeMessage, mergeBase } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'erp2-breaking-check-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = message => git('commit', '--quiet', '--allow-empty', '-m', message);
  git('init', '--quiet', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('remote', 'add', 'origin', 'https://github.com/blur88/erp2.git');
  writeFileSync(join(cwd, 'release.config.cjs'), `
    const config = require(${JSON.stringify(join(root, 'release.config.cjs'))});
    module.exports = { ...config, plugins: config.plugins.slice(0, 2) };
  `);
  git('add', '.');
  commit('Initial commit');
  git('tag', 'v1.0.0');
  git('branch', 'topic');
  if (baseMessage) commit(baseMessage);
  const base = git('rev-parse', 'HEAD');
  git('switch', '--quiet', 'topic');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), content);
    git('add', '--', path);
  }
  for (const message of messages) commit(message);
  if (mergeBase) git('merge', '--quiet', '--no-ff', 'main', '-m', mergeBase === true ? 'Merge main' : mergeBase);
  const head = git('rev-parse', 'HEAD');
  git('switch', '--quiet', 'main');
  git('merge', '--quiet', '--no-ff', 'topic', '-m', mergeMessage ?? 'Merge pull request #42');
  const merge = git('rev-parse', 'HEAD');

  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const env = process.env;
if (env.GH_TEST_FAIL) process.exit(41);
const endpoint = process.argv.slice(2).join(' ');
const replies = {
  'api repos/blur88/erp2/pulls/42': [env.GH_TEST_FIRST, env.GH_TEST_SECOND],
  'api repos/blur88/erp2/git/ref/heads/main': [env.GH_TEST_MAIN, env.GH_TEST_MAIN_SECOND],
};
if (!Object.hasOwn(replies, endpoint)) process.exit(41);
const marker = endpoint.endsWith('/main') ? 'gh-main-called' : 'gh-called';
const second = fs.existsSync(marker);
fs.writeFileSync(marker, '');
const [first, next] = replies[endpoint];
process.stdout.write(second && next || first);
`, { mode: 0o755 });
  const summaryPath = join(cwd, 'summary.md');
  const metadata = { head: { sha: head }, base: { sha: base, ref: 'main' }, merge_commit_sha: merge };
  function run(body = standardBody, { first = {}, second, main = base, nextMain = main, fail = false, writeSummary = true } = {}) {
    rmSync(join(cwd, 'gh-called'), { force: true });
    rmSync(join(cwd, 'gh-main-called'), { force: true });
    rmSync(summaryPath, { force: true });
    const result = spawnSync(process.execPath, [join(root, 'scripts/breaking-change-check.cjs'), '42'], {
      cwd, encoding: 'utf8',
      env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`,
        GITHUB_STEP_SUMMARY: writeSummary ? summaryPath : undefined, GITHUB_EVENT_PATH: join(cwd, 'event.json'),
        GH_TEST_FIRST: JSON.stringify({ ...metadata, body, ...first }),
        GH_TEST_SECOND: second ? JSON.stringify({ ...metadata, body, ...second }) : '',
        GH_TEST_MAIN: JSON.stringify({ object: { sha: main } }),
        GH_TEST_MAIN_SECOND: JSON.stringify({ object: { sha: nextMain } }),
        GH_TEST_FAIL: fail ? '1' : '',
      },
    });
    if (result.error) throw result.error;
    return { ...result, summary: existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '' };
  }
  return { cwd, git, run, metadata };
}

test('checks the current PR and reports its classification separately from the merge preview', t => {
  const result = fixture(t).run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.summary, /^## PR classification\n[^\n]*non-breaking/m);
  assert.match(result.summary, /^## Release preview\n[^\n]*1\.0\.1 \(patch\)/m);
  assert.match(result.summary, /^### Bug Fixes/m);
});

function rejects(result, diagnostic) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, diagnostic);
  assert.match(result.summary, /## Breaking Change Check failed/);
}

test('rejects missing and malformed declarations in the required sections', t => {
  const { run } = fixture(t);
  rejects(run(standardBody.replace('## Breaking release', '## Other')), /## Breaking release.*`- Breaking change: no`/);
  rejects(run(standardBody.replace('## Release boundary', '## Other')), /## Release boundary.*`- Maintainer decision: None`/);
  for (const malformed of ['- Breaking change = no', '- breaking change: no']) {
    rejects(run(standardBody.replace('- Breaking change: no', malformed)),
      /malformed field.*`- Breaking change: <value>`/);
  }
});

test('requires a job summary output path', t => {
  const result = fixture(t).run(standardBody, { writeSummary: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set GITHUB_STEP_SUMMARY to the path for the job summary/);
});

const upgrade = 'docs/upgrade.md';
const adr = 'docs/adr/0005-release-check.md';
const permalink = 'https://github.com/blur88/erp2/issues/1994#issuecomment-1234';
const footer = '\n\nBREAKING CHANGE: Update the configuration.';
const breakingBody = standardBody.replace('change: no', 'change: yes')
  .replace('N/A: No upgrade steps.', upgrade);
const exceptionBody = standardBody.replace('decision: None', 'decision: Approved for this PR');
const exceptionFields = (adrValue, impact) => `\n- Applicable ADR: ${adrValue}\n- Release-impact decision: ${impact}`;

for (const [header, plainType] of [
  ['feat: example', 'minor'], ['fix: example', 'patch'], ['perf: example', 'patch'],
  ['docs: example', 'no release'], ['chore: example', 'patch'], ['style: example', 'patch'],
  ['refactor: example', 'patch'], ['test: example', 'no release'], ['ci: example', 'no release'],
  ['build: example', 'no release'], ['revert: example', 'no release'], ['Untyped header', 'no release'],
]) {
  test(`uses the configured analyzer for ${header}, with and without a footer`, t => {
    const plain = fixture(t, { messages: [header] }).run();
    assert.equal(plain.status, 0, plain.stderr);
    assert.ok(plain.summary.includes(`non-breaking (${plainType})`));
    if (plainType === 'no release') assert.match(plain.summary, /## Release preview\nNo release/);

    const breaking = fixture(t, { messages: [header + footer], files: { [upgrade]: '# Upgrade' } }).run(breakingBody);
    assert.equal(breaking.status, 0, breaking.stderr);
    assert.match(breaking.summary, /Breaking \(major\)/);
  });
}

test('checks both conflicting declarations and reports the commit metadata to fix', t => {
  const major = fixture(t, { messages: ['chore: introduce change' + footer, 'docs: follow-up'] });
  rejects(major.run(), /Breaking change:.*yes.*remove or move.*BREAKING CHANGE:/);
  const patch = fixture(t, { files: { [upgrade]: '# Upgrade' } });
  rejects(patch.run(breakingBody), /Breaking change:.*no.*add or move.*BREAKING CHANGE:/);
});

test('includes an unreleased break on main only in the release preview', t => {
  const result = fixture(t, { baseMessage: 'feat: unreleased on main' + footer }).run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.summary, /non-breaking \(patch\)/);
  assert.match(result.summary, /## Release preview\n2\.0\.0 \(major\)/);
});

test('classifies a PR-owned merge commit', t => {
  const prMerge = fixture(t, { baseMessage: 'docs: main update', mergeBase: 'fix: merge' + footer });
  const result = prMerge.run();
  rejects(result, /Breaking change:.*major/);
  assert.ok(result.stderr.includes(prMerge.metadata.head.sha));
});

for (const header of ['feat!: unsupported', 'feat(scope)!: unsupported', 'docs!: unsupported']) {
  test(`rejects ${header} on an earlier PR commit even with a footer`, t => {
    const { run } = fixture(t, { messages: [header + footer, 'fix: follow-up'] });
    rejects(run(), /Commit [0-9a-f]{40} uses an unsupported ! header.*BREAKING CHANGE:/);
  });
}

test('rejects a bang header without a breaking footer', t => {
  const { run } = fixture(t, { messages: ['feat!: unsupported'] });
  rejects(run(), /Commit [0-9a-f]{40} uses an unsupported ! header/);
});

test('accepts old field forms and ignores quoted and fenced templates', t => {
  const { run } = fixture(t);
  const body = [
    '~~~~markdown', standardBody, '~~~', standardBody, '~~~~',
    ...standardBody.split('\n').map(line => `> ${line}`),
    standardBody.replace('- Breaking change: no', '- **Breaking change:** no <!-- confirmed -->')
      .replace('- Upgrade documentation:', '- **Upgrade documentation** —').replace('None', 'None.'),
    '```md', standardBody, '```',
  ].join('\n');
  const result = run(body);
  assert.equal(result.status, 0, result.stderr);
});

test('rejects mixed-form duplicates and fields under nested headings', t => {
  const { run } = fixture(t);
  rejects(run(standardBody.replace('change: no', 'change: no\n- **Breaking change** — no')), /Breaking change: duplicate/);
  rejects(run(standardBody.replace('- Breaking change', '### Example\n- Breaking change')), /Breaking change:/);
});

test('rejects placeholder values and empty or placeholder reasons', t => {
  const { run } = fixture(t);
  for (const value of ['', ' ', '<reason>', '<path>', '<link>', '<decision>', '<anything>', 'TODO',
    'tBd', 'placeholder', 'fill in', 'link', 'URL', '...', 'https://example.com/docs', 'https://example.org/docs',
    'N/A:', 'N/A: TODO', 'N/A: <reason>', 'None:']) {
    rejects(run(standardBody.replace('N/A: No upgrade steps.', value)), /Upgrade documentation:/);
  }
  for (const value of ['', 'TODO', 'None: TBD']) {
    rejects(run(standardBody.replace('decision: None', `decision: ${value}`)), /Maintainer decision:/);
  }
});

test('validates upgrade paths in the merge tree, including docs added by the PR', t => {
  const { run, cwd } = fixture(t, { files: { [upgrade]: '# Upgrade' } });
  rmSync(join(cwd, upgrade));
  writeFileSync(join(cwd, 'untracked.md'), 'Untracked');
  const result = run(standardBody.replace('N/A: No upgrade steps.', upgrade));
  assert.equal(result.status, 0, result.stderr);
  for (const value of ['untracked.md', '/docs/upgrade.md', '../docs/upgrade.md', 'docs/../docs/upgrade.md', 'docs']) {
    rejects(run(standardBody.replace('N/A: No upgrade steps.', value)), /Upgrade documentation:.*exists in the merge result/);
  }
  rejects(run(breakingBody.replace(upgrade, 'N/A: No upgrade steps.')), /Upgrade documentation:/);
});

test('allows only empty or absent exception fields without a Maintainer decision', t => {
  const { run } = fixture(t);
  const result = run(standardBody + exceptionFields('', '<!-- leave empty -->'));
  assert.equal(result.status, 0, result.stderr);
  rejects(run(standardBody + exceptionFields(adr, '')), /Applicable ADR:.*empty/);
  rejects(run(standardBody + exceptionFields('', permalink)), /Release-impact decision:.*empty/);
});

test('requires both exception fields and treats None-like prose as an exception', t => {
  const { run } = fixture(t, { files: { [adr]: '# ADR' } });
  for (const decision of ['None stated', 'None needed', 'Not applicable']) {
    rejects(run(standardBody.replace('decision: None', `decision: ${decision}`)), /Applicable ADR:/);
  }
  rejects(run(exceptionBody + exceptionFields(adr, '')), /Release-impact decision:/);
  rejects(run(exceptionBody + exceptionFields('', permalink)), /Applicable ADR:/);
  for (const value of ['None', 'None:', 'None: TBD', 'docs/adr/0006-missing.md', 'docs/adr/other.md',
    '/docs/adr/0005-release-check.md', 'docs/adr/../adr/0005-release-check.md', '0005-release-check.md']) {
    rejects(run(exceptionBody + exceptionFields(value, permalink)), /Applicable ADR:/);
  }
  for (const value of ['#42', 'approved in review', '/blur88/erp2/pull/42#discussion_r24',
    'http://github.com/blur88/erp2/pull/42#discussion_r24', 'https://github.com/other/erp2/pull/42#discussion_r24',
    'https://example.com/blur88/erp2/pull/42#discussion_r24', 'https://github.com/blur88/erp2/pull/42']) {
    rejects(run(exceptionBody + exceptionFields(adr, value)), /Release-impact decision:/);
  }
  const markdown = '[Review](https://github.com/blur88/erp2/pull/42#pullrequestreview-24)';
  for (const fields of [exceptionFields(adr, permalink), exceptionFields('None: Small change.', markdown)]) {
    const result = run(exceptionBody + fields);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('requires a real ADR for a breaking exception and accepts one added in the PR', t => {
  const body = breakingBody.replace('decision: None', 'decision: Approved by the maintainer');
  const { run } = fixture(t, { messages: ['feat: redesign' + footer], files: { [adr]: '# ADR', [upgrade]: '# Upgrade' } });
  rejects(run(body + exceptionFields('None: Small change.', permalink)), /Applicable ADR:/);
  const result = run(body + exceptionFields(adr, permalink));
  assert.equal(result.status, 0, result.stderr);
});

test('rejects stale or missing merge metadata and a head change during execution', t => {
  const { run, metadata } = fixture(t);
  const stale = /merge ref stale or unverifiable; re-run/;
  const absent = 'a'.repeat(40);
  for (const first of [
    { head: { sha: absent } }, { base: { sha: absent, ref: 'main' } },
    { base: { sha: metadata.head.sha, ref: 'main' } },
    { base: { sha: metadata.base.sha, ref: 'other' } },
    { merge_commit_sha: metadata.head.sha }, { merge_commit_sha: absent },
    { merge_commit_sha: null }, { merge_commit_sha: 'HEAD' },
  ]) {
    rejects(run(standardBody, { first }), stale);
  }
  rejects(run(standardBody, { second: { head: { sha: absent } } }), /head or main tip changed during the check/);
});

test('accepts a lagging PR base SHA and classifies against the live main tip', t => {
  const { run, git } = fixture(t, { baseMessage: 'feat: change on main' + footer, mergeBase: true });
  const result = run(standardBody, { first: { base: { sha: git('rev-parse', 'v1.0.0'), ref: 'main' } } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.summary, /non-breaking \(patch\)/);
  assert.match(result.summary, /## Release preview\n2\.0\.0 \(major\)/);
});

test('rejects a merge whose first parent is behind the live main tip', t => {
  const { run, git, metadata } = fixture(t);
  git('switch', '--quiet', '--detach', metadata.base.sha);
  git('commit', '--quiet', '--allow-empty', '-m', 'docs: newer main');
  const main = git('rev-parse', 'HEAD');
  git('switch', '--quiet', '--detach', metadata.merge_commit_sha);
  rejects(run(standardBody, { main }), /merge ref stale or unverifiable; re-run/);
});

test('rejects a live main advance during the check', t => {
  const { run, git, metadata } = fixture(t);
  git('switch', '--quiet', '--detach', metadata.base.sha);
  git('commit', '--quiet', '--allow-empty', '-m', 'docs: newer main');
  const nextMain = git('rev-parse', 'HEAD');
  git('switch', '--quiet', '--detach', metadata.merge_commit_sha);
  rejects(run(standardBody, { nextMain }), /merge ref stale or unverifiable; re-run.*head or main tip changed/);
});

test('rejects a re-run on the previous two-parent merge result of the same PR', t => {
  const { run, git, metadata } = fixture(t);
  git('switch', '--quiet', 'topic');
  git('commit', '--quiet', '--allow-empty', '-m', 'fix: update the PR');
  const head = git('rev-parse', 'HEAD');
  git('switch', '--quiet', '--detach', metadata.base.sha);
  git('merge', '--quiet', '--no-ff', 'topic', '-m', 'Merge updated pull request #42');
  const merge = git('rev-parse', 'HEAD');
  git('switch', '--quiet', '--detach', metadata.merge_commit_sha);
  rejects(run(standardBody, { first: { head: { sha: head }, merge_commit_sha: merge } }),
    /merge ref stale or unverifiable; re-run/);
});

test('rejects missing history and tags', t => {
  const { cwd, git, run, metadata } = fixture(t);
  const shallow = join(cwd, '.git', 'shallow');
  writeFileSync(shallow, metadata.merge_commit_sha + '\n');
  rejects(run(), /merge ref stale or unverifiable; re-run: Full Git history/);
  rmSync(shallow);
  git('tag', '-d', 'v1.0.0');
  rejects(run(), /merge ref stale or unverifiable; re-run: no reachable release tag/);
});

test('fails closed when gh, the analyzer or notes generation fails', t => {
  const { cwd, run } = fixture(t);
  rejects(run(standardBody, { fail: true }), /Could not fetch current metadata.*gh api/);
  const config = join(cwd, 'release.config.cjs');
  const original = readFileSync(config, 'utf8');
  writeFileSync(config, original + '\nmodule.exports.plugins[0][1].config = "missing-analyzer-config";');
  rejects(run(), /missing-analyzer-config/);
  writeFileSync(config, original + '\nmodule.exports.plugins[1][1].config = "missing-notes-config";');
  rejects(run(), /missing-notes-config/);
});

test('uses gh over the event body and treats shell syntax as plain text', t => {
  const { cwd, run } = fixture(t);
  writeFileSync(join(cwd, 'event.json'), JSON.stringify({ pull_request: { body: 'decoy', merge_commit_sha: 'stale' } }));
  const body = standardBody.replace('N/A: No upgrade steps.', 'N/A: $(touch injected); `touch injected`; ordinary text');
  const result = run(body);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(cwd, 'injected')), false);
});
