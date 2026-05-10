# Issue #170: Empty Release Notes — Design Spec

**Date:** 2026-03-24
**Issue:** [#170](https://github.com/blur88/erp2/issues/170)
**Status:** Approved

---

## Problem

Eleven patch releases in `CHANGELOG.md` and GitHub Releases contain only a version header with no body. This happens because `@semantic-release/release-notes-generator` (using Angular convention) silently skips `chore`, `refactor`, `docs`, and `style` commits — it renders nothing for them — even though `@semantic-release/commit-analyzer` is configured to trigger a patch release for those types.

The result: a release is published with a version bump but empty notes.

**Affected versions:** `v1.21.1`, `v1.19.1`, `v1.18.1`, `v1.17.2`, `v1.17.1`, `v1.15.1`, `v1.14.1`, `v1.5.1`, `v1.4.1`, `v1.3.1`, `v1.2.1`

---

## Goals

1. **Forward fix:** Prevent new empty releases going forward, automated in the release pipeline.
2. **Historical backfill:** Repair the 11 existing empty releases in a controlled, one-time operation.

These are treated as two independent concerns with separate implementations.

---

## Commit Classification

| Commit type | Release bump | Notes behavior |
|-------------|-------------|----------------|
| `feat` | minor | Always shown — Features section |
| `fix` | patch | Always shown — Bug Fixes section |
| `perf` | patch | Always shown — Performance section |
| `chore` | patch | Shown only in fallback |
| `refactor` | patch | Shown only in fallback |
| `docs` | patch | Shown only in fallback |
| `style` | patch | Shown only in fallback |

**User-facing types:** `feat`, `fix`, `perf`
**Internal types:** `chore`, `refactor`, `docs`, `style`

> **Note on `perf`:** The Angular conventional-changelog preset used by `release-notes-generator` does render `perf` commits under a "Performance Improvements" section by default (it is included in the preset's writer `commitGroupsSort` and `transform` configuration). A `perf`-only release will therefore produce a visible non-empty section and will not trigger the fallback. This assumption should be verified against the installed version of `conventional-changelog-angular` during implementation.

Dependency-update commits are treated as internal when their subject or scope indicates package maintenance — for example, scopes like `deps`, `dependencies`, `frontend`, `backend` combined with verbs like `update`, `bump`, `upgrade`. These typically appear as `chore(deps):` but the rule is intentionally broad enough to cover variations.

**Dep-update classification scope:** This heuristic is a refinement of the type-based rule, not an override. A commit is internal only if its type is already in the internal list (`chore`, `refactor`, `docs`, `style`). The dep-update subject/scope pattern identifies which of those internal-type commits represent dependency maintenance — it does not reclassify commits whose type is absent from the internal list (e.g., a `build(deps):` or `ci(deps):` commit would not be classified as internal by this heuristic, because `build` and `ci` are not in the internal type list). This is intentional to keep classification simple and predictable.

---

## Part 1: Forward Fix

### Approach

Use Option A: custom `writerOpts` in `@semantic-release/release-notes-generator`.

Convert `.releaserc.json` → `release.config.cjs`. This is required because `writerOpts.finalizeContext` must be a JavaScript function; JSON cannot express functions.

`commit-analyzer` release rules remain unchanged.

### Decision Logic

`writerOpts.finalizeContext` receives the full writer context, which includes both the commit groups that would be rendered and the underlying commit list.

The classification uses the **actual commits in the release range**, not just the pre-grouped rendered output. `commitGroups` reflects what the writer has already decided to render and may exclude commits before the decision is made — classifying from the raw commit list is more reliable.

**Implementation note on `finalizeContext` context shape:** In `conventional-changelog-core`, by the time `finalizeContext` runs, the Angular preset's `transform` function has already processed each commit. Commits whose type is not recognized by the Angular preset (e.g., `chore`, `refactor`, `docs`) are **not stripped** by transform — they remain accessible via `context.commits` (the flat array of all commits in the range) even if they were excluded from `context.commitGroups`. The classification should read from `context.commits`.

During initial rollout, log a warning if `context.commits` is `undefined` or unexpectedly empty — this validates the assumption about the writer context shape and surfaces version-specific divergence early rather than silently.

If `context.commits` is unavailable, fall back to flattening commits from `context.commitGroups`. However, on a purely internal release `context.commitGroups` will itself be empty (the preset rendered nothing). If both `context.commits` and the `commitGroups` flatten yield zero commits, log a warning and emit a minimal `Internal Changes` group with a single placeholder entry (`"see commit history for this release"`) rather than silently producing empty notes. Verify the actual context shape against `conventional-changelog-core` version in use during implementation.

**Decision rule:**

1. Inspect all commits via `context.commits`.
2. If at least one commit has a user-facing type (`feat`, `fix`, `perf`), return context unchanged — normal rendering proceeds.
3. If no user-facing commit exists, replace `context.commitGroups` with a single synthetic group:
   - Title: `Internal Changes`
   - Commits: all internal commits from `context.commits`, normalized for display

### Fallback Output Format

In `Internal Changes`, commit entries preserve their original conventional-commit prefix:

```
### Internal Changes

* refactor(purchasing): migrate PurchaseOrdersToolbar to PageHeader
* chore(deps): update frontend and backend dependencies
* docs: add implementation plan for issue #174
```

The `chore(release): x.y.z [skip ci]` auto-commit generated by `@semantic-release/git` is always excluded from the fallback output.

### Config Structure (`release.config.cjs`)

The file mirrors the current `.releaserc.json` structure with these additions:

- `releaseRules` in `commit-analyzer`: unchanged from current `.releaserc.json`
- `release-notes-generator` plugin entry gains a `writerOpts` key with:
  - `finalizeContext`: function implementing the classification and fallback-group logic described above
- All other plugins (`@semantic-release/changelog`, `@semantic-release/npm` ×2, `@semantic-release/git`, `@semantic-release/github`) unchanged

---

## Part 2: Historical Backfill

### Approach

A one-time script `scripts/backfill-release-notes.cjs` that:

1. Iterates the 11 target tags in chronological order (oldest first).
2. For each tag, resolves the **previous reachable release tag** and queries commits via `git log previousTag..currentTag`.
3. Excludes the `chore(release): x.y.z [skip ci]` auto-commit.
4. Classifies the commits. If any `feat`, `fix`, or `perf` commit is found, **stops for that tag and reports it** — exits non-zero for manual review. (These releases are expected to be internal-only, but this is verified, not assumed.)
5. Constructs an `### Internal Changes` block from the internal commits.
6. Patches `CHANGELOG.md` by locating the exact version section boundaries (`## [x.y.z]...` to the next `## [` or `# [` header or EOF), inspecting the body, and replacing it only if the body is empty or whitespace-only.
7. Updates the corresponding GitHub Release body via `gh release edit vX.Y.Z --notes "..."`.

### Script Interface

```
node scripts/backfill-release-notes.cjs [--dry-run]
```

- `--dry-run`: prints would-be CHANGELOG patch and GitHub Release body for each tag without writing. Still validates all invariants and exits non-zero on any violation.
- Without `--dry-run`: writes CHANGELOG.md and calls `gh release edit` for each tag.

### Idempotency

- **CHANGELOG.md:** If the target version section already has non-empty content, skip it and log a message. Do not overwrite.
- **GitHub Releases:** If the release body is already non-empty, warn and skip. Do not overwrite. Skipped releases are reported clearly in output but do not cause a non-zero exit unless an invariant is violated.
- Running the script a second time should produce zero changes and exit 0 on all targets.

### CHANGELOG Parsing

Before parsing, normalize `CHANGELOG.md` content to `\n` line endings to ensure consistent section detection across environments (guards against `\r\n` from Windows tooling).

### Invariant Violations (exit non-zero)

Both `--dry-run` and real runs fail clearly if:

- A target tag does not exist in the repo.
- The previous tag cannot be resolved for a target tag.
- A user-facing commit (`feat`, `fix`, `perf`) is found in a supposedly empty release.
- The target version section cannot be located uniquely in `CHANGELOG.md`.
- The commit range for a target tag resolves to zero commits (indicates a tag resolution error or a zero-commit release, both of which require manual review).

### Commit Range

For tag `vX.Y.Z`, the script resolves the immediately preceding semantic version tag using `git tag --sort=version:refname` to determine order, filtering to only tags matching the `vX.Y.Z` pattern (strict semver with `v` prefix). Pre-release tags (e.g., `v1.2.1-beta.1`) and non-semver tags are excluded to prevent accidentally resolving the wrong previous tag. The range `previousTag..currentTag` is then passed to `git log`. This is the same range semantic-release would have used at release time.

### What the Script Does NOT Do

- Rewrite git history.
- Move or recreate tags.
- Re-run semantic-release.
- Modify version numbers.

The script is kept after use as a permanent audit artifact.

---

## Part 3: Testing & Validation

### Forward Fix

**Unit tests** (`scripts/__tests__/release-notes.test.js` or similar):

- `classifyRelease(commits)` → `'user-facing' | 'internal-only'`
  - input with `feat` commits → `user-facing`
  - input with only `chore`/`refactor`/`docs` → `internal-only`
  - mixed input (fix + chore) → `user-facing`
  - `perf`-only input → `user-facing`
  - dependency-update commit patterns → classified as internal
- `buildInternalChangesCommits(commits)` → normalized commit entries
  - release commit (`chore(release):`) excluded
  - `type(scope): subject` prefix preserved in output
  - dep-bump commits included

**Manual smoke tests:**

1. **Internal-only dry-run:** branch with only `chore:` and `refactor:` commits → `GITHUB_TOKEN=dummy npx semantic-release --dry-run --no-ci` → output contains `### Internal Changes`, no other sections.
2. **Mixed dry-run:** branch with one `fix:` plus `chore:` commits → `GITHUB_TOKEN=dummy npx semantic-release --dry-run --no-ci` → output contains `### Bug Fixes` only, no `### Internal Changes` section.

> **Note:** `GITHUB_TOKEN` must be set to a non-empty string when running semantic-release dry-run locally to prevent auth errors; a placeholder value is sufficient for dry-run.

These two cases together validate both halves of the conditional behavior.

### Backfill Script

- `--dry-run` on all 11 tags: inspect output manually before any writes.
- Real run: verify all 11 CHANGELOG.md sections are non-empty.
- Spot-check 3+ GitHub Releases via `gh release view vX.Y.Z`.
- Second run: zero changes, exit 0 on all targets.
- Confirm invariant violations exit non-zero (e.g., run against a fabricated tag that doesn't exist).

### Not Tested

- Full CI semantic-release pipeline matrix across all commit types.
- Mocked GitHub API in the backfill script.

---

## File Changes Summary

| File | Action |
|------|--------|
| `.releaserc.json` | Delete |
| `release.config.cjs` | Create — semantic-release config with `finalizeContext` logic |
| `scripts/backfill-release-notes.cjs` | Create — one-time backfill script |
| `scripts/__tests__/release-notes.test.js` | Create — unit tests for classification and fallback-entry logic |
| `CHANGELOG.md` | Patched by backfill script (11 sections) |
| GitHub Releases (11) | Patched by backfill script via `gh release edit` |
