# jsdom 28 → 29 Upgrade

**Date:** 2026-03-15
**Issue:** #109
**Status:** Approved

## Goal

Update `jsdom` from `28.1.0` to `29.0.0` in `frontend/package.json` and ensure the full Vitest test suite continues to pass.

## Context

- **Runtime**: Node.js v24.13.1 — already satisfies jsdom v29's requirement of `>=20.19.0`
- **Test framework**: Vitest v4.0.18 with `environment: 'jsdom'` in `vite.config.ts`
- **Test surface**: 67 test files in `frontend/src/`
- **jsdom version**: Currently pinned at `28.1.0` (not a range)

## jsdom v29 Breaking Changes Relevant to This Codebase

### 1. Window data → accessor property conversion

Many properties on `Window` that were plain data properties are now accessor properties (getters/setters). Using `Object.defineProperty` to redefine a property **without `configurable: true`** will throw in strict mode once jsdom v29 converts it to an accessor.

**Assessment**: All three files that redefine `window.navigator.clipboard` (`NotificationPanel.test.tsx`, `useNotification.test.tsx`, and `clipboard.test.ts`) already pass `configurable: true`. No pre-emptive fix required.

### 2. Resource loading API overhaul

The `resources` option for customizing how jsdom loads external assets has been completely redesigned.

**Assessment**: The project's Vitest config does not use the `resources` option. No impact.

### 3. `document.createEvent()` stricter validation

`document.createEvent()` with invalid event type strings now throws instead of silently failing.

**Assessment**: Test files use `@testing-library/react`'s `createEvent` helper (a wrapper over `new Event()`/`new MouseEvent()` etc.), not `document.createEvent()` directly. No impact.

### 4. SVG event handler proxying removed

`<svg>` elements no longer proxy event handlers to `Window`.

**Assessment**: No SVG-related event handler patterns found in the test suite. No impact.

### 5. Known upstream regression

A regression in `undici` causes WebSocket throttling (one connection per origin). The project's test setup uses MSW (Mock Service Worker) for HTTP mocking, not real WebSockets in tests. No impact.

## Approach

**Option B — Pre-emptive review, then bump.**

After auditing the codebase, no pre-emptive code changes are required. The two files that touch `window.navigator.clipboard` are already written correctly for jsdom v29 (`configurable: true`).

Execution steps:
1. Update `"jsdom": "28.1.0"` → `"jsdom": "29.0.0"` in `frontend/package.json`
2. Run `npm install` in `frontend/`
3. Run the full test suite: `cd frontend && npm run test`
4. Fix any failures reactively

## Risk Assessment

**Low.** The codebase has minimal jsdom surface area:
- No custom resource loading configuration
- No `document.createEvent()` direct usage
- No SVG event handler patterns
- Clipboard `Object.defineProperty` calls use `configurable: true`
- Node.js version already compatible

The main unknown is whether any indirect dependencies (MUI, Testing Library internals) rely on jsdom behaviors that changed. The test run in step 3 will surface these.

## Success Criteria

- `jsdom` version reads `29.0.0` in `frontend/package.json`
- `cd frontend && npm run test` exits with no failures
