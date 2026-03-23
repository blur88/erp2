# Design: Test Runner Progress Bars

**Date:** 2026-03-24
**Issue:** #168
**Scope:** Developer experience — frontend (Vitest) and backend (Jest)

## Summary

Add visual progress feedback to both test runners for interactive terminal sessions. CI and non-TTY environments must continue producing clean, readable output automatically — no separate scripts or branching required.

## Design

### Frontend (Vitest)

Remove `--reporter=dot` from the `test` script in `frontend/package.json`.

**Before:**
```json
"test": "vitest --run --reporter=dot"
```

**After:**
```json
"test": "vitest --run"
```

Vitest's default reporter auto-detects TTY. In an interactive terminal it renders a progress bar and rich summary. In non-TTY (CI, piped output) it falls back to clean text. No package install required.

### Backend (Jest)

Install `jest-progress-bar-reporter` as a dev dependency:

```bash
npm install --save-dev jest-progress-bar-reporter
```

Add a `reporters` array to the `jest` config in `backend/package.json`:

```json
"reporters": [
  "default",
  ["jest-progress-bar-reporter", { "usePercentage": true }]
]
```

`"default"` is kept first — it preserves standard Jest failure output and error details. The progress reporter is purely additive. `jest-progress-bar-reporter` uses TTY detection internally: progress bar in interactive terminals, silent in non-TTY.

## CI Compatibility

CI compatibility is a hard constraint. Both reporters rely on built-in TTY detection:

- Vitest default reporter: CI-safe out of the box
- `jest-progress-bar-reporter`: degrades gracefully in non-TTY (no garbled escape codes)

No special CI flags or separate scripts are needed.

## Validation

1. Run `npm test` in both `frontend/` and `backend/` in an interactive terminal — confirm progress feedback appears.
2. Run `npm test | cat` in both — confirm clean readable text output, no escape code artifacts.
3. (Optional) Run `CI=true npm test` in both as an extra spot-check if needed.

## Acceptance Criteria

- Interactive terminal runs show progress feedback for both frontend and backend.
- Non-interactive / non-TTY runs produce clean readable output.
- No new test scripts; existing workflows (`test`, `test:watch`, `test:cov`, `test:e2e`) are unchanged.
- The change does not affect test results or coverage collection.
