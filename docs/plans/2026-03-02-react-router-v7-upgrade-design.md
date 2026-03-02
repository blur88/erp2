# React Router DOM v6 → v7 Upgrade Design

**Date:** 2026-03-02
**Scope:** Frontend only
**Approach:** Option C — bump to v7 + migrate to `createBrowserRouter`/`RouterProvider`, loaders used for auth guards only, Redux data fetching unchanged

---

## 1. Package Upgrade

- Bump `react-router-dom` from `^6.20.1` to `7.13.1` in `frontend/package.json`
- No peer dependency changes required (React 18 is supported)

---

## 2. Architecture Change: BrowserRouter → createBrowserRouter + RouterProvider

### main.tsx
- Remove `<BrowserRouter>` wrapper
- Add `RouterProvider` receiving a router created by `createBrowserRouter`
- Router is defined in a new `src/router.tsx` file

### App.tsx
- Convert from a component using `useNavigate`/`useLocation` at root to a layout route element
- The `<Routes>/<Route>` JSX tree is replaced by the `createBrowserRouter` config
- Idle timer logic and auth state handling move into the root layout component

### src/router.tsx (new file)
- Defines the full route config using `createBrowserRouter`
- Auth guard via a `loader` function on protected routes — reads Redux store state and returns `redirect('/login')` if unauthenticated
- `ProtectedRoute` component simplified or removed (loader handles the guard)

---

## 3. Route Structure

```
/ (root layout — idle timer, theme, auth state, IdleWarningDialog)
├── /login
├── /change-password-required
└── /* (auth-guarded via loader, MainLayout)
    ├── / → redirect /dashboard
    ├── /dashboard
    ├── /inventory, /inventory/products, /inventory/products/create, etc.
    ├── /sales, /sales/customers, /sales/orders, etc.
    ├── /purchasing, /purchasing/suppliers, /purchasing/orders, etc.
    ├── /accounting (redirect → /accounting/dashboard), /accounting/dashboard, etc.
    ├── /settings/*, /reports/*, /audit-logs
    └── * (NotFoundPage)
```

Auth guard loaders call `store.getState().auth` and return `redirect('/login')` when not authenticated. Page components are unchanged.

---

## 4. v7 Breaking Changes to Address

| Change | Action |
|--------|--------|
| `v7_startTransition` and `v7_relativeSplatPath` future flags are now defaults | Remove from `main.tsx` |
| Inner `<Routes>` inside protected wrapper eliminated | Non-issue — moved to router config |
| All hooks (`useNavigate`, `useParams`, `useLocation`, `useSearchParams`) API unchanged | No changes to 59+ page files |
| `<Navigate>` component unchanged | No action needed |
| `MemoryRouter` still available | Test files unaffected |

---

## 5. Testing Plan

- Run `npm run type-check` after migration
- Run `npm run test` — verify all 6 test files using `MemoryRouter` still pass
- Manual smoke test:
  - [ ] Login flow
  - [ ] Navigate to dashboard, inventory, sales, purchasing, accounting pages
  - [ ] Idle timeout warning dialog triggers and dismisses
  - [ ] Unauthenticated redirect to `/login` works
  - [ ] Password-change-required redirect works
  - [ ] 404 page works for unknown routes
  - [ ] `/accounting` redirects to `/accounting/dashboard`

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/package.json` | Version bump |
| `frontend/src/main.tsx` | Remove `BrowserRouter`, add `RouterProvider` |
| `frontend/src/App.tsx` | Refactor to layout component (remove `<Routes>` tree) |
| `frontend/src/router.tsx` | New file — full route config via `createBrowserRouter` |
| `frontend/src/components/auth/ProtectedRoute.tsx` | Simplify or remove (auth guard moves to loader) |
