const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const script = resolve(__dirname, '../check-main-protection.cjs');
function check({ context = 'Required', job = 'Required', run = 'echo ok', release = 'module.exports = {}', live, otherWorkflow } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'main-protection-'));
  try {
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    mkdirSync(join(root, '.github/rulesets'));
    const snapshot = { name: 'main protection', target: 'branch', enforcement: 'active', conditions: {}, bypass_actors: [], rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context }] } }] };
    writeFileSync(join(root, '.github/rulesets/main-protection.json'), JSON.stringify(snapshot));
    writeFileSync(join(root, '.github/workflows/ci.yml'), `jobs:\n  test:\n    name: ${JSON.stringify(job)}\n    steps:\n      - run: ${JSON.stringify(run)}\n`);
    writeFileSync(join(root, 'release.config.cjs'), release);
    if (otherWorkflow) writeFileSync(join(root, '.github/workflows/release.yaml'), otherWorkflow);
    const args = [script, '--root', root];
    if (live) {
      writeFileSync(join(root, 'live.json'), JSON.stringify(live(snapshot)));
      args.push('--compare', join(root, 'live.json'));
    }
    return spawnSync(process.execPath, args, { encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('accepts matching jobs and tag pushes', () => {
  for (const run of ['echo ok', 'git push origin --tags', 'git push origin refs/tags/v1', 'git push origin HEAD:refs/heads/feature']) {
    assert.equal(check({ run }).status, 0, run);
  }
});
test('rejects renamed required jobs and nonexistent contexts', () => {
  for (const input of [{ job: 'Renamed' }, { context: 'Missing' }]) {
    const result = check(input);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /required check/);
  }
});
test('rejects branch writers including multiline commands, options, refspecs and implicit pushes', () => {
  for (const run of ['git push origin main', 'git push origin HEAD:refs/heads/main', 'git -C repo push --force origin HEAD:main', 'git push \\\n origin main', 'git push origin +HEAD:main', 'git push', 'git push --mirror', 'git push origin "$TARGET"', 'git push --tags --repo=origin main', 'git push --tags origin refs/tags/* main']) {
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /push/);
  }
});
test('rejects semantic-release git plugin', () => {
  const result = check({ release: "module.exports = { plugins: ['@semantic-release/git'] }" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@semantic-release\/git/);
});
test('drift ignores server metadata and object key order but catches policy changes', () => {
  assert.equal(check({ live: snapshot => ({ id: 123, updated_at: 'today', ...snapshot }) }).status, 0);
  const result = check({ live: snapshot => ({ ...snapshot, enforcement: 'disabled' }) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /drift/);
});

test('checks other workflows and literal release push commands', () => {
  const workflow = check({ otherWorkflow: 'jobs: {release: {steps: [{run: "git push origin main"}]}}' });
  assert.equal(workflow.status, 1);
  assert.match(workflow.stderr, /release.yaml.*push/);
  const release = check({ release: `module.exports = { prepareCmd: 'git push origin HEAD:main' }` });
  assert.equal(release.status, 1);
  assert.match(release.stderr, /release.config.cjs.*push/);
});
test('permits comments and reports unresolved workflow expressions', () => {
  assert.equal(check({ run: '# git push origin main\necho ok' }).status, 0);
  const result = check({ run: 'git push origin HEAD:${{ github.ref }}' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /push/);
});

for (const run of ['git push origin @', 'git push origin HEAD:heads/main']) {
  test(`rejects main destination alias: ${run}`, () => {
    const result = check({ run });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /push/);
  });
}
test('inspects quoted refspecs inside release command strings', () => {
  const result = check({ release: `module.exports = { publishCmd: 'git push --tags origin "HEAD:main"' }` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release.config.cjs.*push/);
});

test('release strings preserve shell quotes and JavaScript escapes', () => {
  const releases = [
    String.raw`module.exports = { publishCmd: "git push --tags origin \"HEAD:main\"" }`,
    String.raw`module.exports = { publishCmd: 'git push --tags origin HEAD:\u006dain' }`,
    'module.exports = { publishCmd: `git push --tags origin "HEAD:main"` }',
    'module.exports = { publishCmd: `git push --tags origin HEAD:${branch}` }',
  ];
  for (const release of releases) {
    const result = check({ release });
    assert.equal(result.status, 1, release);
    assert.match(result.stderr, /release.config.cjs.*push/);
  }
});

test('accepts safe release literals and skips JavaScript command comments', () => {
  for (const release of [
    `module.exports = { publishCmd: 'git push origin "refs/tags/v1"' }`,
    'module.exports = { publishCmd: `git push origin refs/tags/v1` }',
    '// git push origin main\nmodule.exports = {}',
  ]) {
    const result = check({ release });
    assert.equal(result.status, 0, result.stderr);
  }
});

for (const run of ['git push\necho done', 'git push --force\necho pushed']) {
  test(`rejects implicit push in a YAML block scalar: ${JSON.stringify(run)}`, () => {
    const otherWorkflow = `jobs:\n  release:\n    steps:\n      - run: |\n${run.split('\n').map(line => `          ${line}\n`).join('')}`;
    const result = check({ otherWorkflow });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /release.yaml.*implicit git push/);
  });
}

test('does not read the next command as push arguments', () => {
  const result = check({ run: 'git push origin v1\ngit checkout main' });
  assert.equal(result.status, 0, result.stderr);
});

test('inspects full-path Git commands', () => {
  for (const run of ['/usr/bin/git push origin main', '"/usr/bin/git" push origin main', './git push origin main']) {
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /push/);
  }
});

test('comments do not hide commands on following lines', () => {
  for (const run of ['# release\ngit push origin main', 'echo done # release\ngit push origin main']) {
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /push/);
  }
});

