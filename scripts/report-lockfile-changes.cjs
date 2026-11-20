'use strict';

// Report staged and branch npm lockfile resolution changes (#1952).
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

function describeChanges(before, after) {
  const changes = [];
  const version = (entry) => entry.version ?? '(no version)';
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();

  for (const path of paths) {
    const label = path || '.';
    if (!before.has(path)) {
      changes.push(`Added ${label} ${version(after.get(path))}`);
    } else if (!after.has(path)) {
      changes.push(`Removed ${label} ${version(before.get(path))}`);
    } else if (before.get(path).version !== after.get(path).version) {
      changes.push(`Version changed ${label} ${version(before.get(path))} → ${version(after.get(path))}`);
    }
  }
  return changes;
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
