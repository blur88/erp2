# Fix Browser Refresh Redirect to Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent the app from redirecting to `/dashboard` on every browser refresh by adding `PersistGate` so the router waits for Redux state rehydration before evaluating auth.

**Architecture:** `redux-persist` is already configured but `PersistGate` is not used. Without it, the app renders before `localStorage` state is rehydrated, so `authLoader` sees `isAuthenticated: false` and redirects to `/login`, which sends the user to `/dashboard`. Adding `PersistGate` delays rendering until rehydration completes, so the loader always reads real auth state.

**Tech Stack:** React 18, Redux Toolkit, redux-persist, react-router-dom v6

---

### Task 1: Export `persistor` from the store

**Files:**
- Modify: `frontend/src/store/index.ts:92`

**Step 1: Read the current file**

Open `frontend/src/store/index.ts` and locate line 92:
```ts
const persistor = persistStore(store)
```

**Step 2: Change `const` to `export const`**

```ts
export const persistor = persistStore(store)
```

No test needed — this is just an export change. The existing store tests will still pass.

**Step 3: Verify no TypeScript errors**

Run: `cd frontend && npm run type-check`
Expected: No errors related to `persistor`

**Step 4: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: export persistor from store"
```

---

### Task 2: Wrap `RouterProvider` in `PersistGate`

**Files:**
- Modify: `frontend/src/main.tsx`

**Step 1: Read the current file**

Open `frontend/src/main.tsx`. The relevant section is:
```tsx
import { store } from './store'
// ...
<Provider store={store}>
  // ...
  <RouterProvider router={router} />
  // ...
</Provider>
```

**Step 2: Add imports**

Add these two imports near the existing `store` import:
```tsx
import { PersistGate } from 'redux-persist/integration/react'
import { persistor } from './store'
```

**Step 3: Wrap `RouterProvider` with `PersistGate`**

Change:
```tsx
<RouterProvider router={router} />
```

To:
```tsx
<PersistGate loading={null} persistor={persistor}>
  <RouterProvider router={router} />
</PersistGate>
```

`loading={null}` means nothing renders until rehydration is done (typically <50ms, invisible to the user). The `LinearProgress` in `RootLayout` handles any perceived loading already.

**Step 4: Verify TypeScript**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "fix: add PersistGate to prevent refresh redirect to dashboard"
```

---

### Task 3: Manual verification

**Step 1: Start the frontend dev server**

```bash
cd frontend && npm run dev
```

**Step 2: Log in and navigate to a non-dashboard page**

e.g. go to `/inventory/products`

**Step 3: Refresh the browser**

Expected: Page stays on `/inventory/products` — no redirect to `/dashboard`

**Step 4: Verify login still works**

Log out, then log in again. Expected: redirect to `/dashboard` as normal.

**Step 5: Verify unauthenticated redirect still works**

Clear `localStorage`, refresh. Expected: redirect to `/login`.
