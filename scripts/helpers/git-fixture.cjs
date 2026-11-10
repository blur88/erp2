// Isolated real-Git fixtures for tests and retained review probes.
const { mkdtempSync, realpathSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function createGitFixture({ parent = tmpdir(), env = process.env } = {}) {
  const root = realpathSync(mkdtempSync(path.join(path.resolve(parent), 'git fixture ')));
  const isolatedEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(isolatedEnv, {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CEILING_DIRECTORIES: path.dirname(root),
  });
  function run(command, args, cwd = root, extraEnv = {}) {
    return spawnSync(command, args, { cwd, env: { ...isolatedEnv, ...extraEnv }, encoding: 'utf8' });
  }
  function git(args, cwd = root) {
    const result = run('git', args, cwd);
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `git exited ${result.status}`);
    return result.stdout.trim();
  }
  return { root, env: isolatedEnv, run, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

module.exports = { createGitFixture };
