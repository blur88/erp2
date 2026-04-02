# TypeScript 6.x Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade TypeScript from 5.9.3 to 6.0.2 in both backend and frontend, resolving the blocker from issue #235.

**Architecture:** Config + package version changes, plus four TS6 compatibility fixes discovered during execution: (1) remove webpack from nest build to avoid ForkTsChecker/rootDir complications, (2) fix compression namespace import, (3) fix supertest namespace imports in e2e tests, (4) add `declare` to isActive overrides in 8 entity classes. Backend and frontend in a single atomic PR.

**Tech Stack:** TypeScript 6.0.2, ts-jest 29.4.9, NestJS 11 (backend), React 19 + Vite 8 + Vitest 4 (frontend)

**References:** Spec at `docs/superpowers/specs/2026-04-02-typescript6-upgrade-design.md`, Issue #235

---

## Files Modified

| File | Change |
|---|---|
| `backend/package.json` | `typescript` 5.9.3→6.0.2, `ts-jest` ^29.1.0→^29.4.9 |
| `backend/tsconfig.json` | target ES2025, remove baseUrl+rootDir, add types, relative paths |
| `backend/tsconfig.build.json` | new file — extends tsconfig.json, adds rootDir+include for nest build |
| `backend/nest-cli.json` | remove webpack:true, set tsConfigPath to tsconfig.build.json |
| `backend/src/common/security/middleware/security-application.service.ts` | fix compression namespace import |
| `backend/test/auth.e2e-spec.ts` | fix supertest namespace import |
| `backend/test/search.e2e-spec.ts` | fix supertest namespace import |
| `backend/test/e2e/price-lists.e2e-spec.ts` | fix supertest namespace import |
| `backend/test/e2e/account-mappings.e2e-spec.ts` | fix supertest namespace import |
| `backend/src/database/entities/price-list-item.entity.ts` | declare isActive override |
| `backend/src/database/entities/backup-settings.entity.ts` | declare isActive override |
| `backend/src/database/entities/chart-of-account.entity.ts` | declare isActive override |
| `backend/src/database/entities/account-mapping.entity.ts` | declare isActive override |
| `backend/src/database/entities/customer.entity.ts` | declare isActive override |
| `backend/src/database/entities/user.entity.ts` | declare isActive override |
| `backend/src/database/entities/product.entity.ts` | declare isActive override |
| `backend/src/database/entities/price-list.entity.ts` | declare isActive override |
| `frontend/package.json` | `typescript` 5.9.3→6.0.2 |
| `frontend/tsconfig.json` | target ES2025, lib ES2025, remove baseUrl, add rootDir+types, relative paths |

---

## Background: TS6 compatibility issues

**TS5011 (`rootDir` + test files):** TypeScript's `rootDir` does not control which files are included — it only constrains where included files may live. The backend jest config has `roots: ["src", "test"]`, so ts-jest compiles both directories. Setting `rootDir: "./src"` in `tsconfig.json` causes TS5011 because `test/*.ts` files are outside `./src`. Fix: move `rootDir` into `tsconfig.build.json` used only by `nest build`. `tsconfig.json` has no `rootDir`, so ts-jest compiles both `src/` and `test/` freely.

**webpack removed from nest build:** `nest-cli.json` had `"webpack": true` which runs NestJS builds through webpack + ForkTsCheckerWebpackPlugin. `"webpack": true` takes precedence over `--builder tsc` on the CLI, making it impossible to bypass. Removing it switches `nest build` to plain tsc, which reads `tsconfig.build.json` directly — simpler, no ForkTsChecker layer, no bundling overhead that isn't needed server-side.

**Namespace imports not callable (TS2349):** TS6 tightened `import * as X` to always produce a plain module namespace object. Both `compression` and `supertest` use `export =` and are called as functions. Fix: change to default imports (`import X from 'module'`) — valid because `allowSyntheticDefaultImports: true` is set and both packages use `export =` which maps to a default under that flag.

