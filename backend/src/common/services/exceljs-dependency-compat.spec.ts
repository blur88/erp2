import { readFileSync } from 'node:fs';

const manifest: { overrides?: Record<string, unknown> } = JSON.parse(
  readFileSync('package.json', 'utf8'),
);
const lockfile: { packages: Record<string, { name?: string; version: string }> } = JSON.parse(
  readFileSync('package-lock.json', 'utf8'),
);
const hasGlobalGlobOverride = Object.hasOwn(manifest.overrides ?? {}, 'glob');
const compatibilityFailureMessage =
  'While the backend globally overrides glob, criterion 1 excludes fstream and rimraf below v4 because the affected rimraf wildcard-removal path expects glob to be callable.';

describe('ExcelJS dependency compatibility', () => {
  it('keeps the global glob override in place', () => {
    // Accidental deletion must fail here. Intentional removal must update this test in the same PR.
    expect(hasGlobalGlobOverride).toBe(true);
  });

  it('excludes fstream and rimraf below v4 while globally overriding glob', () => {
    if (!hasGlobalGlobOverride) return;

    const offenders = Object.entries(lockfile.packages)
      .filter(([path, { name, version }]) => {
        const packageName = name ?? path.split('node_modules/').at(-1);
        return (
          packageName === 'fstream' ||
          (packageName === 'rimraf' && Number.parseInt(version, 10) < 4)
        );
      })
      .map(([path, { version }]) => `${path} (${version})`);

    if (offenders.length > 0) {
      throw new Error([...offenders, compatibilityFailureMessage].join('\n'));
    }
  });
});
