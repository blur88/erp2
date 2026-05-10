# Issue #170: Empty Release Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent future empty patch-release notes and backfill the 11 existing empty GitHub/CHANGELOG releases.

**Architecture:** Two independent parts: (1) convert `.releaserc.json` → `release.config.cjs` and add dual `transform` + `finalizeContext` hooks to `release-notes-generator` — `transform` marks internal commits as `'Internal Changes'` type so they survive angular's filter, and `finalizeContext` strips that group when any user-facing group exists; (2) a one-time `scripts/backfill-release-notes.cjs` script that patches CHANGELOG.md and GitHub Releases for the 11 known-empty versions.

**Tech Stack:** semantic-release 25, `@semantic-release/release-notes-generator` 14, `conventional-changelog-angular` 8.3, `conventional-changelog-writer` (finalizeContext hook), Node.js CJS scripts, `gh` CLI for GitHub Release updates.

---

## Critical Implementation Notes (Read First)

### How `finalizeContext` works in this version

`conventional-changelog-writer`'s `finalizeContext` signature:

```js
finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits)
```

- **`templateContext.commitGroups`** — commits already grouped for rendering (post-transform, internal types excluded)
- **`filteredCommits`** (3rd arg) — post-transform commits; internal types (`chore`, `refactor`, `docs`, `style`) return `undefined` from Angular preset's `transform` and are stripped — do NOT use this to detect internal commits
- **`allCommits`** (5th arg) — full pre-transform commit list; every commit has `.type`, `.scope`, `.subject` set by `conventional-commits-parser` — this is the source of truth for classification

**Classification must use `allCommits` (5th arg), not `filteredCommits` or `templateContext.commitGroups`.**

> **Spec override:** The spec (Part 1) references `context.commits` as the classification source. During implementation research, `context.commits` was found to contain post-transform data (internal types stripped) in `conventional-changelog-writer` v5+. The 5th positional argument to `finalizeContext` is the pre-transform list and is the correct source. The plan's use of `allCommits` deliberately overrides the spec's `context.commits` guidance based on this investigation. The spec's "verify the actual context shape during implementation" instruction was fulfilled — this plan records the result.

### Angular preset `transform` behavior

The Angular preset's `transform` returns `undefined` for commits whose type is not `feat`, `fix`, `perf`, `revert`, `docs`, `style`, `refactor`, `test`, `build`, `ci` AND have no breaking notes. For `chore` commits (which are our primary internal type), `transform` always returns `undefined` — they are never included in `commitGroups`.

### Parsed commit object shape

After `conventional-commits-parser`, each commit in `allCommits` has:
```js
{
  type: 'chore',       // conventional commit type (null if unparseable)
  scope: 'deps',       // scope or null
  subject: 'update frontend and backend dependencies',
  header: 'chore(deps): update frontend and backend dependencies',
  hash: 'abc1234...',
  message: '...'       // full raw message
}
```

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `.releaserc.json` | Delete | Replaced by `release.config.cjs` |
| `release.config.cjs` | Create | Semantic-release config with `finalizeContext` fallback logic |
| `scripts/release-notes-helpers.cjs` | Create | Pure functions: `classifyRelease`, `buildInternalChangesCommits` |
| `scripts/__tests__/release-notes-helpers.test.js` | Create | Unit tests for the pure helper functions |
| `scripts/backfill-release-notes.cjs` | Create | One-time backfill script for 11 empty releases |

The helpers module is extracted from `release.config.cjs` so the classification logic is testable without running semantic-release.

---

## Task 1: Unit tests and helper functions

**Files:**
- Create: `scripts/release-notes-helpers.cjs`
- Create: `scripts/__tests__/release-notes-helpers.test.js`

The helpers expose two pure functions consumed by both `release.config.cjs` and `backfill-release-notes.cjs`.

### Internal type list

```js
const INTERNAL_TYPES = new Set(['chore', 'refactor', 'docs', 'style']);
const USER_FACING_TYPES = new Set(['feat', 'fix', 'perf']);
const RELEASE_COMMIT_RE = /^chore\(release\):/;
```

### `classifyRelease(allCommits)`

Input: array of pre-transform parsed commit objects (each has `.type`, `.header`).
Returns: `'user-facing'` if any commit has a user-facing type; `'internal-only'` otherwise.