**TS2612 — isActive property override:** TS6 tightened property override checking. Eight entity classes extend `BaseEntity` (which declares `isActive: boolean` with `@Column`) and redeclare `isActive: boolean` with their own `@Column` decorator. TS6 requires `declare` on child-class property overrides that don't change the type. Fix: prefix each redeclaration with `declare`. The `@Column` decorator is unaffected by `declare`.

---

## Task 1: Bump package versions

**Status:** ✅ Already completed on branch `chore/typescript-6-upgrade`

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

- [x] **Step 1: Update backend/package.json**

In `backend/package.json` devDependencies:
```json
"ts-jest": "^29.4.9",
"typescript": "6.0.2"
```

- [x] **Step 2: Update frontend/package.json**

In `frontend/package.json` devDependencies:
```json
"typescript": "6.0.2"
```

- [x] **Step 3: Install and verify**

```bash
cd backend && npm install
cd frontend && npm install
```

Expected: both install cleanly at TypeScript 6.0.2.

---

## Task 2: Update backend tsconfig files and nest-cli.json

**Files:**
- Modify: `backend/tsconfig.json`
- Create: `backend/tsconfig.build.json`
- Modify: `backend/nest-cli.json`

- [ ] **Step 1: Replace backend/tsconfig.json**

`rootDir` is intentionally omitted — it lives in `tsconfig.build.json` only.

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

Changes from pre-upgrade:
- `target`: `ES2018` → `ES2025`
- Removed `baseUrl: "./"`
- Removed `rootDir` (moved to tsconfig.build.json)
- Added `types: [...]`
- `paths` values prefixed with `./` (e.g. `["./src/*"]`)

- [ ] **Step 2: Create backend/tsconfig.build.json**

Used exclusively by `nest build`. Extends `tsconfig.json` and adds `rootDir` + `include: ["src"]` so only `src/` is compiled.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": [
    "src/modules/reports/**/*"
  ]
}
```

- [ ] **Step 3: Update backend/nest-cli.json**

Remove `"webpack": true`. This switches `nest build` from webpack (with ForkTsCheckerWebpackPlugin) to plain tsc, which reads `tsconfig.build.json` directly. NestJS CLI auto-detects `tsconfig.build.json` when present, so `tsConfigPath` is optional but kept for explicitness.

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json",
    "typeCheck": false
  }
}
```

(Removed `"webpack": true` from compilerOptions.)

- [ ] **Step 4: Verify backend builds**

```bash
cd /path/to/erp2/backend
npm run build
```

Expected: exits 0, `dist/` populated. Uses plain tsc with `tsconfig.build.json`. No TS5011 (rootDir+include both scoped to src/).

If build fails with TS errors, they are source-level incompatibilities — do not proceed, fix them first in Tasks 3 and 4.

- [ ] **Step 5: Verify backend lint**

```bash
cd /path/to/erp2/backend
npm run lint
```

Expected: exits 0, no errors.

---

## Task 3: Fix compression import (TS2349)

**File:**
- Modify: `backend/src/common/security/middleware/security-application.service.ts`

- [ ] **Step 1: Change the compression import on line 4**

Change:
```typescript
import * as compression from 'compression';
```
To:
```typescript
import compression from 'compression';
```

The rest of the file is unchanged — `compression({...})` and `compression.filter(...)` both continue to work because the default export IS the callable function, and `filter` is a property on it.

- [ ] **Step 2: Verify build still passes**

```bash
cd /path/to/erp2/backend
npm run build
```

Expected: exits 0.

---

## Task 4: Fix supertest imports in e2e test files (TS2349)

TS6 no longer allows `import * as X` from a module to be called as a function. All four e2e test files use `import * as request from 'supertest'` and then call `request(app)`.

