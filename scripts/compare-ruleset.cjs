'use strict';

// Normalize and compare observable repository ruleset configuration (#1898).
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical).sort((a, b) => {
      const left = JSON.stringify(a);
      const right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function observableConfiguration(data, path) {
  if (typeof data.target !== 'string' || typeof data.enforcement !== 'string' ||
      !data.conditions || typeof data.conditions !== 'object' || Array.isArray(data.conditions) ||
      !Array.isArray(data.rules) || data.rules.some(rule => !rule || typeof rule.type !== 'string' ||
        (rule.type === 'required_status_checks' &&
          (!Array.isArray(rule.parameters?.required_status_checks) ||
            rule.parameters.required_status_checks.some(check => !check || typeof check.context !== 'string'))))) {
    throw new Error(`Missing required observable ruleset fields in ${path}; stop and report the access limitation on #1898`);
  }
  return {
    target: data.target,
    enforcement: data.enforcement,
    conditions: data.conditions,
    rules: data.rules,
  };
}

function normalize(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return JSON.stringify(canonical(observableConfiguration(data, path)), null, 2) + '\n';
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: compare-ruleset.cjs <snapshot> <live> | --normalize <live>');
  if (args[0] === '--normalize') {
    process.stdout.write(normalize(args[1]));
  } else {
    const expected = normalize(args[0]);
    const actual = normalize(args[1]);
    if (expected === actual) {
      console.log('Ruleset matches the reviewed baseline.');
    } else {
      console.error('::error::Ruleset drift detected. Review the configuration diff; the baseline has not been changed.');
      const dir = mkdtempSync(join(tmpdir(), 'ruleset-diff-'));
      try {
        writeFileSync(join(dir, 'baseline'), expected);
        writeFileSync(join(dir, 'live'), actual);
        const diff = spawnSync('diff', ['-u', '--label', 'committed baseline', '--label', 'live ruleset', join(dir, 'baseline'), join(dir, 'live')], { stdio: 'inherit' });
        if (diff.error) throw diff.error;
        if (diff.status !== 1) throw new Error(`diff failed with status ${diff.status}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