```js
function classifyRelease(allCommits) {
  const significant = allCommits.filter(c => c.type && !RELEASE_COMMIT_RE.test(c.header || ''));
  if (significant.some(c => USER_FACING_TYPES.has(c.type))) return 'user-facing';
  return 'internal-only';
}
```

### `buildInternalChangesCommits(allCommits)`

Input: array of pre-transform parsed commit objects.
Returns: array of display strings for the `### Internal Changes` section. Excludes the release auto-commit. Preserves original `type(scope): subject` prefix.

```js
function buildInternalChangesCommits(allCommits) {
  return allCommits
    .filter(c => !RELEASE_COMMIT_RE.test(c.header || ''))
    .filter(c => c.type && INTERNAL_TYPES.has(c.type))
    .map(c => {
      const scope = c.scope ? `(${c.scope})` : '';
      return `${c.type}${scope}: ${c.subject || c.header}`;
    });
}
```

- [ ] **Step 1.1: Set up test file**

Create `scripts/__tests__/release-notes-helpers.test.js`. Use Node's built-in `node:test` runner (no external test framework needed at root level — keep it simple).

```js
// scripts/__tests__/release-notes-helpers.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyRelease, buildInternalChangesCommits } = require('../release-notes-helpers.cjs');

function makeCommit(type, scope, subject) {
  const scope_ = scope ? `(${scope})` : '';
  return { type, scope, subject, header: `${type}${scope_}: ${subject}` };
}

// classifyRelease tests
test('feat commit → user-facing', () => {
  assert.equal(classifyRelease([makeCommit('feat', null, 'add thing')]), 'user-facing');
});

test('fix commit → user-facing', () => {
  assert.equal(classifyRelease([makeCommit('fix', 'auth', 'fix login')]), 'user-facing');
});

test('perf commit → user-facing', () => {
  assert.equal(classifyRelease([makeCommit('perf', null, 'speed up query')]), 'user-facing');
});

test('mixed fix + chore → user-facing', () => {
  const commits = [makeCommit('fix', null, 'fix thing'), makeCommit('chore', 'deps', 'update deps')];
  assert.equal(classifyRelease(commits), 'user-facing');
});

test('chore-only → internal-only', () => {
  assert.equal(classifyRelease([makeCommit('chore', 'deps', 'update deps')]), 'internal-only');
});

test('refactor + docs → internal-only', () => {
  const commits = [makeCommit('refactor', 'ui', 'simplify'), makeCommit('docs', null, 'add plan')];
  assert.equal(classifyRelease(commits), 'internal-only');
});

test('empty commits → internal-only', () => {
  assert.equal(classifyRelease([]), 'internal-only');
});

test('release auto-commit excluded from classification', () => {
  const commits = [{ type: 'chore', scope: 'release', subject: '1.2.1', header: 'chore(release): 1.2.1 [skip ci]' }];
  assert.equal(classifyRelease(commits), 'internal-only');
});

// buildInternalChangesCommits tests
test('excludes release auto-commit', () => {
  const commits = [
    { type: 'chore', scope: 'release', subject: '1.2.1', header: 'chore(release): 1.2.1 [skip ci]' },
    makeCommit('chore', 'deps', 'update packages'),
  ];
  const result = buildInternalChangesCommits(commits);
  assert.equal(result.length, 1);
  assert.equal(result[0], 'chore(deps): update packages');
});

test('preserves type(scope): subject format', () => {
  const commits = [makeCommit('refactor', 'purchasing', 'migrate toolbar')];
  assert.deepEqual(buildInternalChangesCommits(commits), ['refactor(purchasing): migrate toolbar']);
});

test('no scope formats correctly', () => {
  const commits = [makeCommit('docs', null, 'add plan')];
  assert.deepEqual(buildInternalChangesCommits(commits), ['docs: add plan']);
});

test('only includes internal types', () => {
  const commits = [
    makeCommit('feat', null, 'add feature'),
    makeCommit('chore', 'deps', 'update deps'),
  ];
  const result = buildInternalChangesCommits(commits);
  assert.deepEqual(result, ['chore(deps): update deps']);
});

test('dep-update chore(deps) commit included', () => {
  const commits = [makeCommit('chore', 'deps', 'update frontend and backend dependencies')];
  assert.deepEqual(buildInternalChangesCommits(commits), ['chore(deps): update frontend and backend dependencies']);
});
```

