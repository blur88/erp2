# Route Error Boundary — Design Spec

**Issue:** #148
**Date:** 2026-03-20
**Status:** Approved

## Problem

When a new version of the application is deployed, browsers may try to load stale JS chunks that no longer exist on the server. React Router currently shows its raw default error page:

```
Unexpected Application Error!
Importing a module script failed.
💿 Hey developer 👋
You can provide a way better UX than this...
```

The same raw page also appears for any other uncaught route-level rendering error. Both cases need a user-friendly fallback.

## Decision

Implement a root-level `errorElement` in `router.tsx` using a functional component powered by `useRouteError()`. The component classifies the error and renders one of two tailored UI states. Error classification logic lives in a separate, testable utility.

## File Structure

```
frontend/src/
  utils/routeErrorClassification.ts          ← pure classification helper
  utils/routeErrorClassification.test.ts     ← unit tests for classification logic
  components/errors/RouteErrorBoundary.tsx   ← functional component (errorElement)
  components/errors/RouteErrorBoundary.test.tsx  ← render tests (2 states)
  router.tsx                                 ← add errorElement to root route (edit only)
```

## API

### `utils/routeErrorClassification.ts`

```ts
type RouteErrorType = 'chunk-load' | 'generic'

interface ClassifiedError {
  type: RouteErrorType
  message: string
}

export function classifyRouteError(error: unknown): ClassifiedError
```

**Classification logic:**

The fallback message string for all generic cases is `"An unexpected error occurred."`.

Evaluation order matters. `isRouteErrorResponse` is checked first because `ErrorResponse` objects (thrown from loaders/actions) are plain objects, not `Error` instances — but checking it first also makes the priority explicit and defensively correct.