**Files:**
- Modify: `backend/test/auth.e2e-spec.ts`
- Modify: `backend/test/search.e2e-spec.ts`
- Modify: `backend/test/e2e/price-lists.e2e-spec.ts`
- Modify: `backend/test/e2e/account-mappings.e2e-spec.ts`

- [ ] **Step 1: Fix auth.e2e-spec.ts line 3**

Change:
```typescript
import * as request from 'supertest';
```
To:
```typescript
import request from 'supertest';
```

- [ ] **Step 2: Fix search.e2e-spec.ts line 3**

Change:
```typescript
import * as request from 'supertest';
```
To:
```typescript
import request from 'supertest';
```

- [ ] **Step 3: Fix price-lists.e2e-spec.ts line 3**

Change:
```typescript
import * as request from 'supertest';
```
To:
```typescript
import request from 'supertest';
```

- [ ] **Step 4: Fix account-mappings.e2e-spec.ts line 3**

Change:
```typescript
import * as request from 'supertest';
```
To:
```typescript
import request from 'supertest';
```

---

## Task 5: Fix isActive property overrides in entity classes (TS2612)

TS6 requires `declare` on child-class property declarations that override a property from a base class without changing the type. `BaseEntity` declares `isActive: boolean`. Eight child entities redeclare it with a different `@Column` configuration. Add `declare` to each.

The `@Column` decorator is placed on the line(s) above the property declaration and is not affected by `declare`.

**Files:**
- Modify: `backend/src/database/entities/price-list-item.entity.ts`
- Modify: `backend/src/database/entities/backup-settings.entity.ts`
- Modify: `backend/src/database/entities/chart-of-account.entity.ts`
- Modify: `backend/src/database/entities/account-mapping.entity.ts`
- Modify: `backend/src/database/entities/customer.entity.ts`
- Modify: `backend/src/database/entities/user.entity.ts`
- Modify: `backend/src/database/entities/product.entity.ts`
- Modify: `backend/src/database/entities/price-list.entity.ts`

- [ ] **Step 1: Fix each entity — change `isActive: boolean` to `declare isActive: boolean`**

In each of the 8 files listed above, find the line:
```typescript
  isActive: boolean;
```
And change it to:
```typescript
  declare isActive: boolean;
```

The line has decorators above it (e.g. `@Column({...})`, `@IsBoolean()`). Leave those untouched — only the property declaration line itself changes.

- [ ] **Step 2: Verify backend build passes**

```bash
cd /path/to/erp2/backend
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Verify backend tests pass**

```bash
cd /path/to/erp2/backend
npm run test
```

Expected: all unit tests pass. ts-jest 29.4.9 compiles `src/` and `test/` with `tsconfig.json` (no rootDir, no TS5011). The `declare` modifier on entity properties does not affect runtime behavior.

---

## Task 6: Update frontend/tsconfig.json

**Files:**
- Modify: `frontend/tsconfig.json`

- [ ] **Step 1: Replace frontend/tsconfig.json**

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

Changes from pre-upgrade:
- `target`: `ES2020` → `ES2025`
- `lib`: `["ES2020", ...]` → `["ES2025", ...]`
- Removed `baseUrl: "."`
- Added `rootDir: "./src"` (safe — `include: ["src"]` already present, no files outside src/ are included)
- Added `types: ["node", "react", "react-dom"]`
- `paths` values changed to `["./src/*"]` form

- [ ] **Step 2: Verify frontend type-check**

```bash
cd /path/to/erp2/frontend
npm run type-check
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Verify frontend lint**

