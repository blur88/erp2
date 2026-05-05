# react-router-dom 7.14.2 → 7.15.0 Upgrade

**Date:** 2026-05-05
**Issues:** Closes #528, duplicate #527

## Summary

Routine patch-level bump of `react-router-dom` in the frontend package. No breaking changes expected. The co-versioned `react-router` package updates alongside it automatically.

## Scope

- `frontend/package.json` — version string on line 41
- `frontend/package-lock.json` — regenerated via `npm install`
- No application code changes required

## Steps

1. Edit `frontend/package.json`: `"react-router-dom": "7.15.0"`
2. Run `npm install` in `frontend/` to update `package-lock.json`
3. Run `npm run type-check` to catch any type signature changes
4. Run targeted routing tests to confirm no regressions
5. Open PR: `chore(deps): upgrade react-router-dom to 7.15.0`, closes #528
6. Close #527 as duplicate after merge

## Risk Assessment

- **Risk level:** Very low
- **Sub-dependencies:** `react-router` co-versions at 7.15.0 — no cascading changes
- **Overrides:** No `react-router-dom` entry in the `overrides` block; none needed
- **Breaking changes:** None documented in 7.14.2 → 7.15.0 changelog
