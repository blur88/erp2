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

1. If `error` is an `Error` instance:
   - Check `error.name === 'ChunkLoadError'`
   - Check `error.message` against patterns:
     - `"Importing a module script failed"`
     - `"Failed to fetch dynamically imported module"`
     - `"Loading chunk"`
     - `"ChunkLoadError"`
     - `"dynamically imported module"`
   - If any match → `{ type: 'chunk-load', message: <fixed copy> }`
   - Otherwise → `{ type: 'generic', message: error.message || <fallback> }`
2. If `error` is a string → `{ type: 'generic', message: error }`
3. If `error` is a React Router `Response` object (has `.status`) → `{ type: 'generic', message: <fallback> }`
4. Anything else → `{ type: 'generic', message: <fallback> }`

The `message` for chunk-load is always fixed copy (not from the error object). For generic errors, the message is extracted only when it is a non-empty string from a real `Error` — never raw-echoed from unknown values.

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

Add `errorElement` to the root route:

```ts
{
  element: <RootLayout />,
  errorElement: <RouteErrorBoundary />,   // ← new
  children: [...]
}
```

## UI

### Chunk-load failure state

- **Title:** App Updated
- **Message:** A new version of the app is available. Refresh the page to continue.
- **Primary action:** Refresh Page → `window.location.reload()`
- **Secondary action:** Go to Dashboard → `navigate('/')`

### Generic error state

- **Title:** Something Went Wrong
- **Message:** The app hit an unexpected error. You can reload the page or return to the dashboard.
- **Primary action:** Reload Page → `window.location.reload()`
- **Secondary action:** Go Home → `navigate('/')`

Both states use MUI (`Box`, `Paper`, `Typography`, `Button`) to match the existing app visual style. No new dependencies.

Note on reload: `window.location.reload()` is acceptable for this issue. It may not force-bypass aggressive asset caching in all environments, but is the least surprising behavior for users and handles the common case.

## Testing

### `routeErrorClassification.test.ts`

| Test case | Expected result |
|-----------|----------------|
| `new Error('Importing a module script failed')` | `type: 'chunk-load'` |
| `new Error('Failed to fetch dynamically imported module')` | `type: 'chunk-load'` |
| `new Error('Loading chunk 3 failed')` | `type: 'chunk-load'` |
| `new Error('dynamically imported module')` | `type: 'chunk-load'` |
| Error with `name === 'ChunkLoadError'` | `type: 'chunk-load'` |
| `new Error('something broke')` | `type: 'generic'` |
| Thrown string `'oops'` | `type: 'generic'` |
| Plain object `{ status: 404, statusText: 'Not Found' }` | `type: 'generic'` |
| `null` | `type: 'generic'` |

### `RouteErrorBoundary.test.tsx`

| Test case | Expected output |
|-----------|----------------|
| chunk-load error | renders "App Updated" heading |
| generic error | renders "Something Went Wrong" heading |

## Out of Scope

- Error reporting / monitoring integration (Option C) — defer until a monitoring service is introduced
- Class-based `ErrorBoundary` for non-router subtrees — not needed for this issue
- Retry logic or automatic reload — keep recovery manual and user-initiated
