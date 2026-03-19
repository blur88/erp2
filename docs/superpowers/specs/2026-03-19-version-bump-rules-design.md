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
1. **`[skip ci]`** — GitHub Actions skips the workflow entirely for this commit. This is the primary guard.
2. **`{ type: "chore", scope: "release", release: false }`** — a belt-and-suspenders guard at the semantic-release layer. When this rule matches, it returns `false` (a concrete non-`undefined` value), which prevents the built-in default rules from running as a fallback for that commit. Because `false` is not a valid release type string, it contributes nothing to the release type calculation — the net effect is no release. Note: this guard is coupled to the `chore(release):` scope in the release commit message; if that message format changes, this rule must be updated in tandem.

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

Custom `releaseRules` are evaluated first. If no custom rule matches a commit (the result is `undefined`), the built-in multi-format defaults kick in as a fallback — this covers `feat`→minor, `fix`→patch, `BREAKING CHANGE`→major, and others. There is no need to re-declare those types in the custom array.

## Out of Scope

- Adding `docs:`, `test:`, `refactor:`, `perf:`, or other commit types — not requested.
- Changelog categorization changes — `style` and `chore` will appear in the changelog under their default sections (or "Other" if not mapped in the notes generator).
- CI workflow changes — no changes to `ci.yml` or `release.yml` are needed.