test('keeps pushes separate across shell command separators', () => {
  for (const separator of ['\n', '\r\n', '; ', ' && ', ' || ', ' | ', ' & ']) {
    const result = check({ run: `git push${separator}echo done` });
    assert.equal(result.status, 1, JSON.stringify(separator));
    assert.match(result.stderr, /implicit git push/);
    const safe = check({ run: `git push origin refs/tags/v1${separator}git checkout main` });
    assert.equal(safe.status, 0, safe.stderr);
  }
});

test('preserves quoting and continuations while separating lines', () => {
  const safeCommands = [
    "printf '%s' 'release notes\ngit push origin main\n'",
    'git push \\\n origin --tags\ngit checkout main',
    'git push \\\r\n origin --tags\r\ngit checkout main',
    'git push origin "refs/tags/v1;main"\ngit checkout main',
    'echo "# release"\ngit push origin refs/tags/v1',
    "echo $'escaped\\\' quote\ngit push origin main'",
  ];
  for (const run of safeCommands) {
    const result = check({ run });
    assert.equal(result.status, 0, result.stderr);
  }
  for (const run of ['git \\\n push\necho done', 'echo done # "comment\ngit push', 'git push # comment\necho done']) {
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /implicit git push/);
  }
});

test('checks multiline release command strings with the same command boundaries', () => {
  const result = check({ release: 'module.exports = { publishCmd: `git push\necho done` }' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release.config.cjs.*implicit git push/);
});

test('redirections do not hide later push arguments', () => {
  for (const run of [
    'git push --tags >push.log origin main',
    'git push --tags 2>/dev/null origin HEAD:main',
    'git push --tags origin >push.log HEAD:main',
  ]) {
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /push/);
  }
});

test('hash characters inside words do not start comments', () => {
  for (const run of ['git push --tags origin#release main', 'git push origin refs/tags/v1#x main']) {
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /push/);
  }
});

test('redirection targets and hash words remain separate from refspecs', () => {
  for (const run of [
    'git push --tags >main origin',
    'git push origin refs/tags/v1 2>main',
    'git push --tags origin#release',
    'git push origin refs/tags/v1#release',
    'git push origin refs/tags/v1 # main',
  ]) {
    const result = check({ run });
    assert.equal(result.status, 0, result.stderr);
  }
  const release = check({ release: `module.exports = { publishCmd: 'git push --tags >push.log origin main' }` });
  assert.equal(release.status, 1);
  assert.match(release.stderr, /release.config.cjs.*push/);
});

test('numeric remote words are not file descriptors', () => {
  for (const remote of ['123 ', '"123"', '\\123']) {
    const run = `git push --tags ${remote}>push.log main`;
    const result = check({ run });
    assert.equal(result.status, 1, run);
    assert.match(result.stderr, /push/);
  }
  const result = check({ release: `module.exports = { publishCmd: 'git push --tags 123 >push.log main' }` });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release.config.cjs.*push/);
});

test('only shell whitespace separates words and starts comments', () => {
  for (const space of ['\u000b', '\u00a0', '\u2003']) {
    for (const run of [`git push --tags origin${space}#x main`, `git push origin${space}remote`]) {
      const result = check({ run });
      assert.equal(result.status, 1, JSON.stringify(run));
      assert.match(result.stderr, /push/);
    }
  }
});