- [ ] **Step 1.2: Run tests to confirm they fail (module not found)**

```bash
cd /home/blur/erp2 && node --test scripts/__tests__/release-notes-helpers.test.js 2>&1 | head -20
```

Expected: error — `Cannot find module '../release-notes-helpers.cjs'`

- [ ] **Step 1.3: Create `scripts/release-notes-helpers.cjs`**

```js
// scripts/release-notes-helpers.cjs
'use strict';

const INTERNAL_TYPES = new Set(['chore', 'refactor', 'docs', 'style']);
const USER_FACING_TYPES = new Set(['feat', 'fix', 'perf']);
const RELEASE_COMMIT_RE = /^chore\(release\):/;

/**
 * Classify a release as 'user-facing' or 'internal-only'.
 * @param {Array} allCommits - Pre-transform parsed commits (5th arg to finalizeContext, or from git log).
 *   Each commit has: { type, scope, subject, header }
 * @returns {'user-facing'|'internal-only'}
 */
function classifyRelease(allCommits) {
  const significant = allCommits.filter(c => c.type && !RELEASE_COMMIT_RE.test(c.header || ''));
  if (significant.some(c => USER_FACING_TYPES.has(c.type))) return 'user-facing';
  return 'internal-only';
}

/**
 * Build the list of display strings for the Internal Changes fallback section.
 * Excludes the semantic-release auto-commit. Preserves type(scope): subject format.
 * @param {Array} allCommits - Pre-transform parsed commits.
 * @returns {string[]}
 */
function buildInternalChangesCommits(allCommits) {
  return allCommits
    .filter(c => !RELEASE_COMMIT_RE.test(c.header || ''))
    .filter(c => c.type && INTERNAL_TYPES.has(c.type))
    .map(c => {
      const scope = c.scope ? `(${c.scope})` : '';
      return `${c.type}${scope}: ${c.subject || c.header}`;
    });
}

module.exports = { classifyRelease, buildInternalChangesCommits, INTERNAL_TYPES, USER_FACING_TYPES, RELEASE_COMMIT_RE };
```

- [ ] **Step 1.4: Run tests — confirm all pass**

```bash
cd /home/blur/erp2 && node --test scripts/__tests__/release-notes-helpers.test.js
```

Expected: all tests pass (green)

- [ ] **Step 1.5: Commit**

```bash
git add scripts/release-notes-helpers.cjs scripts/__tests__/release-notes-helpers.test.js
git commit -m "test(release): add unit tests and helper functions for release notes classification"
```

---

## Task 2: Create `release.config.cjs` with `finalizeContext` fallback

**Files:**
- Create: `release.config.cjs`
- Delete: `.releaserc.json`

This task replaces the JSON config with a CJS module that adds the `finalizeContext` hook to `release-notes-generator`. All other plugin config is preserved verbatim.

**How the hook works:**

```
finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits)
                                                                      ^^^^^^^^^^
                                                          Use this — pre-transform full list
```

The hook:
1. Gets `allCommits` (5th arg) — pre-transform list with `.type`, `.scope`, `.subject`
2. Warns if `allCommits` is missing/empty (context shape validation)
3. Calls `classifyRelease(allCommits)`
4. If `'user-facing'`: returns `templateContext` unchanged
5. If `'internal-only'`: builds fallback entries, replaces `templateContext.commitGroups`

- [ ] **Step 2.1: Create `release.config.cjs`**