1. If `isRouteErrorResponse(error)` is true (React Router's built-in utility from `react-router-dom`) → `{ type: 'generic', message: "An unexpected error occurred." }`
   - This identifies errors thrown by loaders/actions as route error responses. Must be first to avoid any confusion with subsequent checks.
2. If `error` is an `Error` instance:
   - Check `error.name === 'ChunkLoadError'`
   - Normalize `error.message` to lowercase before matching. Check against patterns:
     - `"importing a module script failed"`
     - `"failed to fetch dynamically imported module"`
     - `"loading chunk"`
     - `"chunkloaderror"`
     - `"dynamically imported module"`
   - If any match → `{ type: 'chunk-load', message: 'A new version of the app is available.' }`
   - Otherwise → `{ type: 'generic', message: error.message || "An unexpected error occurred." }`
3. If `error` is a string → `{ type: 'generic', message: error }`
4. Anything else → `{ type: 'generic', message: "An unexpected error occurred." }`

The `message` field on `ClassifiedError` is part of the public API but is **not used by `RouteErrorBoundary`** in the current UI (both states use hard-coded copy from the UI section). It is included in the type for future extensibility.

**Test assertion rule:** classifier tests should assert `type` AND `message` for the fixed-message cases (chunk-load fixed string, generic fallback string) — since `message` is part of the public contract. Boundary render tests should assert only the rendered UI copy, not the classifier's `message` value.

### `components/errors/RouteErrorBoundary.tsx`

```tsx
export default function RouteErrorBoundary() {
  const error = useRouteError()
  const { type } = classifyRouteError(error)

  if (type === 'chunk-load') {
    // renders chunk-load UI (see UI section)
  }

  // renders generic UI (see UI section)
}
```

### `router.tsx` change

Add `errorElement` to the root (pathless layout) route:

```ts
{
  element: <RootLayout />,
  errorElement: <RouteErrorBoundary />,   // ← new
  children: [...]
}
```

The root route is a pathless layout route. React Router bubbles unhandled errors up through the route tree, so this single `errorElement` covers all descendant routes — no child routes need their own `errorElement`.

## UI

**Theme context:** `ThemeWrapper` wraps `RouterProvider` in `main.tsx`, so `RouteErrorBoundary` already inherits `ThemeProvider` — no self-wrapping needed.

**Navigation:** Use `<Link to="/">` from `react-router-dom` for dashboard/home navigation, not `useNavigate()`. The `useNavigate` hook may not have a stable context when the error occurs at the root route level. `<Link>` is safe in all error boundary positions.

**Layout:** Full-viewport height (`minHeight: '100vh'`) with flex centering. Use `Paper` for the card, `Typography` for title/message, `Button variant="contained"` for primary action, `Button variant="outlined"` for secondary action.

### Chunk-load failure state

- **Title:** App Updated
- **Message:** A new version of the app is available. Refresh the page to continue.
- **Primary action (Button contained):** Refresh Page → `window.location.reload()`
- **Secondary action (Button outlined, as Link):** Go to Dashboard → `<Link to="/">`

### Generic error state

- **Title:** Something Went Wrong
- **Message:** The app hit an unexpected error. You can reload the page or return to the dashboard.
- **Primary action (Button contained):** Reload Page → `window.location.reload()`
- **Secondary action (Button outlined, as Link):** Go Home → `<Link to="/">`

Both states use MUI (`Box`, `Paper`, `Typography`, `Button`) and React Router's `Link`. No new dependencies.

Note on reload: `window.location.reload()` is acceptable for this issue. It may not force-bypass aggressive asset caching in all environments, but is the least surprising behavior for users and handles the common case.

## Testing

### `routeErrorClassification.test.ts`

Assert both `type` and `message` for fixed-message cases. For `generic` cases with extracted messages, assert `type` and `message` where the value is deterministic. Use `UNSAFE_ErrorResponseImpl` from `react-router-dom` to construct a real `ErrorResponse` that satisfies `isRouteErrorResponse` — `json()` was removed in React Router v7.

| Test case | Expected result |
|-----------|----------------|
| `new Error('Importing a module script failed')` | `{ type: 'chunk-load', message: 'A new version of the app is available.' }` |
| `new Error('Failed to fetch dynamically imported module')` | `{ type: 'chunk-load', message: 'A new version of the app is available.' }` |
| `new Error('Loading chunk 3 failed')` | `{ type: 'chunk-load', message: 'A new version of the app is available.' }` |
| `new Error('dynamically imported module')` | `{ type: 'chunk-load', message: 'A new version of the app is available.' }` |
| Error with `name === 'ChunkLoadError'` | `{ type: 'chunk-load', message: 'A new version of the app is available.' }` |
| `new Error('something broke')` | `{ type: 'generic', message: 'something broke' }` |
| Thrown string `'oops'` | `{ type: 'generic', message: 'oops' }` |
| `new UNSAFE_ErrorResponseImpl(404, 'Not Found', {}, false)` (real `ErrorResponse`) | `{ type: 'generic', message: 'An unexpected error occurred.' }` |
| `null` | `{ type: 'generic', message: 'An unexpected error occurred.' }` |

### `RouteErrorBoundary.test.tsx`

Use `createMemoryRouter` + `RouterProvider` for render tests. Do NOT use bare `MemoryRouter` — it does not populate `useRouteError()`, which reads from React Router's internal route error context.

Test setup pattern: define a route whose `element` throws the target error and whose `errorElement` is `<RouteErrorBoundary />`. Render via `RouterProvider`. React Router will invoke `errorElement` automatically and `useRouteError()` will return the thrown value.

| Test case | Expected output |
|-----------|----------------|
| chunk-load error | renders "App Updated" heading; "Refresh Page" button present |
| generic error | renders "Something Went Wrong" heading; "Reload Page" button present |
| chunk-load error | "Go to Dashboard" link renders with `href="/"` |
| generic error | "Go Home" link renders with `href="/"` |

## Out of Scope

- Error reporting / monitoring integration (Option C) — defer until a monitoring service is introduced
- Class-based `ErrorBoundary` for non-router subtrees — not needed for this issue
- Retry logic or automatic reload — keep recovery manual and user-initiated
