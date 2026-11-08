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
