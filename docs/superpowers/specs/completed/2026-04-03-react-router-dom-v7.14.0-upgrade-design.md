# Design: react-router-dom upgrade to v7.14.0

**Issue:** #263
**Date:** 2026-04-03
**Status:** Approved

## Summary

Bump `react-router-dom` from `7.13.2` to `7.14.0` in the frontend. No code changes required.

## Context

The app uses react-router-dom in **library mode** (`createBrowserRouter` + lazy-loaded route components). It does not use Framework Mode, `fetcher`, `clientLoader`/`clientAction`, splat routes with relative paths, or `Route.ComponentProps`. All v7.14.0 breaking changes are scoped to these unused features.

## What Changes

- `frontend/package.json`: `"react-router-dom": "7.13.2"` → `"7.14.0"`
- `frontend/package-lock.json`: updated by `npm install`

## v7.14.0 Release Notes Applicability

| Change | Applies to this app? |
|---|---|
| New `unstable_instrumentation` APIs | No — opt-in only |
| New `unstable_useRoute()` hook | No — opt-in only, Framework Mode only |
| Fix: hydration issues with multiple `clientLoader` ancestors | No — no loaders on routes |
| Fix: percent encoding in relative path navigations in splat routes | No — no splat routes |
| Fix: type error with `Route.ComponentProps` in `createRoutesStub` | No — Framework Mode only |
| Fix: `@react-router/dev` server crash on Unix socket files | No — not using dev server package |

## Verification Steps

1. `cd frontend && npm install` — install updated package
2. `npm run type-check` — confirm no new TypeScript errors
3. Run targeted tests:
   - `npx vitest run src/__tests__/router.test.tsx`
   - `npx vitest run src/components/errors/RouteErrorBoundary.test.tsx`
   - `npx vitest run src/components/auth/__tests__/ProtectedRoute.test.tsx`
   - `npx vitest run src/pages/auth/__tests__/LoginPage.test.tsx`
4. (Optional) `docker compose build frontend && docker compose up -d frontend` for live smoke test of navigation flows

## Risk Assessment

**Very low.** This is a patch-level update for this codebase. All breaking changes in the release are gated behind features this app does not use.
