# Route Error Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace React Router's raw default error page with a user-friendly fallback that detects stale-chunk deployment failures and generic route errors, rendering tailored recovery UI for each.

**Architecture:** A pure `classifyRouteError` utility inspects the thrown value and returns a typed result (`chunk-load` | `generic`). A functional `RouteErrorBoundary` component consumes `useRouteError()`, calls the classifier, and renders one of two MUI-based UI states. The component is wired as the `errorElement` on the root (pathless layout) route in `router.tsx`, so it catches all descendant route errors via React Router's built-in error bubbling — no child route changes needed.

**Tech Stack:** React 19, React Router v7 (`useRouteError`, `isRouteErrorResponse`, `json`, `Link`, `createMemoryRouter`, `RouterProvider`), MUI v7 (`Box`, `Paper`, `Typography`, `Button`), Vitest, `@testing-library/react`

**Spec:** `docs/superpowers/specs/2026-03-20-route-error-boundary-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/utils/routeErrorClassification.ts` | Pure classifier: `classifyRouteError(error)` |
| Create | `frontend/src/utils/routeErrorClassification.test.ts` | Unit tests for all classification branches |
| Create | `frontend/src/components/errors/RouteErrorBoundary.tsx` | Functional component, `errorElement` consumer |
| Create | `frontend/src/components/errors/RouteErrorBoundary.test.tsx` | Render tests for both UI states |
| Modify | `frontend/src/router.tsx` | Add `errorElement: <RouteErrorBoundary />` to root route |

---

## Task 1: Classification utility (TDD)

**Files:**
- Create: `frontend/src/utils/routeErrorClassification.ts`
- Create: `frontend/src/utils/routeErrorClassification.test.ts`

---

- [ ] **Step 1.1: Create the test file with all cases**

Create `frontend/src/utils/routeErrorClassification.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { json } from 'react-router-dom'
import { classifyRouteError } from './routeErrorClassification'

const CHUNK_MSG = 'A new version of the app is available.'
const GENERIC_MSG = 'An unexpected error occurred.'

describe('classifyRouteError', () => {
  describe('chunk-load detection via message patterns', () => {
    it('detects "Importing a module script failed"', () => {
      expect(classifyRouteError(new Error('Importing a module script failed'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects "Failed to fetch dynamically imported module"', () => {
      expect(classifyRouteError(new Error('Failed to fetch dynamically imported module'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects "Loading chunk 3 failed"', () => {
      expect(classifyRouteError(new Error('Loading chunk 3 failed'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects "dynamically imported module"', () => {
      expect(classifyRouteError(new Error('dynamically imported module'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('detects error.name === "ChunkLoadError"', () => {
      const err = new Error('some webpack error')
      err.name = 'ChunkLoadError'
      expect(classifyRouteError(err)).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })

    it('is case-insensitive for message patterns', () => {
      expect(classifyRouteError(new Error('IMPORTING A MODULE SCRIPT FAILED'))).toEqual({
        type: 'chunk-load',
        message: CHUNK_MSG,
      })
    })
  })

  describe('generic errors', () => {
    it('classifies a normal Error as generic', () => {
      expect(classifyRouteError(new Error('something broke'))).toEqual({
        type: 'generic',
        message: 'something broke',
      })
    })

    it('classifies a thrown string as generic', () => {
      expect(classifyRouteError('oops')).toEqual({
        type: 'generic',
        message: 'oops',
      })
    })

    it('classifies null as generic with fallback message', () => {
      expect(classifyRouteError(null)).toEqual({
        type: 'generic',
        message: GENERIC_MSG,
      })
    })

    it('classifies a React Router ErrorResponse (isRouteErrorResponse) as generic', () => {
      // json() creates a real ErrorResponse that satisfies isRouteErrorResponse()
      const routeError = json({ error: true }, { status: 404 })
      expect(classifyRouteError(routeError)).toEqual({
        type: 'generic',
        message: GENERIC_MSG,
      })
    })
  })
})
```

- [ ] **Step 1.2: Run the tests to confirm they fail (function not defined)**

```bash
cd frontend && npx vitest run src/utils/routeErrorClassification.test.ts --no-coverage
```

Expected: All tests fail with "Cannot find module" or similar import error.

- [ ] **Step 1.3: Implement `routeErrorClassification.ts`**

Create `frontend/src/utils/routeErrorClassification.ts`:

```ts
import { isRouteErrorResponse } from 'react-router-dom'

export type RouteErrorType = 'chunk-load' | 'generic'

export interface ClassifiedError {
  type: RouteErrorType
  /** Fixed string for chunk-load; extracted or fallback for generic. Not used by RouteErrorBoundary UI directly. */
  message: string
}

const CHUNK_LOAD_MESSAGE = 'A new version of the app is available.'
const GENERIC_FALLBACK_MESSAGE = 'An unexpected error occurred.'

const CHUNK_LOAD_PATTERNS = [
  'importing a module script failed',
  'failed to fetch dynamically imported module',
  'loading chunk',
  'chunkloaderror',
  'dynamically imported module',
]

function isChunkLoadError(error: Error): boolean {
  if (error.name === 'ChunkLoadError') return true
  const lower = error.message.toLowerCase()
  return CHUNK_LOAD_PATTERNS.some((pattern) => lower.includes(pattern))
}

export function classifyRouteError(error: unknown): ClassifiedError {
  // Must be checked first: ErrorResponse objects are plain objects, not Error instances
  if (isRouteErrorResponse(error)) {
    return { type: 'generic', message: GENERIC_FALLBACK_MESSAGE }
  }

  if (error instanceof Error) {
    if (isChunkLoadError(error)) {
      return { type: 'chunk-load', message: CHUNK_LOAD_MESSAGE }
    }
    return { type: 'generic', message: error.message || GENERIC_FALLBACK_MESSAGE }
  }

  if (typeof error === 'string') {
    return { type: 'generic', message: error }
  }

  return { type: 'generic', message: GENERIC_FALLBACK_MESSAGE }
}
```