```bash
cd /path/to/erp2/frontend
npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Spot-check frontend tests**

```bash
cd /path/to/erp2/frontend
npx vitest run src/components/common/FilterSelect/FilterSelect.test.tsx
```

Expected: passes.

- [ ] **Step 5: Run full frontend test suite**

```bash
cd /path/to/erp2/frontend
npm run test
```

Expected: all 95 test files pass. Takes ~12 minutes — do not assume it is hung.

---

## Task 7: Commit and open PR

**Files:**
- `backend/package.json`
- `backend/package-lock.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`
- `backend/nest-cli.json`
- `backend/src/common/security/middleware/security-application.service.ts`
- `backend/test/auth.e2e-spec.ts`
- `backend/test/search.e2e-spec.ts`
- `backend/test/e2e/price-lists.e2e-spec.ts`
- `backend/test/e2e/account-mappings.e2e-spec.ts`
- `backend/src/database/entities/price-list-item.entity.ts`
- `backend/src/database/entities/backup-settings.entity.ts`
- `backend/src/database/entities/chart-of-account.entity.ts`
- `backend/src/database/entities/account-mapping.entity.ts`
- `backend/src/database/entities/customer.entity.ts`
- `backend/src/database/entities/user.entity.ts`
- `backend/src/database/entities/product.entity.ts`
- `backend/src/database/entities/price-list.entity.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/tsconfig.json`

- [ ] **Step 1: Stage all changed files**

```bash
cd /path/to/erp2
git add backend/package.json backend/package-lock.json
git add backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json
git add backend/src/common/security/middleware/security-application.service.ts
git add backend/test/auth.e2e-spec.ts backend/test/search.e2e-spec.ts
git add backend/test/e2e/price-lists.e2e-spec.ts backend/test/e2e/account-mappings.e2e-spec.ts
git add backend/src/database/entities/price-list-item.entity.ts
git add backend/src/database/entities/backup-settings.entity.ts
git add backend/src/database/entities/chart-of-account.entity.ts
git add backend/src/database/entities/account-mapping.entity.ts
git add backend/src/database/entities/customer.entity.ts
git add backend/src/database/entities/user.entity.ts
git add backend/src/database/entities/product.entity.ts
git add backend/src/database/entities/price-list.entity.ts
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: upgrade TypeScript to 6.0.2, ts-jest to 29.4.9

- Resolves blocker from #235: ts-jest 29.4.9 now supports typescript <7
- Upgrades typescript 5.9.3 → 6.0.2 in backend and frontend
- Upgrades ts-jest ^29.1.0 → ^29.4.9 in backend
- Both tsconfigs: target ES2018/ES2020 → ES2025, lib updated
- Both tsconfigs: remove baseUrl, add explicit types[], relative paths
- Backend: split tsconfig into tsconfig.json (ts-jest) + tsconfig.build.json
  (nest build) to avoid TS5011 from rootDir + test/ files outside src/
- Backend: remove webpack:true from nest-cli.json — use plain tsc build
- Backend: fix compression + supertest namespace imports (TS2349)
- Backend: add declare to isActive overrides in 8 entities (TS2612)
- Frontend: add rootDir (safe — include:["src"] already present)

Closes #235

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "chore: upgrade TypeScript to 6.0.2 (closes #235)" \
  --body "$(cat <<'EOF'
## Summary

- Upgrades TypeScript from 5.9.3 → 6.0.2 in both backend and frontend
- Upgrades ts-jest from ^29.1.0 → ^29.4.9 (blocker resolved: peer dep now `typescript <7`)
- Both tsconfigs: ES2025 target, explicit `types[]`, relative `paths`, removed `baseUrl`
- Backend tsconfig split: `tsconfig.json` (ts-jest, no rootDir) + `tsconfig.build.json` (nest build, rootDir+include:src)
- Removed `webpack: true` from `nest-cli.json` — switches to plain tsc build
- Fixed `import * as compression/request` → default imports (TS2349: namespace imports not callable in TS6)
- Added `declare` to `isActive` overrides in 8 entity classes (TS2612)

## Test plan

- [ ] `cd backend && npm run build` passes
- [ ] `cd backend && npm run lint` passes
- [ ] `cd backend && npm run test` passes
- [ ] `cd frontend && npm run type-check` passes
- [ ] `cd frontend && npm run lint` passes
- [ ] `cd frontend && npm run test` passes (full suite ~12 min)

Closes #235

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
