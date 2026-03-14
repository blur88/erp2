# Vite 8 + @vitejs/plugin-react v6 Upgrade

**Date:** 2026-03-14
**Issue:** #92
**Status:** Approved

## Overview

Upgrade the frontend build tooling from Vite 7 + @vitejs/plugin-react v5 to Vite 8 + @vitejs/plugin-react v6. These versions replace the esbuild/Rollup pipeline with Rolldown (Rust-based bundler) and Oxc (Rust-based transformer), delivering significant build performance improvements.

## Breaking Changes Relevant to This Project

| Change | Impact | Action |
|---|---|---|
| `build.rollupOptions` renamed to `build.rolldownOptions` | Low — old name still works via shim | Rename to remove deprecation warning |
| `manualChunks` object form removed | **High — direct breakage** | Migrate to `codeSplitting.groups` |
| `@vitejs/plugin-react` Babel option removed | None — we call `react()` with no args | No action |
| Default browser targets raised | None | No action |
| Vitest v4 compatibility | Compatible with Vite 8 | No action |
| `optimizeDeps.esbuildOptions` deprecated | None — not used | No action |

## Approach: Rolldown-native `codeSplitting` API

Use `build.rolldownOptions.output.codeSplitting.groups` instead of the deprecated function form of `manualChunks`. This is the forward-looking Rolldown API and avoids carrying deprecated patterns into the new stack.

Rolldown's `codeSplitting.groups` matches modules against resolved file paths (via regex), unlike `manualChunks` which matched against module specifier strings. The chunk names are preserved to avoid browser cache invalidation.

## Changes

### `frontend/package.json`

```diff
- "vite": "^7.3.1",
+ "vite": "8.0.0",
- "@vitejs/plugin-react": "^5.1.4",
+ "@vitejs/plugin-react": "6.0.0",
```

### `frontend/vite.config.ts`

Replace `build.rollupOptions` with `build.rolldownOptions` and migrate `manualChunks` to `codeSplitting.groups`:

```ts
build: {
  outDir: 'dist',
  sourcemap: true,
  rolldownOptions: {
    output: {
      codeSplitting: {
        groups: [
          {
            name: 'vendor',
            test: /node_modules[\\/](react|react-dom)[\\/]/,
            priority: 50,
          },
          {
            name: 'mui',
            test: /node_modules[\\/]@mui[\\/]/,
            priority: 40,
          },
          {
            name: 'charts',
            test: /node_modules[\\/](chart\.js|react-chartjs-2)[\\/]/,
            priority: 30,
          },
          {
            name: 'router',
            test: /node_modules[\\/]react-router-dom[\\/]/,
            priority: 20,
          },
          {
            name: 'redux',
            test: /node_modules[\\/](@reduxjs[\\/]toolkit|react-redux)[\\/]/,
            priority: 10,
          },
        ],
      },
    },
  },
},
```

**Key notes on `codeSplitting.groups`:**
- `test` matches against resolved file paths (`node_modules/[package]/...`), not module specifier strings
- `[\\/]` is used instead of `/` for cross-platform path separator compatibility
- `priority` controls which group claims a module when multiple tests match — higher wins
- `includeDependenciesRecursively: true` is the default — each group automatically pulls in transitive deps
- Rolldown will emit a `runtime.js` chunk automatically when manual groups are used

## Verification Criteria

1. `npm install` — resolves without peer dependency errors
2. `npm run build` — Rolldown bundles successfully; `dist/` contains correctly named chunks (`vendor`, `mui`, `charts`, `router`, `redux`)
3. `npm run dev` — dev server starts; HMR/Fast Refresh works without full page reloads for component-only files
4. `npm run test` — all Vitest tests pass with no regressions

## Out of Scope

- Vitest version upgrade (v4 is already compatible with Vite 8)
- Adopting `optimizeDeps.rolldownOptions` (not currently used)
- Auditing component files for mixed exports (no new breakage introduced by v6; fallback behavior is full reload, not error)
- `build.minify` changes (Oxc is the new default; acceptable for this project)
