# TypeScript 6.x Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade TypeScript from 5.9.3 to 6.0.2 in both backend and frontend, resolving the blocker from issue #235.

**Architecture:** Config + package version changes, plus two TS6 compatibility fixes discovered during execution: (1) split backend tsconfig so `rootDir` is enforced for builds but not for ts-jest test compilation, and (2) update supertest namespace imports that TS6 no longer treats as callable. Backend and frontend are upgraded together in a single atomic PR.

**Tech Stack:** TypeScript 6.0.2, ts-jest 29.4.9, NestJS 11 (backend), React 19 + Vite 8 + Vitest 4 (frontend)

**References:** Spec at `docs/superpowers/specs/2026-04-02-typescript6-upgrade-design.md`, Issue #235

---

## Files Modified

| File | Change |
|---|---|
| `backend/package.json` | `typescript` 5.9.3→6.0.2, `ts-jest` ^29.1.0→^29.4.9 |
| `backend/tsconfig.json` | target ES2025, remove baseUrl+rootDir, add types, relative paths |
| `backend/tsconfig.build.json` | new file — extends tsconfig.json, adds rootDir+include for nest build |
| `backend/nest-cli.json` | point tsConfigPath to tsconfig.build.json |
| `backend/test/auth.e2e-spec.ts` | fix supertest namespace import |
| `backend/test/search.e2e-spec.ts` | fix supertest namespace import |
| `backend/test/e2e/price-lists.e2e-spec.ts` | fix supertest namespace import |
| `backend/test/e2e/account-mappings.e2e-spec.ts` | fix supertest namespace import |
| `frontend/package.json` | `typescript` 5.9.3→6.0.2 |
| `frontend/tsconfig.json` | target ES2025, lib ES2025, remove baseUrl, add rootDir+types, relative paths |

---

## Background: Two TS6 compatibility issues

**Issue 1 — TS5011 (`rootDir` + test files):** TypeScript's `rootDir` does not control which files are included — it only constrains where included files may live. The backend `jest` config has `roots: ["src", "test"]`, so ts-jest compiles both directories. Setting `rootDir: "./src"` in `tsconfig.json` then causes TS5011 because `test/*.ts` files are outside `./src`. Fix: move `rootDir` (and `include: ["src"]`) into a dedicated `tsconfig.build.json` used only by nest build. `tsconfig.json` itself has no `rootDir`, so ts-jest can compile both `src/` and `test/` freely.

**Issue 2 — TS2349 (supertest import not callable):** TS6 tightened `import * as X` to always produce a plain module namespace object, which is not callable. `supertest` exports a callable function, so `import * as request from 'supertest'` then used as `request(app)` fails. Fix: change to `import request from 'supertest'` — valid because `allowSyntheticDefaultImports: true` is already in tsconfig and `@types/supertest` uses `export =` which maps to a default import under that flag.

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

## Task 2: Fix backend tsconfig — split build config, update tsconfig.json

**Files:**
- Modify: `backend/tsconfig.json`
- Create: `backend/tsconfig.build.json`
- Modify: `backend/nest-cli.json`

- [ ] **Step 1: Replace backend/tsconfig.json**

`rootDir` is intentionally omitted here — it lives in `tsconfig.build.json` instead.

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

Changes from pre-upgrade tsconfig.json:
- `target`: `ES2018` → `ES2025`
- Removed `baseUrl: "./"`
- Removed `rootDir` (moved to tsconfig.build.json)
- Added `types: [...]` (explicit, prevents type bleed)
- `paths` values prefixed with `./` (e.g. `["./src/*"]`)

- [ ] **Step 2: Create backend/tsconfig.build.json**

This file is used exclusively by `nest build`. It extends `tsconfig.json` and adds `rootDir` + `include` so only `src/` is compiled during the production build.

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

- [ ] **Step 3: Update nest-cli.json to use tsconfig.build.json**