```js
// release.config.cjs
'use strict';

const { classifyRelease, buildInternalChangesCommits } = require('./scripts/release-notes-helpers.cjs');

/**
 * finalizeContext hook for @semantic-release/release-notes-generator.
 *
 * Signature: finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits)
 *   - templateContext: the writer context being rendered (has .commitGroups)
 *   - filteredCommits: post-transform commits — internal types already stripped, do NOT use for classification
 *   - allCommits: pre-transform full commit list — use this for classification
 *
 * Behavior:
 *   - If any user-facing commit (feat/fix/perf) exists: return templateContext unchanged.
 *   - Otherwise: replace commitGroups with a single 'Internal Changes' group.
 */
function finalizeContext(templateContext, options, filteredCommits, keyCommit, allCommits) {
  // Warn early if context shape diverges from expectations (version-specific divergence)
  if (!allCommits || allCommits.length === 0) {
    console.warn(
      '[release.config.cjs] WARNING: allCommits (5th arg to finalizeContext) is empty or undefined. ' +
      'This may indicate a conventional-changelog-writer version incompatibility. ' +
      'Falling back to filteredCommits — internal-only detection may be unreliable.'
    );
    // Can't detect internal-only reliably; return unchanged to avoid suppressing real content
    return templateContext;
  }

  const classification = classifyRelease(allCommits);

  if (classification === 'user-facing') {
    return templateContext;
  }

  // Internal-only release — build fallback section
  const entries = buildInternalChangesCommits(allCommits);

  if (entries.length === 0) {
    console.warn(
      '[release.config.cjs] WARNING: Internal-only release detected but no internal commits found to display. ' +
      'Emitting placeholder entry to prevent empty release notes.'
    );
    entries.push('see commit history for this release');
  }

  // Replace commitGroups with a single synthetic group
  templateContext.commitGroups = [
    {
      title: 'Internal Changes',
      commits: entries.map(entry => ({ subject: entry })),
    },
  ];

  return templateContext;
}

module.exports = {
  branches: ['main'],
  plugins: [
    ['@semantic-release/commit-analyzer', {
      releaseRules: [
        { type: 'chore', scope: 'release', release: false },
        { type: 'chore', release: 'patch' },
        { type: 'style', release: 'patch' },
        { type: 'refactor', release: 'patch' },
      ],
    }],
    ['@semantic-release/release-notes-generator', {
      writerOpts: { finalizeContext },
    }],
    '@semantic-release/changelog',
    ['@semantic-release/npm', { pkgRoot: 'backend', npmPublish: false }],
    ['@semantic-release/npm', { pkgRoot: 'frontend', npmPublish: false }],
    ['@semantic-release/git', {
      assets: ['CHANGELOG.md', 'backend/package.json', 'frontend/package.json'],
      message: 'chore(release): ${nextRelease.version} [skip ci]',
    }],
    '@semantic-release/github',
  ],
};
```

- [ ] **Step 2.2: Verify `release.config.cjs` loads without errors**

```bash
cd /home/blur/erp2 && node -e "const c = require('./release.config.cjs'); console.log('plugins:', c.plugins.length, 'branches:', c.branches);"
```

Expected output: `plugins: 7 branches: [ 'main' ]`

- [ ] **Step 2.3: Delete `.releaserc.json`**

```bash
git rm .releaserc.json
```

- [ ] **Step 2.4: Commit**

```bash
git add release.config.cjs
git commit -m "feat(release): add Internal Changes fallback section for internal-only patch releases"
```

---

## Task 3: Manual smoke tests for forward fix

These are manual validation steps — no automated test to write. Run them to confirm both halves of the conditional behavior work before proceeding to the backfill.

**Prerequisites:** You need a local branch with controlled commits for testing. The dry-run does not publish anything. `--branches <branchname>` tells semantic-release to treat this branch as a release branch for the dry-run — without it, semantic-release will refuse to run on any non-`main` branch.

**Note on actual implementation:** The implementation used a dual-hook approach (`transform` + `finalizeContext`) rather than `finalizeContext` alone. The custom `transform` marks internal commits as `type: 'Internal Changes'` so they survive angular's filter; `finalizeContext` then strips that group if any user-facing group exists. The smoke tests validate the observable behavior either way.

- [ ] **Step 3.1: Smoke test A — internal-only release shows fallback**

```bash
# Create a temp branch off the feature branch
git checkout feat/issue-170-empty-release-notes
git checkout -b smoke-test-internal-only

# Make a chore commit
git commit --allow-empty -m "chore(deps): update packages for smoke test"
git commit --allow-empty -m "refactor(ui): clean up imports for smoke test"

# Run semantic-release dry-run — --branches tells SR to treat this branch as releasable
GITHUB_TOKEN=dummy npx semantic-release --dry-run --no-ci --branches smoke-test-internal-only 2>&1 | grep -A 20 "Release note"
```

Expected: output contains `### Internal Changes` section with the two commits. No `### Bug Fixes`, `### Features` sections.

- [ ] **Step 3.2: Smoke test B — mixed release shows only user-facing content**

```bash
git checkout feat/issue-170-empty-release-notes
git checkout -b smoke-test-mixed

git commit --allow-empty -m "fix(auth): fix login redirect for smoke test"
git commit --allow-empty -m "chore(deps): update packages for smoke test"

GITHUB_TOKEN=dummy npx semantic-release --dry-run --no-ci --branches smoke-test-mixed 2>&1 | grep -A 20 "Release note"
```

