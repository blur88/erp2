// scripts/compose-smoke-paths.sh decides whether the Frontend CI job runs the
// Compose deployment and ingress smoke test (#1966): exit 0 when any changed
// path (one per stdin line) can affect the stack, exit 1 otherwise.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../compose-smoke-paths.sh');

function decide(...paths) {
  return spawnSync('bash', [script], { input: paths.join('\n') + (paths.length ? '\n' : ''), encoding: 'utf8' });
}

for (const changed of [
  'deploy.sh',
  'docker-compose.yml',
  'docker-compose.override.yml',
  'docker-compose.prod.yml',
  'nginx/nginx.conf',
  'nginx/security-headers.conf',
  'nginx/Dockerfile',
  'frontend/nginx.conf',
  '.env.example',
  'scripts/ingress-smoke.sh',
  'scripts/compose-smoke-paths.sh',
  '.github/workflows/ci.yml',
]) {
  test(`${changed} runs the smoke test`, () => {
    const result = decide('README.md', changed, 'frontend/src/App.tsx');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(changed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
}

for (const [label, changed] of [
  ['frontend source', ['frontend/src/App.tsx', 'frontend/package.json']],
  ['backend source', ['backend/src/main.ts']],
  ['docs', ['docs/deployment/INGRESS_UPGRADE.md', 'README.md']],
  ['an unrelated script', ['scripts/cleanup-merged-pr.sh']],
  ['an unrelated workflow', ['.github/workflows/release.yml']],
  ['look-alike paths', ['nginxy/nginx.conf', 'frontend/nginx.conf.md', 'docs/deploy.sh', 'sub/docker-compose.yml', 'env.example']],
  ['nothing changed', []],
]) {
  test(`${label} skips the smoke test`, () => {
    const result = decide(...changed);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  });
}