Replace `backend/nest-cli.json` with:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true,
    "tsConfigPath": "tsconfig.build.json",
    "typeCheck": false
  }
}
```

(Changed `"tsConfigPath": "tsconfig.json"` → `"tsConfigPath": "tsconfig.build.json"`)

- [ ] **Step 4: Verify backend builds**

```bash
cd /path/to/erp2/backend
npm run build
```

Expected: exits 0, `dist/` populated, no TypeScript errors.

- [ ] **Step 5: Verify backend lint**

```bash
cd /path/to/erp2/backend
npm run lint
```

Expected: exits 0, no errors.

---

## Task 3: Fix supertest imports in backend test files

TS6 no longer allows `import * as X` from a module to be called as a function. All four files use `import * as request from 'supertest'` and then call `request(app)`. Fix each to use a default import.

**Files:**
- Modify: `backend/test/auth.e2e-spec.ts`
- Modify: `backend/test/search.e2e-spec.ts`
- Modify: `backend/test/e2e/price-lists.e2e-spec.ts`
- Modify: `backend/test/e2e/account-mappings.e2e-spec.ts`

- [ ] **Step 1: Fix auth.e2e-spec.ts**

In `backend/test/auth.e2e-spec.ts`, change line 3 from:
```typescript
import * as request from 'supertest';
```
to:
```typescript
import request from 'supertest';
```

- [ ] **Step 2: Fix search.e2e-spec.ts**

In `backend/test/search.e2e-spec.ts`, change line 3 from:
```typescript
import * as request from 'supertest';
```
to:
```typescript
import request from 'supertest';
```

- [ ] **Step 3: Fix price-lists.e2e-spec.ts**

In `backend/test/e2e/price-lists.e2e-spec.ts`, change line 3 from:
```typescript
import * as request from 'supertest';
```
to:
```typescript
import request from 'supertest';
```

- [ ] **Step 4: Fix account-mappings.e2e-spec.ts**

In `backend/test/e2e/account-mappings.e2e-spec.ts`, change line 3 from:
```typescript
import * as request from 'supertest';
```
to:
```typescript
import request from 'supertest';
```

- [ ] **Step 5: Verify backend tests pass**

```bash
cd /path/to/erp2/backend
npm run test
```

Expected: all unit tests pass. ts-jest 29.4.9 with TS 6.0.2 compiles `src/` and `test/` without TS5011 (no rootDir in tsconfig.json) and without TS2349 (supertest import fixed).

Note: `npm run test` runs unit tests only (jest config roots: src + test/unit). E2e tests run separately via `npm run test:e2e` and are not part of this verification.

---

## Task 4: Update frontend/tsconfig.json

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

Changes from pre-upgrade tsconfig.json:
- `target`: `ES2020` → `ES2025`
- `lib`: `["ES2020", ...]` → `["ES2025", ...]`
- Removed `baseUrl: "."`
- Added `rootDir: "./src"` (safe here — `include: ["src"]` already excludes test files)
- Added `types: ["node", "react", "react-dom"]`
- `paths` values prefixed with `./src/`

Note: Frontend `rootDir` is safe because `include: ["src"]` was already present, so there are no files outside `./src` included in compilation.

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

Expected: exits 0, no errors.

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

## Task 5: Commit and open PR

**Files:**
- `backend/package.json`
- `backend/package-lock.json`
- `backend/tsconfig.json`
- `backend/tsconfig.build.json`
- `backend/nest-cli.json`
- `backend/test/auth.e2e-spec.ts`
- `backend/test/search.e2e-spec.ts`
- `backend/test/e2e/price-lists.e2e-spec.ts`
- `backend/test/e2e/account-mappings.e2e-spec.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/tsconfig.json`

- [ ] **Step 1: Stage all changed files**

```bash
cd /path/to/erp2
git add backend/package.json backend/package-lock.json
git add backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json
git add backend/test/auth.e2e-spec.ts backend/test/search.e2e-spec.ts
git add backend/test/e2e/price-lists.e2e-spec.ts backend/test/e2e/account-mappings.e2e-spec.ts
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
- Backend: nest-cli.json updated to use tsconfig.build.json
- Backend: fix supertest namespace imports (TS6 TS2349 compatibility)
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
- Backend tsconfig split into `tsconfig.json` (ts-jest) and `tsconfig.build.json` (nest build) — required to avoid TS5011 from `rootDir` conflicting with test files outside `src/`
- `nest-cli.json` updated to use `tsconfig.build.json`
- Fixed `import * as request from 'supertest'` → `import request from 'supertest'` in 4 e2e test files (TS6 TS2349: namespace imports are no longer callable)

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
