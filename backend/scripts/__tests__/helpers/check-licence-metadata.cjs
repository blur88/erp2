// Licence metadata check for one package directory (#1824, follow-up to #1809).
//
// Usage: node check-licence-metadata.cjs <package-dir>
//
// Exit 0 when package.json and the lockfile root entry (packages[""]) agree on
// name and license, and every declared license is either UNLICENSED or
// "SEE LICENSE IN <file>" with <file> present relative to <package-dir>.
// Exit 1 and one "licence metadata:" line per violation otherwise.
//
// Version equality is deliberately not checked; see #1818.
'use strict';

const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (error) {
    console.error(`licence metadata: cannot read ${file} in ${dir}: ${error.message}`);
    process.exit(1);
  }
};

const pkg = readJson('package.json');
const lockRoot = (readJson('package-lock.json').packages || {})[''] || {};
const violations = [];

for (const field of ['name', 'license']) {
  const inPkg = has(pkg, field);
  const inLock = has(lockRoot, field);
  if (inPkg !== inLock) {
    violations.push(`${field} is present in only one of package.json and the lockfile root`);
  } else if (inPkg && pkg[field] !== lockRoot[field]) {
    violations.push(
      `${field} differs: package.json has ${JSON.stringify(pkg[field])}, ` +
        `lockfile root has ${JSON.stringify(lockRoot[field])}`,
    );
  }
}

function checkLicense(source, value) {
  if (value === 'UNLICENSED') return;
  const match = typeof value === 'string' && /^SEE LICENSE IN (.+)$/.exec(value);
  if (!match) {
    violations.push(
      `license in ${source} is ${JSON.stringify(value)}; the repository is proprietary, ` +
        'so use UNLICENSED or SEE LICENSE IN <file>',
    );
    return;
  }
  const packageDir = path.resolve(dir);
  const file = path.resolve(packageDir, match[1]);
  const relative = path.relative(packageDir, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    violations.push(`license in ${source} points at ${match[1]}, which is outside the package directory`);
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    violations.push(`license in ${source} points at ${match[1]}, which does not exist in ${dir}`);
  }
}

if (has(pkg, 'license')) checkLicense('package.json', pkg.license);
if (has(lockRoot, 'license')) checkLicense('the lockfile root', lockRoot.license);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`licence metadata: ${violation}`);
  }
  process.exit(1);
}