Expected: output contains `### Bug Fixes` section. No `### Internal Changes` section.

- [ ] **Step 3.3: Clean up smoke-test branches**

```bash
git checkout feat/issue-170-empty-release-notes
git branch -D smoke-test-internal-only smoke-test-mixed
```

---

## Task 4: Backfill script

**Files:**
- Create: `scripts/backfill-release-notes.cjs`

This script patches the 11 known-empty releases. It is a one-time maintenance tool kept as an audit artifact after use.

**Affected tags (oldest to newest):**
`v1.2.1`, `v1.3.1`, `v1.4.1`, `v1.5.1`, `v1.14.1`, `v1.15.1`, `v1.17.1`, `v1.17.2`, `v1.18.1`, `v1.19.1`, `v1.21.1`

**Key behaviors:**
- Resolves previous tag using `git tag --sort=version:refname` filtered to `vX.Y.Z` (strict semver only, no pre-release tags)
- Queries commits via `git log previousTag..currentTag --format="%H %s"`
- Parses each commit subject using a simple conventional-commit regex (no need for `conventional-commits-parser` dep)
- Classifies using `classifyRelease` from helpers
- Patches CHANGELOG.md by locating exact version section boundaries
- Updates GitHub Release via `gh release edit`
- Exits non-zero on any invariant violation

- [ ] **Step 4.1: Create `scripts/backfill-release-notes.cjs`**

```js
// scripts/backfill-release-notes.cjs
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { classifyRelease, buildInternalChangesCommits } = require('./release-notes-helpers.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const REPO_ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');

// Tags to backfill, oldest first
const TARGET_TAGS = [
  'v1.2.1', 'v1.3.1', 'v1.4.1', 'v1.5.1',
  'v1.14.1', 'v1.15.1',
  'v1.17.1', 'v1.17.2',
  'v1.18.1', 'v1.19.1', 'v1.21.1',
];

// Strict semver vX.Y.Z (no pre-release suffix)
const SEMVER_TAG_RE = /^v\d+\.\d+\.\d+$/;

// Conventional commit subject parser (type and scope)
const CONV_COMMIT_RE = /^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/;

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: REPO_ROOT, ...opts }).trim();
}

function log(msg) { process.stdout.write(msg + '\n'); }
function warn(msg) { process.stderr.write('[WARN] ' + msg + '\n'); }
function fail(msg) { process.stderr.write('[ERROR] ' + msg + '\n'); process.exit(1); }

/** Get all strict-semver release tags sorted by version */
function getAllReleaseTags() {
  return run('git tag --sort=version:refname')
    .split('\n')
    .filter(t => SEMVER_TAG_RE.test(t));
}

/** Resolve the tag immediately preceding currentTag in version order */
function getPreviousTag(currentTag, allTags) {
  const idx = allTags.indexOf(currentTag);
  if (idx <= 0) return null;
  return allTags[idx - 1];
}

/** Parse commits in range as conventional-commit objects */
function getCommitsInRange(previousTag, currentTag) {
  const output = run(`git log ${previousTag}..${currentTag} --format="%H %s"`);
  if (!output) return [];
  return output.split('\n').map(line => {
    const spaceIdx = line.indexOf(' ');
    const hash = line.slice(0, spaceIdx);
    const subject = line.slice(spaceIdx + 1);
    const header = subject;
    const match = CONV_COMMIT_RE.exec(subject);
    if (match) {
      return { hash, type: match[1], scope: match[2] || null, subject: match[3], header };
    }
    return { hash, type: null, scope: null, subject, header };
  });
}

/** Build markdown for an Internal Changes section */
function buildMarkdown(entries) {
  const bullets = entries.map(e => `* ${e}`).join('\n');
  return `\n\n### Internal Changes\n\n${bullets}\n`;
}

