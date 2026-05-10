# Suppress Test Noise and Fix Missing MSW Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate two sources of frontend test noise — error boundary `console.error` output in `RouteErrorBoundary.test.tsx` and MSW unhandled-request warnings for `POST /api/auth/logout`.

**Architecture:** Two independent file changes. Local `vi.spyOn` suppression in the test file for error boundary noise. A shared MSW handler in `handlers.ts` for the logout endpoint, using a wildcard-origin URL pattern to match across environments.

**Tech Stack:** Vitest, MSW v2 (`msw/node`), React Testing Library, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/errors/RouteErrorBoundary.test.tsx` | Add `beforeEach`/`afterEach` console.error spy at top of outer `describe` |
| `frontend/src/mocks/handlers.ts` | Add `http.post('*/api/auth/logout', ...)` handler |

---

### Task 1: Suppress console.error noise in RouteErrorBoundary.test.tsx

**Files:**
- Modify: `frontend/src/components/errors/RouteErrorBoundary.test.tsx`

- [ ] **Step 1: Verify the noise exists — run the test and observe stderr**

```bash
cd frontend && npx vitest run src/components/errors/RouteErrorBoundary.test.tsx --reporter=verbose 2>&1 | head -60
```

Expected: you see lines like `Error: Importing a module script failed` and `React will try to recreate this component tree...` in stderr output.

- [ ] **Step 2: Add the console.error spy inside the outer describe block**

Open `frontend/src/components/errors/RouteErrorBoundary.test.tsx`. The file currently starts with:

```ts
import { describe, it, expect } from 'vitest'
```

Change it to:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
```

Then, inside the `describe('RouteErrorBoundary', () => {` block, add the following **before** the first nested `describe`:

```ts
describe('RouteErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('chunk-load error state', () => {
    // ... existing tests unchanged
```

Do not touch the test cases themselves.

- [ ] **Step 3: Run the tests and verify they still pass with no stderr noise**

```bash
cd frontend && npx vitest run src/components/errors/RouteErrorBoundary.test.tsx --reporter=verbose 2>&1
```

Expected: all 6 tests pass, no `Error: Importing a module script failed` lines in output.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/errors/RouteErrorBoundary.test.tsx
git commit -m "test(frontend): suppress console.error noise in RouteErrorBoundary tests"
```

---

### Task 2: Add POST /api/auth/logout MSW handler

**Files:**
- Modify: `frontend/src/mocks/handlers.ts`

- [ ] **Step 1: Verify the warning exists — run the SidebarUserMenu test and observe the MSW warning**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarUserMenu.test.tsx --reporter=verbose 2>&1 | grep -A 3 "MSW\|unhandled\|logout"
```

Expected: output includes `[MSW] Warning: intercepted a request without a matching request handler` for `POST .*/api/auth/logout`.

- [ ] **Step 2: Add the logout handler to handlers.ts**

The current content of `frontend/src/mocks/handlers.ts` is:

```ts
import type { RequestHandler } from 'msw'

// Handlers are added per module migration as RTK Query endpoints are introduced.
export const handlers: RequestHandler[] = []
```

Replace it with:

```ts
import { http, HttpResponse, type RequestHandler } from 'msw'

// Auth handlers
const authHandlers: RequestHandler[] = [
  http.post('*/api/auth/logout', () =>
    HttpResponse.json({ message: 'Logged out' })
  ),
]

// Handlers are added per module migration as RTK Query endpoints are introduced.
export const handlers: RequestHandler[] = [
  ...authHandlers,
]
```

- [ ] **Step 3: Run the SidebarUserMenu tests and verify no MSW warning**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarUserMenu.test.tsx --reporter=verbose 2>&1
```

Expected: all tests pass, no `[MSW] Warning` lines about `/api/auth/logout`.

- [ ] **Step 4: Run both test files together to confirm no regressions**

```bash
cd frontend && npx vitest run src/components/errors/RouteErrorBoundary.test.tsx src/components/common/__tests__/SidebarUserMenu.test.tsx --reporter=verbose 2>&1
```

Expected: all tests pass, clean output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/mocks/handlers.ts
git commit -m "test(frontend): add MSW handler for POST /api/auth/logout"
```
