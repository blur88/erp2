'use strict';

// Report staged and branch npm lockfile resolution changes (#1952), listing SemVer downgrades first (#2026).
const { execFileSync } = require('node:child_process');

const indexRevision = '';
const lockfiles = [
  'package-lock.json',
  'backend/package-lock.json',
  'frontend/package-lock.json',
];

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
}

function readPackages(revision, path) {
  const lockfile = JSON.parse(git('show', `${revision}:${path}`));
  if (!lockfile.packages || typeof lockfile.packages !== 'object') {
    throw new Error(`${revision}:${path} has no packages map`);
  }
  return new Map(Object.entries(lockfile.packages));
}

// SemVer 2.0.0 grammar (https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string).
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function parseVersion(value) {
  const match = typeof value === 'string' && semverPattern.exec(value);
  if (!match) return undefined;
  return { core: match.slice(1, 4), prerelease: match[4]?.split('.') ?? [] };
}

function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Digit strings without leading zeros order by length, then lexically.
function compareNumeric(a, b) {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return compareStrings(a, b);
}

function compareIdentifiers(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return compareNumeric(a, b);
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return compareStrings(a, b);
}

// Returns -1, 0 or 1 by SemVer precedence, or undefined when either value is not a valid version.
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return undefined;
  for (let i = 0; i < 3; i += 1) {
    const order = compareNumeric(left.core[i], right.core[i]);
    if (order) return order;
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return Math.sign(right.prerelease.length - left.prerelease.length);
  }
  for (let i = 0; i < Math.min(left.prerelease.length, right.prerelease.length); i += 1) {
    const order = compareIdentifiers(left.prerelease[i], right.prerelease[i]);
    if (order) return order;
  }
  return Math.sign(left.prerelease.length - right.prerelease.length);
}

const versionLabels = { [-1]: 'UPGRADED', 0: 'Version changed', 1: 'DOWNGRADED' };

function describeChanges(before, after) {
  const downgrades = [];
  const changes = [];
  const displayVersion = (entry) => entry.version ?? '(no version)';
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();

  for (const path of paths) {
    const label = path || '.';
    const from = before.get(path);
    const to = after.get(path);
    if (!before.has(path)) {
      changes.push(`Added ${label} ${displayVersion(to)}`);
    } else if (!after.has(path)) {
      changes.push(`Removed ${label} ${displayVersion(from)}`);
    } else if (from.version !== to.version) {
      // Unorderable values and equal precedence (build metadata only) stay neutral.
      const order = compareVersions(from.version, to.version) ?? 0;
      const line = `${versionLabels[order]} ${label} ${displayVersion(from)} → ${displayVersion(to)}`;
      (order > 0 ? downgrades : changes).push(line);
    }
  }
  return [...downgrades, ...changes];
}

function main([mode, base, head = 'HEAD', ...extra]) {
  let before;
  let after;
  if (mode === 'staged' && base === undefined) {
    before = 'HEAD';
    after = indexRevision;
  } else if (mode === 'branch' && extra.length === 0) {
    before = git('merge-base', '--', base ?? 'main', head);
    after = git('rev-parse', '--verify', '--end-of-options', `${head}^{commit}`);
  } else {
    throw new Error('Usage: node scripts/report-lockfile-changes.cjs staged | branch [base=main] [head=HEAD]');
  }

  const comparison = after === indexRevision ? ['--cached', before] : [before, after];
  const diff = git('diff', '--name-status', '--no-renames', ...comparison, '--', ...lockfiles);
  if (!diff) return;

  for (const line of diff.split('\n')) {
    const [status, path] = line.split('\t');
    const oldPackages = status === 'A' ? new Map() : readPackages(before, path);
    const newPackages = status === 'D' ? new Map() : readPackages(after, path);
    const changes = describeChanges(oldPackages, newPackages);
    console.log(`### ${path}\n`);
    for (const change of changes.length ? changes : ['No package path or version changes.']) {
      console.log(`    ${change}`);
    }
    console.log();
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
