# Issue #494 — Shell Injection Fix in backfill-release-notes.cjs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `execSync` with `execFileSync` in `scripts/backfill-release-notes.cjs` to eliminate shell command injection (CodeQL Alert #5, CWE-78).

**Architecture:** Single-file refactor — change the `run()` helper signature from `(cmd: string, opts?)` to `(cmd: string, args: string[], opts?)` and update all 5 call sites. No shell is invoked; arguments are passed directly to the child process.

**Tech Stack:** Node.js `child_process.execFileSync` (built-in, no new deps)

---

### Task 1: Capture baseline dry-run output before making changes

**Files:**
- Read: `scripts/backfill-release-notes.cjs`

- [ ] **Step 1: Run dry-run and save output as baseline**

```bash
cd /home/blur/erp2
node scripts/backfill-release-notes.cjs --dry-run 2>&1 | tee /tmp/baseline-dry-run.txt
```

Expected: script runs, prints `=== DRY RUN MODE ===`, processes tags, prints `[DRY-RUN]` blocks, exits with code 0. (It may fail on individual tags if the repo doesn't have all listed tags — that's fine, note the output.)

---

### Task 2: Refactor `run()` helper and migrate all call sites

**Files:**
- Modify: `scripts/backfill-release-notes.cjs`

- [ ] **Step 1: Update the `require` import — swap `execSync` for `execFileSync`**

In `scripts/backfill-release-notes.cjs`, line 2, change:

```js
const { execSync } = require('child_process');
```

to:

```js
const { execFileSync } = require('child_process');
```

- [ ] **Step 2: Refactor the `run()` helper**

Replace the existing `run` function:

```js
function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}
```

with:

```js
function run(cmd, args = [], opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}
```

- [ ] **Step 3: Migrate call site 1 — `getAllReleaseTags`**

Find:
```js
return run('git tag --sort=version:refname')
```

Replace with:
```js
return run('git', ['tag', '--sort=version:refname'])
```

- [ ] **Step 4: Migrate call site 2 — `getCommitsInRange`**

Find:
```js
const output = run(`git log ${previousTag}..${currentTag} --format="%H %s"`);
```

Replace with:
```js
const output = run('git', ['log', `${previousTag}..${currentTag}`, '--format=%H %s']);
```

Note: the quotes around `%H %s` are shell artifacts and must be omitted — `execFileSync` passes the string verbatim to git.

- [ ] **Step 5: Migrate call site 3 — `getGitHubReleaseBody`**

Find:
```js
return run(`gh release view ${tag} --json body --jq '.body'`);
```

Replace with:
```js
return run('gh', ['release', 'view', tag, '--json', 'body', '--jq', '.body']);
```

- [ ] **Step 6: Migrate call site 4 — `updateGitHubRelease` (the `gh release edit` line)**

Find:
```js
run(`gh release edit ${tag} --notes-file ${JSON.stringify(tmpFile)}`);
```

Replace with:
```js
run('gh', ['release', 'edit', tag, '--notes-file', tmpFile]);
```

Note: `JSON.stringify(tmpFile)` was a shell-escaping workaround — not needed when bypassing the shell.

- [ ] **Step 7: Commit the fix**

```bash
git add scripts/backfill-release-notes.cjs
git commit -m "fix(security): replace execSync with execFileSync in backfill-release-notes.cjs to eliminate shell injection (closes #494)"
```

---

### Task 3: Verify fix with dry-run and compare to baseline

**Files:**
- Read: `/tmp/baseline-dry-run.txt` (from Task 1)

- [ ] **Step 1: Run dry-run again after the fix**

```bash
cd /home/blur/erp2
node scripts/backfill-release-notes.cjs --dry-run 2>&1 | tee /tmp/after-dry-run.txt
```

Expected: same output structure as baseline — `=== DRY RUN MODE ===`, same tags processed, same `[DRY-RUN]` blocks, exit code 0.

- [ ] **Step 2: Diff baseline vs after**

```bash
diff /tmp/baseline-dry-run.txt /tmp/after-dry-run.txt
```

Expected: no diff (empty output). Any difference is a regression to investigate.

- [ ] **Step 3: Confirm no `execSync` remains in the file**

```bash
grep -n 'execSync' scripts/backfill-release-notes.cjs
```

Expected: no output. If any line appears, it means a call site was missed.
