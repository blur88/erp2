# Design: Suppress Test Noise and Fix Missing MSW Handlers

**Date:** 2026-03-24
**Issue:** #169

## Problem

Two sources of noise in the frontend test suite:

1. `RouteErrorBoundary.test.tsx` — React and React Router log deliberate error boundary activations to `stderr`, making it hard to distinguish expected from unexpected failures.
2. `SidebarUserMenu.test.tsx` — MSW emits a warning for an unhandled `POST /api/auth/logout` request triggered by the logout flow.

## Design

### Change 1: Local console.error suppression in RouteErrorBoundary.test.tsx

Add a `beforeEach` / `afterEach` pair at the top of the outer `describe` block (before any nested `describe` blocks) that spies on and suppresses `console.error`. Scoped to this file only — not global setup — because this noise is a direct side effect of what these tests are intentionally validating (error boundary activation).

`mockRestore()` in `afterEach` restores `console.error` to whatever implementation was active when `vi.spyOn` was called. Since `setup.ts` installs its global spy in `beforeAll` (which runs before any `beforeEach`), the local spy wraps the global spy — and `mockRestore()` correctly restores to it. The global spy from `setup.ts` remains active and is cleaned up by its own `afterAll`. This is reliable because Vitest's lifecycle ordering guarantees `beforeAll` runs before `beforeEach`.

```ts
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})
```

### Change 2: Add POST /api/auth/logout handler to handlers.ts

The logout thunk (`authSlice.ts`) calls `authApi.logout()` → `apiInstance.post('/auth/logout', ...)`. In the jsdom test environment, `window.location.origin` is `http://localhost`, so `getApiBaseUrl()` returns `/api`. Axios resolves this to `http://localhost/api/auth/logout`.

MSW v2 with `msw/node` requires absolute URLs (relative paths are not supported). Use a wildcard origin (`*/api/auth/logout`) to match regardless of the resolved host, keeping the handler robust across environments.

The thunk swallows errors (returns `null` on failure) so the only requirement is that the handler exists to prevent MSW's unhandled-request warning. A 200 JSON response is appropriate — this matches the backend's actual response and is sufficient for the test assertion (which checks `mockNavigate` was called, not the response body).

```ts
http.post('*/api/auth/logout', () =>
  HttpResponse.json({ message: 'Logged out' })
)
```

Logout belongs in the shared handler list because it is standard auth API surface. Override locally only when a test needs a non-default response (e.g., 500, 401).

## Files Changed

- `frontend/src/components/errors/RouteErrorBoundary.test.tsx` — add local spy setup/teardown at top of outer describe
- `frontend/src/mocks/handlers.ts` — add logout handler with wildcard origin

## Non-Changes

- `setup.ts` — unchanged; global spy remains focused on framework-level noise only
- No new files created
