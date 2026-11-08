const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkRepository } = require('../check-main-protection.cjs');

const script = resolve(__dirname, '../check-main-protection.cjs');
function fixture({ context = 'Required', job = 'Required', run = 'echo ok', release = 'module.exports = {}', otherWorkflow } = {}, inspect) {
  const root = mkdtempSync(join(tmpdir(), 'main-protection-'));
  try {
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    mkdirSync(join(root, '.github/rulesets'));
    const snapshot = { name: 'main protection', target: 'branch', enforcement: 'active', conditions: {}, bypass_actors: [], rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context }] } }] };
    writeFileSync(join(root, '.github/rulesets/main-protection.json'), JSON.stringify(snapshot));
    writeFileSync(join(root, '.github/workflows/ci.yml'), `jobs:\n  test:\n    name: ${JSON.stringify(job)}\n    steps:\n      - run: ${JSON.stringify(run)}\n`);
    writeFileSync(join(root, 'release.config.cjs'), release);
    if (otherWorkflow) writeFileSync(join(root, '.github/workflows/release.yaml'), otherWorkflow);
    return inspect(root, snapshot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts matching jobs, ordinary Git reads and semantic-release publishing', () => {
  fixture({ run: 'git fetch --tags\nnpx semantic-release', release: "module.exports = { plugins: ['@semantic-release/github'] }" }, root => {
    assert.doesNotThrow(() => checkRepository(root));
  });
});

test('rejects renamed required jobs and missing contexts', () => {
  for (const input of [{ job: 'Renamed' }, { context: 'Missing' }]) {
    fixture(input, root => assert.throws(() => checkRepository(root), /required check/));
  }
});

test('forbids every explicit push irrespective of destination or shell expansion', () => {
  const commands = [
    'git push origin x:{main,foo}', 'git push origin {HEAD:main,x}',
    'git push', 'git push --force\necho pushed', 'git push origin @',
    'git push origin HEAD:heads/main', 'git push origin main',
    'git push --tags', 'git push origin refs/tags/v1', 'git push origin HEAD:feature',
    'git push --tags --repo=origin main', 'git push origin "$TARGET"',
    'git push --tags >push.log origin main', 'git push --tags 123 >push.log main',
    'git push --tags origin#release main', 'git push --tags origin\r#x main',
    'git push origin\\\u00a0repo', 'git -C repo push --force origin main',
    'git \\\n push origin main', '/usr/bin/git push origin main',
    '"/usr/bin/git" push origin main', "g'it' p'ush' origin main",
  ];
  for (const run of commands) {
    fixture({ run }, root => assert.throws(() => checkRepository(root), /explicit git push is forbidden/, run));
  }
});

test('conservatively rejects matching text even in comments, echo or unrelated commands', () => {
  for (const run of ['# git push origin main', 'echo git push', 'git fetch\necho push', "cat <<'EOF'\ngit push origin main\nEOF"]) {
    fixture({ run }, root => assert.throws(() => checkRepository(root), /explicit git push is forbidden/));
  }
});

test('checks block scalars in other workflow files', () => {
  const otherWorkflow = 'jobs:\n  release:\n    steps:\n      - run: |\n          git push\n          echo done\n';
  fixture({ otherWorkflow }, root => assert.throws(() => checkRepository(root), /release.yaml.*explicit git push/));
});

test('checks decoded release strings, templates and constant concatenations without execution', () => {
  for (const release of [
    `module.exports = { publishCmd: 'git push --tags origin "HEAD:main"' }`,
    'module.exports = { publishCmd: `git push origin x:{main,foo}` }',
    "module.exports = { publishCmd: 'git ' + 'push origin main' }",
    String.raw`module.exports = { publishCmd: 'g\u0069t push origin main' }`,
    'module.exports = { publishCmd: `git ${options} push ${target}` }',
  ]) {
    fixture({ release }, root => assert.throws(() => checkRepository(root), /release.config.cjs.*explicit git push/));
  }
  fixture({ release: "throw new Error('must not execute config'); module.exports = {};" }, root => assert.doesNotThrow(() => checkRepository(root)));
});

test('rejects parsed Git plugin names, but permits GitHub plugin and JavaScript comments', () => {
  for (const name of ["'@semantic-release/git'", '`@semantic-release/git`', String.raw`'\u0040semantic-release/git'`, "'@semantic-release/' + 'git'", "`@semantic-release/${'git'}`"]) {
    fixture({ release: `module.exports = { plugins: [${name}] }` }, root => assert.throws(() => checkRepository(root), /@semantic-release\/git is forbidden/));
  }
  fixture({ release: "// @semantic-release/git and git push are forbidden\nmodule.exports = { plugins: ['@semantic-release/github'] };" }, root => assert.doesNotThrow(() => checkRepository(root)));
});

test('rejects the Git release plugin in workflow commands', () => {
  for (const name of ['@semantic-release/git', "@semantic-release/'git'", '@semantic-release/gi\\t']) {
    fixture({ run: `npx semantic-release --plugins ${name}` }, root => assert.throws(() => checkRepository(root), /@semantic-release\/git is forbidden/));
  }
});

test('CLI fails deliberately broken fixtures', () => {
  for (const [input, diagnostic] of [[{ job: 'Renamed' }, /required check/], [{ run: 'git push origin x:{main,foo}' }, /explicit git push/]]) {
    fixture(input, root => {
      const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, diagnostic);
    });
  }
});

test('drift ignores server metadata but reports policy changes', () => {
  fixture({}, (root, snapshot) => {
    const live = join(root, 'live.json');
    for (const [value, status, diagnostic] of [
      [{ id: 123, updated_at: 'today', ...snapshot }, 0, /No ruleset drift/],
      [{ ...snapshot, enforcement: 'disabled' }, 1, /Ruleset drift detected/],
    ]) {
      writeFileSync(live, JSON.stringify(value));
      const result = spawnSync(process.execPath, [script, '--root', root, '--compare', live], { encoding: 'utf8' });
      assert.equal(result.status, status);
      assert.match(result.stdout + result.stderr, diagnostic);
    }
  });
});
