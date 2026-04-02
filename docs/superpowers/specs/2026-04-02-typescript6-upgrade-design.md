# TypeScript 6.x Upgrade Design

**Date:** 2026-04-02  
**Issue:** #235  
**PR that did partial upgrade:** #234  
**Original issue:** #177

## Summary

Upgrade TypeScript from 5.9.3 to 6.0.2 in both backend and frontend. The blocker (ts-jest peer dependency `typescript <6`) was resolved in ts-jest v29.4.9 which now allows `typescript <7`.

No code-level breaking changes were found in the codebase. This is a config + package version bump only.

## Context

- **Node.js runtime:** 24.14.1 (Docker) — fully supports ES2025
- **Approach:** Single atomic PR (Option A) — all changes in one commit

## Breaking Change Analysis

| Concern | Status | Notes |
|---|---|---|
| `ts-jest` peer dep | **Resolved** | v29.4.9 supports `typescript <7` |
| `@typescript-eslint` peer dep | **OK** | v8.58.0 supports `>=4.8.4 <6.1.0`; TS 6.0.2 satisfies this |
| `ts-node` peer dep | **OK** | `>=2.7`, no upper bound |
| `ts-loader` peer dep | **OK** | `typescript: '*'` |
| `tsconfig-paths` peer dep | **OK** | no TS peer dep |
| `vitest` / `vite` | **OK** | no TS peer dep |
| `erasableSyntaxOnly` | **N/A** | opt-in flag, not enabled; no namespaces in codebase |
| `import assert {}` (removed) | **N/A** | no usage found in codebase |
| `const enum` with isolatedModules | **N/A** | no const enums found in codebase |
| Removed compiler options | **N/A** | none of the removed options used in tsconfigs |
| `baseUrl` deprecation | **Fixed** | migrating to relative `paths` (see tsconfig changes) |

## Package Changes

### backend/package.json
- `typescript`: `5.9.3` → `6.0.2`
- `ts-jest`: `^29.1.0` → `^29.4.9`

### frontend/package.json
- `typescript`: `5.9.3` → `6.0.2`

## backend/tsconfig.json

Full replacement:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2025",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false,
    "strict": false,
    "strictPropertyInitialization": false,
    "types": ["node", "jest", "multer", "archiver", "bcrypt", "compression", "express", "supertest"],
    "paths": {
      "@/*": ["./src/*"],
      "@modules/*": ["./src/modules/*"],
      "@common/*": ["./src/common/*"],
      "@config/*": ["./src/config/*"],
      "@database/*": ["./src/database/*"]
    }
  },
  "exclude": [
    "src/modules/reports/**/*"
  ]
}
```

**Changes from current:**
- `target`: `ES2018` → `ES2025`
- `baseUrl: "./"` removed
- `rootDir: "./src"` added
- `types: [...]` added (explicit, prevents type bleed)
- `paths` values prefixed with `./src/` (relative, no baseUrl dependency)

## frontend/tsconfig.json

Full replacement:

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "useDefineForClassFields": true,
    "lib": ["ES2025", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,

    "types": ["node", "react", "react-dom"],
    "rootDir": "./src",

    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/pages/*": ["./src/pages/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/services/*": ["./src/services/*"],
      "@/store/*": ["./src/store/*"],
      "@/utils/*": ["./src/utils/*"],
      "@/types/*": ["./src/types/*"],
      "@/styles/*": ["./src/styles/*"],
      "@/assets/*": ["./src/assets/*"]
    }
  },
  "include": ["src"],
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/__tests__/**",
    "src/setupTests.ts",
    "src/test/**",
    "src/mocks/**"
  ],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Changes from current:**
- `target`: `ES2020` → `ES2025`
- `lib`: `["ES2020", ...]` → `["ES2025", ...]`
- `baseUrl: "."` removed
- `rootDir: "./src"` added
- `types: [...]` added (explicit, prevents type bleed)
- `paths` values prefixed with `./src/` (relative, no baseUrl dependency)

## Verification Sequence

Run in order, stop and investigate on any failure:

```bash
# Backend
cd backend
npm install
npm run build
npm run lint
npm run test

# Frontend
cd frontend
npm install
npm run type-check
npm run lint
npx vitest run src/components/common/FilterSelect/FilterSelect.test.tsx  # spot check
```

> Note: Full frontend test suite takes ~12 minutes (95 files). Run targeted checks during dev; full suite before merging.

## Out of Scope

- `erasableSyntaxOnly` — no namespaces in codebase, no value
- `@typescript-eslint` upgrade — v8.58.0 is compatible with TS 6.0.2; upgrade deferred until TS 6.1+
- Separate `tsconfig.test.json` — not needed; explicit `types` in main tsconfig is sufficient for this project's test setup
- Phase 5 search analytics, filter bar deferred fields — unrelated
