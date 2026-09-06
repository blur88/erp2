const path = require('path');
const Sequencer = require('@jest/test-sequencer').default;

// CJS on purpose: Jest loads testSequencer via require() in its main process,
// the same constraint as jest-e2e-global-setup.js. A .ts file here would be
// compiled CJS by ts-jest yet loaded as ESM by Node.

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Repo-relative, POSIX separators, so ordering is identical on every platform.
function normalize(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

// Codepoint comparison. String.prototype.localeCompare is locale-sensitive and
// would let CI and a dev machine disagree on suite order.
function byCodepoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseOverride(raw, discovered) {
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seen = new Set();
  for (const p of wanted) {
    if (seen.has(p)) {
      throw new Error(
        `E2E_SUITE_ORDER lists "${p}" more than once. Duplicate entries are ` +
          `rejected: a verification run must exercise exactly the order it claims.`,
      );
    }
    seen.add(p);
    if (!discovered.has(p)) {
      throw new Error(
        `E2E_SUITE_ORDER names "${p}", which matched no discovered suite. ` +
          `Rejecting the run rather than silently ignoring it — otherwise an ` +
          `adversarial verification run would appear to exercise an order it ` +
          `never ran.\nDiscovered suites:\n  ${[...discovered].sort(byCodepoint).join('\n  ')}`,
      );
    }
  }
  return wanted;
}

class E2ESequencer extends Sequencer {
  sort(tests) {
    const byPath = new Map();
    for (const t of tests) byPath.set(normalize(t.path), t);

    const defaultOrder = [...byPath.keys()].sort(byCodepoint);

    const raw = process.env.E2E_SUITE_ORDER;
    if (!raw || raw.trim() === '') {
      return defaultOrder.map((p) => byPath.get(p));
    }

    const first = parseOverride(raw, new Set(byPath.keys()));
    const firstSet = new Set(first);
    const rest = defaultOrder.filter((p) => !firstSet.has(p));
    return [...first, ...rest].map((p) => byPath.get(p));
  }
}

module.exports = E2ESequencer;
