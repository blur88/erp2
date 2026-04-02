# TypeScript 6.x Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade TypeScript from 5.9.3 to 6.0.2 in both backend and frontend, resolving the blocker from issue #235.

**Architecture:** Pure config + package version changes — no source code modifications required. Backend and frontend are upgraded together in a single atomic PR. Verification runs build, lint, and tests in sequence for each project.

**Tech Stack:** TypeScript 6.0.2, ts-jest 29.4.9, NestJS 11 (backend), React 19 + Vite 8 + Vitest 4 (frontend)

**References:** Spec at `docs/superpowers/specs/2026-04-02-typescript6-upgrade-design.md`, Issue #235

---

## Files Modified

| File | Change |
|---|---|
| `backend/package.json` | `typescript` 5.9.3→6.0.2, `ts-jest` ^29.1.0→^29.4.9 |
| `backend/tsconfig.json` | target ES2025, remove baseUrl, add rootDir+types, relative paths |
| `frontend/package.json` | `typescript` 5.9.3→6.0.2 |
| `frontend/tsconfig.json` | target ES2025, lib ES2025, remove baseUrl, add rootDir+types, relative paths |

---

## Task 1: Bump package versions

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

- [ ] **Step 1: Update backend/package.json**

In `backend/package.json`, find the `devDependencies` section and change:
```json
"ts-jest": "^29.4.9",
"typescript": "6.0.2"
```
(Previously `"ts-jest": "^29.1.0"` and `"typescript": "5.9.3"`)

- [ ] **Step 2: Update frontend/package.json**

In `frontend/package.json`, find the `devDependencies` section and change:
```json
"typescript": "6.0.2"
```
(Previously `"typescript": "5.9.3"`)

- [ ] **Step 3: Install backend dependencies**

```bash
cd /path/to/erp2/backend
npm install
```

Expected: installs cleanly, no `ERESOLVE` errors. `package-lock.json` updated.

- [ ] **Step 4: Install frontend dependencies**

```bash
cd /path/to/erp2/frontend
npm install
```

Expected: installs cleanly, no `ERESOLVE` errors. `package-lock.json` updated.

- [ ] **Step 5: Verify installed versions**

```bash
cd /path/to/erp2/backend && node -e "console.log(require('./node_modules/typescript/package.json').version)"
cd /path/to/erp2/frontend && node -e "console.log(require('./node_modules/typescript/package.json').version)"
```

Expected: both print `6.0.2`

---

## Task 2: Update backend/tsconfig.json

**Files:**
- Modify: `backend/tsconfig.json`

- [ ] **Step 1: Replace the file contents**

Replace `backend/tsconfig.json` with:

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

Key changes from previous version:
- `target`: `ES2018` → `ES2025`
- Removed `baseUrl: "./"`
- Added `rootDir: "./src"`
- Added `types: [...]` array
- `paths` values changed from `["src/*"]` to `["./src/*"]` (relative, explicit)

- [ ] **Step 2: Verify backend builds**

```bash
cd /path/to/erp2/backend
npm run build
```

Expected: exits 0, `dist/` directory populated, no TypeScript errors.

If it fails with path resolution errors, the most likely cause is the `paths` change — double-check that all entries use `./src/` prefix.

- [ ] **Step 3: Verify backend lint**

```bash
cd /path/to/erp2/backend
npm run lint
```

Expected: exits 0, no errors.

- [ ] **Step 4: Verify backend tests**

```bash
cd /path/to/erp2/backend
npm run test
```

Expected: all tests pass. ts-jest 29.4.9 with TS 6.0.2 should work without configuration changes.

---

## Task 3: Update frontend/tsconfig.json

**Files:**
- Modify: `frontend/tsconfig.json`

- [ ] **Step 1: Replace the file contents**

Replace `frontend/tsconfig.json` with:

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

Key changes from previous version:
- `target`: `ES2020` → `ES2025`
- `lib`: `["ES2020", "DOM", "DOM.Iterable"]` → `["ES2025", "DOM", "DOM.Iterable"]`
- Removed `baseUrl: "."`
- Added `rootDir: "./src"`
- Added `types: ["node", "react", "react-dom"]`
- `paths` values changed from `["src/*"]` to `["./src/*"]` (relative, explicit)

- [ ] **Step 2: Verify frontend type-check**

```bash
cd /path/to/erp2/frontend
npm run type-check
```

Expected: exits 0, no TypeScript errors. This runs `tsc --noEmit` using the updated tsconfig.

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

Expected: passes. Vitest uses esbuild/Vite for transforms, not tsc directly, so tsconfig changes have minimal impact on test execution — but this confirms the setup is coherent.

- [ ] **Step 5: Run full frontend test suite**

```bash
cd /path/to/erp2/frontend
npm run test
```

Expected: all 95 test files pass. This takes ~12 minutes — do not assume it is hung.

---

## Task 4: Commit and open PR

**Files:**
- `backend/package.json`
- `backend/package-lock.json`
- `backend/tsconfig.json`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/tsconfig.json`

- [ ] **Step 1: Stage all changed files**

```bash
cd /path/to/erp2
git add backend/package.json backend/package-lock.json backend/tsconfig.json
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
- Both tsconfigs: remove baseUrl, add rootDir, add explicit types[]
- Both tsconfigs: paths values made relative (./src/*) per TS6 guidance

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
- Both tsconfigs updated: ES2025 target, explicit `types[]`, relative `paths`, `rootDir`, removed `baseUrl`
- No source code changes required — no breaking changes found in codebase

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
