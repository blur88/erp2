# React 19 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade React 18.3.1 to React 19.x (latest) across all frontend dependencies.

**Architecture:** Staged commits on a feature branch. Each commit upgrades one dependency group, verified with type-check + build + tests before committing. The codebase is clean — all functional components, no legacy APIs, no class components.

**Tech Stack:** React 19, TypeScript, Vite 5, Vitest, MUI v7, Redux Toolkit

---

## Key Discovery: Many Listed Dependencies Are Unused

During research, we found these packages have **zero imports** in the source code:
- `framer-motion` (listed in package.json, never imported)
- `recharts` (listed in package.json + vite.config.ts chunks, never imported)
- `react-i18next`, `i18next`, `i18next-browser-languagedetector` (listed, never imported)
- `react-beautiful-dnd` + `@types/react-beautiful-dnd` (listed, never imported)
- `react-window` + `@types/react-window` (listed, never imported)
- `react-virtualized-auto-sizer` (listed, never imported)

This dramatically simplifies the upgrade — most of the "risky" dependencies are dead code.

---

### Task 1: Create Feature Branch

**Files:** None

**Step 1: Create and switch to feature branch**

Run: `cd /home/blur/erp2 && git checkout -b feat/react-19-upgrade`

Expected: Branch created

---

### Task 2: Remove Unused Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts:77` (remove `recharts` from manualChunks)

**Step 1: Uninstall unused production dependencies**

Run:
```bash
cd /home/blur/erp2/frontend && npm uninstall react-beautiful-dnd react-window react-virtualized-auto-sizer framer-motion recharts react-i18next i18next i18next-browser-languagedetector
```

**Step 2: Uninstall unused dev dependencies (types)**

Run:
```bash
cd /home/blur/erp2/frontend && npm uninstall @types/react-beautiful-dnd @types/react-window
```

**Step 3: Remove recharts from vite.config.ts manualChunks**

In `frontend/vite.config.ts`, change line 77 from:
```typescript
charts: ['chart.js', 'react-chartjs-2', 'recharts'],
```
to:
```typescript
charts: ['chart.js', 'react-chartjs-2'],
```

**Step 4: Verify build and tests**

Run:
```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run build && npm run test
```

Expected: All pass. No source files import these packages.

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts
git commit -m "chore: remove unused frontend dependencies

Remove react-beautiful-dnd, react-window, react-virtualized-auto-sizer,
framer-motion, recharts, react-i18next, i18next, and
i18next-browser-languagedetector. None have imports in the source code."
```

---

### Task 3: Upgrade React Core + Types

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install React 19 and types**

Run:
```bash
cd /home/blur/erp2/frontend && npm install react@^19 react-dom@^19 && npm install -D @types/react@^19 @types/react-dom@^19
```

**Step 2: Run type-check and fix errors**

Run: `cd /home/blur/erp2/frontend && npm run type-check`

Known issues to fix:
- **`React.FC` implicit children**: Already properly typed in this codebase (all FC components with children explicitly declare `children: React.ReactNode`). No changes expected.
- **`useRef` types**: React 19 types make `useRef(null)` return a mutable ref. The `ref.current = value` patterns in `useWebSocket.tsx`, `useIdleTimer.ts`, `ProtectedRoute.tsx`, and `NotificationPanel.tsx` should work without changes. Verify by running type-check.
- **Other type errors**: Fix any `@types/react@19` incompatibilities as they surface. Common ones: `ReactElement` type changes, JSX namespace changes.

**Step 3: Run build**

Run: `cd /home/blur/erp2/frontend && npm run build`

Expected: Clean build. Fix any errors.

**Step 4: Run tests**

Run: `cd /home/blur/erp2/frontend && npm run test`

Expected: All pass. If `act()` warnings increase, that's expected — React 19 is stricter about batching. Fix any actual test failures.

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add frontend/package.json frontend/package-lock.json frontend/src/
git commit -m "feat: upgrade React 18 to React 19

Upgrade react, react-dom, @types/react, @types/react-dom to v19."
```

---

### Task 4: Upgrade Testing + Lint Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/test/setup.ts` (fix defaultProps pattern)
- Possibly modify: `frontend/.eslintrc.cjs`

**Step 1: Upgrade @testing-library/react**

Run:
```bash
cd /home/blur/erp2/frontend && npm install -D @testing-library/react@^16 @testing-library/dom@^10
```

Note: v16 moves `@testing-library/dom` to a peer dependency, so it must be installed explicitly.

**Step 2: Upgrade eslint-plugin-react-hooks**

Run:
```bash
cd /home/blur/erp2/frontend && npm install -D eslint-plugin-react-hooks@^5
```

Note: v5.2.0+ supports both legacy config (.eslintrc.cjs) and flat config. The existing `.eslintrc.cjs` with `plugin:react-hooks/recommended` should still work. If not, the plugin also exports `recommended-legacy` for CJS configs.

**Step 3: Fix defaultProps pattern in test setup**