/** Patch CHANGELOG.md for a given version, returns true if patched, false if skipped */
function patchChangelog(version, markdown) {
  // Normalize line endings
  let content = fs.readFileSync(CHANGELOG_PATH, 'utf8').replace(/\r\n/g, '\n');

  // Find the exact section start
  const sectionHeader = `## [${version}]`;
  const startIdx = content.indexOf(sectionHeader);
  if (startIdx === -1) {
    fail(`Cannot locate section "${sectionHeader}" in CHANGELOG.md`);
  }

  // Find section end: next ## [ or # [ or EOF
  const afterHeader = content.indexOf('\n', startIdx);
  const nextSectionMatch = content.slice(afterHeader + 1).search(/^#{1,2} \[/m);
  const endIdx = nextSectionMatch === -1
    ? content.length
    : afterHeader + 1 + nextSectionMatch;

  const sectionBody = content.slice(afterHeader + 1, endIdx);

  if (sectionBody.trim() !== '') {
    warn(`CHANGELOG section for ${version} already has content — skipping (idempotent)`);
    return false;
  }

  const newContent = content.slice(0, afterHeader) + markdown + content.slice(endIdx);

  if (DRY_RUN) {
    log(`\n[DRY-RUN] Would patch CHANGELOG.md for ${version}:`);
    log('---');
    log(markdown.trim());
    log('---');
  } else {
    fs.writeFileSync(CHANGELOG_PATH, newContent, 'utf8');
    log(`Patched CHANGELOG.md for ${version}`);
  }
  return true;
}

/** Update GitHub Release body */
function updateGitHubRelease(tag, markdown) {
  // Check if release body is already non-empty
  let existingBody = '';
  try {
    existingBody = run(`gh release view ${tag} --json body --jq '.body'`);
  } catch (e) {
    fail(`Cannot fetch GitHub release for ${tag}: ${e.message}`);
  }

  if (existingBody && existingBody.trim() !== '') {
    warn(`GitHub Release ${tag} already has content — skipping (idempotent)`);
    return;
  }

  const releaseNotes = `### Internal Changes\n\n${markdown.trim().replace(/^### Internal Changes\n\n/, '')}`;

  if (DRY_RUN) {
    log(`[DRY-RUN] Would update GitHub Release ${tag} with:`);
    log('---');
    log(releaseNotes.trim());
    log('---');
  } else {
    // Use a temp file to avoid shell quoting issues with newlines/special chars in commit subjects
    const tmpFile = path.join(REPO_ROOT, `.gh-notes-${tag}.tmp`);
    fs.writeFileSync(tmpFile, releaseNotes, 'utf8');
    try {
      run(`gh release edit ${tag} --notes-file ${JSON.stringify(tmpFile)}`);
      log(`Updated GitHub Release ${tag}`);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  }
}

async function main() {
  log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== LIVE RUN ===');

  const allTags = getAllReleaseTags();
  log(`Found ${allTags.length} strict-semver release tags`);

  for (const tag of TARGET_TAGS) {
    const version = tag.replace(/^v/, '');
    log(`\n--- Processing ${tag} ---`);

    // Invariant: tag must exist
    if (!allTags.includes(tag)) {
      fail(`Tag ${tag} not found in repository`);
    }

    // Invariant: previous tag must be resolvable
    const prevTag = getPreviousTag(tag, allTags);
    if (!prevTag) {
      fail(`Cannot resolve previous tag for ${tag} — it appears to be the first tag`);
    }
    log(`  Range: ${prevTag}..${tag}`);

    // Get and classify commits
    const commits = getCommitsInRange(prevTag, tag);

    // Invariant: must have commits
    if (commits.length === 0) {
      fail(`Zero commits found in range ${prevTag}..${tag} — this is unexpected. Check tag resolution.`);
    }
    log(`  Commits in range: ${commits.length}`);

    // Invariant: must not contain user-facing commits
    const classification = classifyRelease(commits);
    if (classification === 'user-facing') {
      fail(
        `User-facing commit (feat/fix/perf) found in ${tag} which was expected to be empty. ` +
        `Manual review required. Range: ${prevTag}..${tag}`
      );
    }

    // Build the Internal Changes content
    const entries = buildInternalChangesCommits(commits);
    if (entries.length === 0) {
      warn(`No internal commits found for ${tag} after filtering — using placeholder`);
      entries.push('see commit history for this release');
    }

    const markdown = buildMarkdown(entries);

    // Patch CHANGELOG.md
    patchChangelog(version, markdown);

    // Update GitHub Release
    updateGitHubRelease(tag, markdown);
  }

  log('\n=== Done ===');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4.2: Verify script loads without syntax errors**

```bash
cd /home/blur/erp2 && node -e "require('./scripts/backfill-release-notes.cjs')" 2>&1
```

Expected: no output (loads silently, `main()` won't run on require)

Actually the script calls `main()` at the bottom — use this instead:

```bash
cd /home/blur/erp2 && node --check scripts/backfill-release-notes.cjs && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 4.3: Run dry-run — verify output for all 11 tags**

```bash
cd /home/blur/erp2 && node scripts/backfill-release-notes.cjs --dry-run 2>&1
```

Expected:
- All 11 tags processed without errors
- Each tag shows `[DRY-RUN] Would patch CHANGELOG.md for X.Y.Z:` followed by an `### Internal Changes` block
- Each tag shows `[DRY-RUN] Would update GitHub Release vX.Y.Z`
- Exit code 0

Inspect the output manually — confirm the commit entries look correct (right commits attributed to each version, no release auto-commit included).

- [ ] **Step 4.4: Commit the backfill script before running it**

```bash
git add scripts/backfill-release-notes.cjs
git commit -m "chore(scripts): add one-time backfill script for issue #170 empty release notes"
```

- [ ] **Step 4.5: Run the real backfill**

```bash
cd /home/blur/erp2 && node scripts/backfill-release-notes.cjs 2>&1
```

Expected:
- All 11 tags processed
- CHANGELOG.md patched for each
- GitHub Releases updated for each
- Exit code 0

- [ ] **Step 4.6: Verify CHANGELOG.md patches**

```bash
# Check that all 11 versions now have content
for v in 1.2.1 1.3.1 1.4.1 1.5.1 1.14.1 1.15.1 1.17.1 1.17.2 1.18.1 1.19.1 1.21.1; do
  echo "=== $v ===";
  grep -A 5 "\[$v\]" CHANGELOG.md | head -6;
done
```

Expected: each version shows `### Internal Changes` followed by commit entries.

- [ ] **Step 4.7: Spot-check 3 GitHub Releases**

```bash
gh release view v1.21.1 --json body --jq '.body'
gh release view v1.17.2 --json body --jq '.body'
gh release view v1.2.1  --json body --jq '.body'
```

Expected: each returns non-empty markdown with `### Internal Changes` section.

- [ ] **Step 4.8: Confirm idempotency — second run produces no changes**

```bash
cd /home/blur/erp2 && node scripts/backfill-release-notes.cjs 2>&1
```

Expected: all 11 tags report `[WARN] ... already has content — skipping (idempotent)` for CHANGELOG and GitHub Release. Exit code 0.

- [ ] **Step 4.9: Confirm invariant violation exits non-zero**

Edit `scripts/backfill-release-notes.cjs`: in the `TARGET_TAGS` array, temporarily add `'v99.99.99'` as the first entry.

```bash
node scripts/backfill-release-notes.cjs --dry-run 2>&1; echo "Exit code: $?"
```

Expected: `[ERROR] Tag v99.99.99 not found in repository` printed to stderr, exit code 1.

Then revert the edit:
```bash
git checkout -- scripts/backfill-release-notes.cjs
```

- [ ] **Step 4.10: Commit CHANGELOG.md changes**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): backfill Internal Changes for 11 empty patch releases (issue #170)"
```

---

## Task 5: Final verification

- [ ] **Step 5.1: Confirm `.releaserc.json` is gone**

```bash
ls .releaserc.json 2>&1 || echo "Correctly removed"
```

Expected: `ls: cannot access '.releaserc.json': No such file or directory`

- [ ] **Step 5.2: Confirm `release.config.cjs` is loaded by semantic-release**

```bash
node -e "
const sr = require('semantic-release');
console.log(typeof sr);
" 2>/dev/null || true

# The real test: semantic-release picks up release.config.cjs automatically
node -e "const c = require('./release.config.cjs'); console.log('OK, plugins:', c.plugins.length);"
```

Expected: `OK, plugins: 7`

- [ ] **Step 5.3: Run unit tests one final time**

```bash
cd /home/blur/erp2 && node --test scripts/__tests__/release-notes-helpers.test.js
```

Expected: all tests pass

- [ ] **Step 5.4: Close issue #170**

```bash
gh issue close 170 --comment "Fixed in two parts: (1) release.config.cjs adds Internal Changes fallback section for internal-only patch releases going forward; (2) backfill script patched all 11 historical empty releases in CHANGELOG.md and GitHub Releases."
```
