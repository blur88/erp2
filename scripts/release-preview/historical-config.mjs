import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const installedPresets = new Map([
  ['8.1.0', 'conventional-changelog-angular-v8'],
  ['9.4.0', 'conventional-changelog-angular'],
]);
const legacyPublishPlugins = new Set(['@semantic-release/npm', '@semantic-release/git']);

function historicalPreset(git, commit) {
  const packagePath = 'package.json';
  const packageExists = git('ls-tree', '--name-only', commit, '--', packagePath).trim();
  const manifest = packageExists ? JSON.parse(git('show', `${commit}:${packagePath}`)) : {};
  const version = manifest.devDependencies?.['conventional-changelog-angular']
    ?? /conventional-changelog-angular@([\d.]+)/.exec(git('show', `${commit}:.github/workflows/release.yml`))?.[1];
  const installedPackage = installedPresets.get(version);
  if (!installedPackage) {
    throw new Error(`No installed Angular preset for ${commit} (historical pin: ${version ?? 'missing'}).`);
  }
  return fileURLToPath(new URL(`../../node_modules/${installedPackage}`, import.meta.url));
}

/** Load the config for a trusted historical commit without changing the checkout. */
export async function withHistoricalConfig({ cwd, commit }, run) {
  const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' };
  const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' });
  const preset = historicalPreset(git, commit);
  const configDirectory = mkdtempSync(join(tmpdir(), 'erp2-release-preview-'));
  try {
    mkdirSync(join(configDirectory, 'scripts'));
    mkdirSync(join(configDirectory, 'node_modules'));
    for (const path of ['release.config.cjs', 'scripts/release-notes-helpers.cjs']) {
      writeFileSync(join(configDirectory, path), git('show', `${commit}:${path}`));
    }
    symlinkSync(preset, join(configDirectory, 'node_modules/conventional-changelog-angular'), 'dir');

    const config = require(join(configDirectory, 'release.config.cjs'));
    const plugins = config.plugins.filter(entry => !legacyPublishPlugins.has(Array.isArray(entry) ? entry[0] : entry));
    return await run({ configDirectory, plugins });
  } finally {
    rmSync(configDirectory, { recursive: true, force: true });
  }
}