In `frontend/src/test/setup.ts`, the `ButtonBase.defaultProps` mutation (lines 55-61) is deprecated in React 19. Replace with a MUI theme override approach:

Change lines 54-61 from:
```typescript
// Prevent MUI ripple timers from causing act(...) warnings in tests.
const buttonBase = ButtonBase as any;
buttonBase.defaultProps = {
  ...buttonBase.defaultProps,
  disableRipple: true,
  disableTouchRipple: true,
  focusRipple: false,
};
```
to:
```typescript
// Prevent MUI ripple timers from causing act(...) warnings in tests.
// React 19 deprecates defaultProps on function components.
// MUI v7 ButtonBase still supports this pattern, but we use it
// only for test stability — if it stops working, remove it.
const buttonBase = ButtonBase as any;
if (buttonBase.defaultProps !== undefined || typeof buttonBase === 'function') {
  buttonBase.defaultProps = {
    ...buttonBase.defaultProps,
    disableRipple: true,
    disableTouchRipple: true,
    focusRipple: false,
  };
}
```

Actually — since `strict: false` in tsconfig and MUI v7 ButtonBase is a class-like component internally, this pattern likely still works. **Try without changes first**. Only modify if tests break.

**Step 4: Run type-check, build, lint, and tests**

Run:
```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run build && npm run lint && npm run test
```

Expected: All pass. If eslint fails on `plugin:react-hooks/recommended`, try changing to `plugin:react-hooks/recommended-legacy` in `.eslintrc.cjs`.

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add frontend/package.json frontend/package-lock.json frontend/src/test/setup.ts frontend/.eslintrc.cjs
git commit -m "chore: upgrade testing and lint dependencies for React 19

Upgrade @testing-library/react to v16, eslint-plugin-react-hooks to v5."
```

---

### Task 5: Upgrade Remaining React Ecosystem Dependencies

**Files:**
- Modify: `frontend/package.json`

**Step 1: Upgrade react-chartjs-2**

Run:
```bash
cd /home/blur/erp2/frontend && npm install react-chartjs-2@^5.3
```

This is a patch bump. No API changes expected.

**Step 2: Upgrade react-redux and @reduxjs/toolkit**

Run:
```bash
cd /home/blur/erp2/frontend && npm install react-redux@^9.2 @reduxjs/toolkit@^2.5
```

Minor bumps. No API changes expected.

**Step 3: Upgrade react-dropzone**

Run:
```bash
cd /home/blur/erp2/frontend && npm install react-dropzone@^14.3
```

Patch bump. Fixes React 19 JSX type import issues.

**Step 4: Upgrade react-hook-form**

Run:
```bash
cd /home/blur/erp2/frontend && npm install react-hook-form@^7.54
```

Minor bump. No breaking API changes. The `watch` behavior change only affects new React 19 rendering optimizations — existing code will work the same.

**Step 5: Run type-check, build, lint, and tests**

Run:
```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run build && npm run lint && npm run test
```

Expected: All pass.

**Step 6: Commit**

```bash
cd /home/blur/erp2 && git add frontend/package.json frontend/package-lock.json
git commit -m "chore: upgrade React ecosystem dependencies

Upgrade react-chartjs-2, react-redux, @reduxjs/toolkit, react-dropzone,
and react-hook-form to React 19-compatible versions."
```

---

### Task 6: Final Cleanup + Verification

**Files:**
- Possibly modify: `frontend/package.json` (overrides section)

**Step 1: Review overrides**

Check `frontend/package.json` overrides section. Currently has:
```json
"overrides": {
  "esbuild": "^0.25.0",
  "qs": "6.14.2"
}
```

These are unrelated to React and should remain. No changes needed unless `npm ls` shows peer dependency warnings that need overrides.

**Step 2: Check for peer dependency warnings**

Run:
```bash
cd /home/blur/erp2/frontend && npm ls 2>&1 | grep -i "peer dep\|ERESOLVE\|invalid" | head -20
```

Fix any warnings by adding overrides or upgrading packages.

**Step 3: Full verification suite**

Run:
```bash
cd /home/blur/erp2/frontend && npm run type-check && npm run build && npm run lint && npm run test
```

Expected: All pass cleanly.

**Step 4: Commit any final fixes**

```bash
cd /home/blur/erp2 && git add frontend/
git commit -m "chore: final cleanup for React 19 upgrade"
```

(Only if there are changes to commit.)

---

## Verification Summary

After all tasks, the following should be true:

1. `npm run type-check` — zero errors
2. `npm run build` — clean production build
3. `npm run test` — all tests pass
4. `npm run lint` — zero errors
5. `package.json` lists `react@^19` and `react-dom@^19`
6. No unused dependencies remain
7. All commits are atomic and revertable

## Post-Upgrade (Manual)

After merging, rebuild Docker and smoke test:
```bash
docker compose build frontend && docker compose up -d frontend
```

Verify: login, navigate dashboard, view charts, test forms, check WebSocket notifications.