- [ ] **Step 1.4: Run the tests to confirm they all pass**

```bash
cd frontend && npx vitest run src/utils/routeErrorClassification.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/utils/routeErrorClassification.ts frontend/src/utils/routeErrorClassification.test.ts
git commit -m "feat(frontend): add classifyRouteError utility with tests"
```

---

## Task 2: RouteErrorBoundary component (TDD)

**Files:**
- Create: `frontend/src/components/errors/RouteErrorBoundary.tsx`
- Create: `frontend/src/components/errors/RouteErrorBoundary.test.tsx`

---

- [ ] **Step 2.1: Create the render test file**

Create `frontend/src/components/errors/RouteErrorBoundary.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { darkTheme } from '@/styles/theme'
import RouteErrorBoundary from './RouteErrorBoundary'

/**
 * Helper: create a router that throws `error` from its element,
 * so React Router invokes `errorElement` and populates useRouteError().
 */
function renderWithError(error: unknown) {
  function ThrowingComponent() {
    throw error
  }

  const router = createMemoryRouter([
    {
      path: '/',
      element: <ThrowingComponent />,
      errorElement: <RouteErrorBoundary />,
    },
  ])

  return render(
    <ThemeProvider theme={darkTheme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

describe('RouteErrorBoundary', () => {
  describe('chunk-load error state', () => {
    it('renders "App Updated" heading', () => {
      renderWithError(new Error('Importing a module script failed'))
      expect(screen.getByRole('heading', { name: /app updated/i })).toBeInTheDocument()
    })

    it('renders "Refresh Page" button', () => {
      renderWithError(new Error('Importing a module script failed'))
      expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument()
    })

    it('renders "Go to Dashboard" link pointing to /', () => {
      renderWithError(new Error('Importing a module script failed'))
      const link = screen.getByRole('link', { name: /go to dashboard/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/')
    })
  })

  describe('generic error state', () => {
    it('renders "Something Went Wrong" heading', () => {
      renderWithError(new Error('something broke'))
      expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    })

    it('renders "Reload Page" button', () => {
      renderWithError(new Error('something broke'))
      expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
    })

    it('renders "Go Home" link pointing to /', () => {
      renderWithError(new Error('something broke'))
      const link = screen.getByRole('link', { name: /go home/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/')
    })
  })
})
```

- [ ] **Step 2.2: Run the tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/errors/RouteErrorBoundary.test.tsx --no-coverage
```

Expected: All tests fail with "Cannot find module" or similar.

- [ ] **Step 2.3: Implement `RouteErrorBoundary.tsx`**

Create `frontend/src/components/errors/RouteErrorBoundary.tsx`:

```tsx
import React from 'react'
import { useRouteError, Link } from 'react-router-dom'
import { Box, Paper, Typography, Button } from '@mui/material'
import { classifyRouteError } from '@/utils/routeErrorClassification'

export default function RouteErrorBoundary() {
  const error = useRouteError()
  const { type } = classifyRouteError(error)

  if (type === 'chunk-load') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <Typography variant="h5" component="h1" gutterBottom>
            App Updated
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            A new version of the app is available. Refresh the page to continue.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
            <Button variant="outlined" component={Link} to="/">
              Go to Dashboard
            </Button>
          </Box>
        </Paper>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Something Went Wrong
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The app hit an unexpected error. You can reload the page or return to the dashboard.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
          <Button variant="outlined" component={Link} to="/">
            Go Home
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
```

- [ ] **Step 2.4: Run the tests to confirm they all pass**

```bash
cd frontend && npx vitest run src/components/errors/RouteErrorBoundary.test.tsx --no-coverage
```

Expected: All 6 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/components/errors/RouteErrorBoundary.tsx frontend/src/components/errors/RouteErrorBoundary.test.tsx
git commit -m "feat(frontend): add RouteErrorBoundary component with render tests"
```

---

## Task 3: Wire into router

**Files:**
- Modify: `frontend/src/router.tsx`

---

- [ ] **Step 3.1: Add `errorElement` to the root route**

In `frontend/src/router.tsx`, add the import and wire the component.

Add this import near the top (after the existing React import, with other component imports):

```ts
import RouteErrorBoundary from './components/errors/RouteErrorBoundary'
```

Find the root route object (around line 120–123) — it currently looks like:

```ts
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
```

Change it to:

```ts
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
```

Note: `RouteErrorBoundary` is NOT lazy-loaded. It must be a direct (non-lazy) import so it is available even when chunk loading fails — a lazy import would defeat the purpose.

- [ ] **Step 3.2: Run the full frontend test suite to check for regressions**

```bash
cd frontend && npm run test -- --no-coverage
```

Expected: All tests pass. No new failures.

- [ ] **Step 3.3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No type errors.

- [ ] **Step 3.4: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "feat(frontend): wire RouteErrorBoundary as root errorElement (closes #148)"
```

---

## Done

After Task 3, the feature is complete. To manually verify end-to-end:

1. Start the frontend dev server: `cd frontend && npm run dev`
2. In the browser console, simulate a chunk error:
   ```js
   // Trigger the chunk-load UI branch:
   window.__testRouteError = new Error('Importing a module script failed')
   ```
   (Or navigate to a route and throw manually from a component during development.)
3. Confirm "App Updated" UI appears with Refresh Page + Go to Dashboard buttons.
4. For the generic branch, throw `new Error('oops')` from any route component and confirm "Something Went Wrong" appears.
