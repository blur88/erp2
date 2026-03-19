# Version Bump Rules — Design Spec

**Date:** 2026-03-19

## Problem

The existing `semantic-release` configuration only bumps versions for `feat:`, `fix:`, and `BREAKING CHANGE` commits (Angular preset defaults). Merges prefixed with `style:` or `chore:` produce no release, even though they represent real work landing on `main`.

## Goal

Extend the release rules so that `style:` and `chore:` commits trigger a patch bump, without introducing an infinite release loop.

## Solution

Extend the `@semantic-release/commit-analyzer` plugin in `.releaserc.json` with a `releaseRules` array.

### Rules

| Commit type | Scope | Release |
|-------------|-------|---------|
| `chore` | `release` | none (explicit guard) |
| `chore` | any | patch |
| `style` | any | patch |
| `feat` | any | minor (default, unchanged) |
| `fix` | any | patch (default, unchanged) |
| `BREAKING CHANGE` | any | major (default, unchanged) |

### Loop prevention

The release commit produced by `@semantic-release/git` uses the message:

```
chore(release): <version> [skip ci]
```

Two independent guards prevent an infinite loop:
1. **`[skip ci]`** — GitHub Actions skips the workflow entirely for this commit.
2. **`chore(release): false`** in `releaseRules` — semantic-release itself treats this commit as non-releasable, as a belt-and-suspenders measure.

## Change

**File:** `.releaserc.json`

Replace the bare `"@semantic-release/commit-analyzer"` string entry with a plugin-with-options array:

```json
["@semantic-release/commit-analyzer", {
  "releaseRules": [
    { "type": "chore", "scope": "release", "release": false },
    { "type": "chore", "release": "patch" },
    { "type": "style", "release": "patch" }
  ]
}]
```

Custom `releaseRules` are evaluated first; the Angular preset defaults apply as fallback for types not listed here (`feat`, `fix`, `BREAKING CHANGE`).

## Out of Scope

- Adding `docs:`, `test:`, `refactor:`, `perf:`, or other commit types — not requested.
- Changelog categorization changes — `style` and `chore` will appear in the changelog under their default sections (or "Other" if not mapped in the notes generator).
- CI workflow changes — no changes to `ci.yml` or `release.yml` are needed.
