# React 19.2 Upgrade Design

**Date:** 2026-02-27
**Goal:** Upgrade React 18.3.1 to 19.x to stay current with the ecosystem.

## Current State

- React 18.3.1 / React DOM 18.3.1
- All functional components, no class components, no legacy APIs
- Modern tooling: Vite 5, TypeScript, Vitest
- StrictMode enabled
- MUI v7 (already React 19 compatible)

## Strategy: Staged Commits on Feature Branch

### Commit 1 — Remove unused dependencies

Remove packages with zero imports in the codebase:
- `react-beautiful-dnd` + `@types/react-beautiful-dnd`
- `react-window` + `@types/react-window`
- `react-virtualized-auto-sizer`

### Commit 2 — Upgrade React core + types

| Package | From | To |
|---------|------|----|
| `react` | ^18.3.1 | ^19.0.0 |
| `react-dom` | ^18.3.1 | ^19.0.0 |
| `@types/react` | ^18.3.27 | ^19.0.0 |
| `@types/react-dom` | ^18.3.7 | ^19.0.0 |

Known type changes to fix:
- `React.FC` no longer includes implicit `children` prop
- `useRef()` without initial value returns `RefObject` instead of `MutableRefObject`

### Commit 3 — Upgrade framer-motion (10 → 11)

| Package | From | To |
|---------|------|----|
| `framer-motion` | ^10.16.5 | ^11.0.0 (package: `motion`) |

Code changes:
- Update all imports from `'framer-motion'` to `'motion/react'`
- API surface (motion components, AnimatePresence, etc.) is largely the same

### Commit 4 — Upgrade testing + lint dependencies

| Package | From | To |
|---------|------|----|
| `@testing-library/react` | ^14.1.2 | ^16.0.0 |
| `eslint-plugin-react-hooks` | ^4.6.0 | ^5.0.0 |

Code changes:
- Fix `defaultProps` mutation in `src/test/setup.ts`
- Update ESLint config if needed for flat config support

### Commit 5 — Upgrade remaining React ecosystem deps

| Package | From | To |
|---------|------|----|
| `react-i18next` | ^13.5.0 | ^16.0.0 |
| `recharts` | ^2.8.0 | ^3.0.0 |
| `react-chartjs-2` | ^5.2.0 | ^5.3.0 |
| `react-redux` | ^9.0.4 | ^9.2.0 |
| `react-dropzone` | ^14.2.3 | ^14.3.8 |
| `react-hook-form` | ^7.48.2 | ^7.71.0 |

Code changes:
- recharts v3 may rename/remove some component props
- react-i18next v16 import path changes

### Commit 6 — Final cleanup

- Remove unnecessary `overrides` entries
- Full test + type-check + build pass

## Verification (per commit)

1. `npm run type-check` — TypeScript compilation
2. `npm run build` — Vite production build
3. `npm run test` — Vitest unit tests
4. `npm run lint` — ESLint

After all commits: Docker build + smoke test.

## Rollback

Each commit is atomic. Use `git revert <commit>` to roll back any specific change.

## Risk Assessment

**Low risk:** Codebase uses no deprecated React APIs. All components are functional with hooks. MUI v7 already supports React 19.

**Medium risk areas:**
- framer-motion v10→v11 import rename (mechanical but touches many files)
- recharts v2→v3 API changes (need to verify chart component props)
- react-hook-form `watch` behavior changes under React 19's rendering model
