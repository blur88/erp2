# Vite 7.3.1 + Vitest 4.0 Upgrade Design

**Date**: 2026-02-27
**Scope**: Frontend tooling upgrade (Vite 5→7, Vitest 1→4)

## Overview

Upgrade Vite from 5.0.8 to 7.3.1 and all related tooling to latest versions. This is a 2-major-version jump for Vite and 3-major-version jump for Vitest.

## Package Changes

| Package | Current | Target |
|---------|---------|--------|
| `vite` | ^5.0.8 | ^7.3.1 |
| `vitest` | ^1.0.4 | ^4.0.18 |
| `@vitest/coverage-v8` | ^1.0.4 | ^4.0.18 |
| `@vitest/ui` | ^1.0.4 | ^4.0.18 |
| `@vitejs/plugin-react` | ^4.2.1 | ^5.1.4 |

### Other package.json changes

- `engines.node`: `>=18.0.0` → `>=20.19.0` (Vite 7 requires Node 20.19+)
- Remove `esbuild` from `overrides` (Vite 7 bundles compatible version)

## Config Changes

### vite.config.ts — Vitest pool options

Vitest 4 removes `poolOptions`. Migrate to top-level options:

```typescript
// BEFORE
test: {
  pool: 'forks',
  poolOptions: {
    forks: {
      minForks: 1,
      maxForks: 2,
      execArgv: ['--max-old-space-size=4096'],
    },
  },
}

// AFTER
test: {
  maxWorkers: 2,
  execArgv: ['--max-old-space-size=4096'],
}
```

- `pool` option removed (Vitest 4 handles internally)
- `poolOptions.forks.maxForks` → `maxWorkers`
- `poolOptions.forks.minForks` → removed (no `minWorkers` in Vitest 4)
- `poolOptions.forks.execArgv` → `execArgv` (top-level)

### No changes needed

- `defineConfig` import from `vitest/config` — works
- `createLogger` import from `vite` — works
- `__dirname` usage in path aliases — works
- Proxy configuration — works
- `manualChunks` object form in rollupOptions — works
- `tsconfig.json` and `tsconfig.node.json` — unchanged

## Breaking Changes Assessment

### Vite 5→6 breaking changes (handled automatically)

- Default browser target change: accepted (modern browsers only)
- `commonjsOptions.strictRequires` now `true`: acceptable
- JSON stringify default `'auto'`: acceptable
- PostCSS upgraded to v6: no custom config, no impact

### Vite 6→7 breaking changes (handled automatically)

- Default `build.target` now `'baseline-widely-available'`: accepted
- `splitVendorChunkPlugin` removed: not used (we use `manualChunks`)
- ESM-only distribution: project already uses `"type": "module"`

### Vitest 1→4 breaking changes

| Change | Impact | Action |
|--------|--------|--------|
| `poolOptions` removed | Config needs rewrite | Migrate to top-level |
| `mockReset()` restores original impl | Low risk | Run tests, fix if needed |
| `vi.spyOn()` reuses existing mocks | Low risk | Run tests, fix if needed |
| `mock.invocationCallOrder` starts at 1 | Not used | None |
| `vi.fn().getMockName()` returns `'vi.fn()'` | Not used | None |
| Stricter error equality | Low risk | Run tests, fix if needed |
| `coverage.all` removed | Not used | None |
| `minWorkers` removed | Used as `minForks` | Remove it |

### @vitejs/plugin-react 4→5

- Minimum Node 20.19+ (already required by Vite 7)
- Default `exclude` changed to `[/\/node_modules\//]]` (better default)
- React removed from auto `resolve.dedupe` (no impact)

## Test Impact

38 test files scanned. No high-risk patterns found:
- `vi.mocked()` — still works in Vitest 4
- No `SpyInstance` type usage
- No two-param `vi.fn<>` generics
- No test options as 3rd argument
- No `vitest/reporters` imports

Strategy: upgrade first, run test suite, fix any runtime failures.

## Browser Target

Accepted default `'baseline-widely-available'`:
- Chrome 107+, Firefox 104+, Safari 16+, Edge 107+

## Files Changed

1. `frontend/package.json` — version bumps, engines, overrides
2. `frontend/vite.config.ts` — pool options migration
3. Test files — reactive fixes only (if any tests break)
