# Design: Fix Shell Command Injection in backfill-release-notes.cjs (Issue #494)

## Problem

CodeQL Alert #5 (`js/shell-command-injection-from-environment`, CWE-78) flags `scripts/backfill-release-notes.cjs`. The `run()` helper uses `execSync` with template literals, meaning git tags and file paths are interpolated directly into a shell string. A maliciously crafted tag name or path could execute arbitrary shell commands.

## Approach

Refactor `run()` to use `execFileSync` with `(cmd, args[])` signature. Migrate all 5 call sites. No shell is invoked — arguments are passed directly to the process. This is the Node.js and OWASP-recommended practice for subprocess execution when shell features (pipes, globs, redirects) are not needed.

## Changes

### `run()` helper

**Before:**
```js
const { execSync } = require('child_process');

function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}
```

**After:**
```js
const { execFileSync } = require('child_process');

function run(cmd, args = [], opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}
```

### Call site migrations

| Location | Before | After |
|---|---|---|
| `getAllReleaseTags` | `run('git tag --sort=version:refname')` | `run('git', ['tag', '--sort=version:refname'])` |
| `getCommitsInRange` | `run(\`git log ${previousTag}..${currentTag} --format="%H %s"\`)` | `run('git', ['log', \`${previousTag}..${currentTag}\`, '--format=%H %s'])` |
| `getGitHubReleaseBody` | `run(\`gh release view ${tag} --json body --jq '.body'\`)` | `run('gh', ['release', 'view', tag, '--json', 'body', '--jq', '.body'])` |
| `updateGitHubRelease` | `run(\`gh release edit ${tag} --notes-file ${JSON.stringify(tmpFile)}\`)` | `run('gh', ['release', 'edit', tag, '--notes-file', tmpFile])` |

Notes:
- Quotes around `--format="%H %s"` are shell artifacts — omit them when passing as a direct argument.
- `JSON.stringify(tmpFile)` was a shell-escaping workaround — not needed with `execFileSync`.

## Verification

1. `node scripts/backfill-release-notes.cjs --dry-run` — must produce same `[DRY-RUN]` output with no errors.
2. CodeQL re-scan should show Alert #5 resolved with no new alerts introduced.

## Scope

- Single file: `scripts/backfill-release-notes.cjs`
- No backend/frontend code touched
- No DB migration required
- No new dependencies
