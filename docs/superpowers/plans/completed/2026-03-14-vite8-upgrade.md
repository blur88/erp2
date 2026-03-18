# Vite 8 + @vitejs/plugin-react v6 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the frontend build tooling from Vite 7 + @vitejs/plugin-react v5 to Vite 8 + @vitejs/plugin-react v6, migrating `manualChunks` to Rolldown's native `codeSplitting.groups` API.

**Architecture:** Two files change: `frontend/package.json` gets updated version ranges, and `frontend/vite.config.ts` replaces `build.rollupOptions` with `build.rolldownOptions` and migrates the chunk configuration to `codeSplitting.groups`. No new files are created.

**Tech Stack:** Vite 8, @vitejs/plugin-react 6, Rolldown 1.0.0-rc.9 (bundled with Vite 8), Vitest 4 (unchanged)

---

## Chunk 1: Upgrade packages and migrate vite config

**Files:**
- Modify: `frontend/package.json` — bump vite and @vitejs/plugin-react version ranges
- Modify: `frontend/vite.config.ts` — replace `rollupOptions` with `rolldownOptions` + `codeSplitting.groups`

---

### Task 1: Update package versions

- [ ] **Step 1: Edit `frontend/package.json`**

  In `devDependencies`, change:
  ```json
  "vite": "^7.3.1"
  ```
  to:
  ```json
  "vite": "^8.0.0"
  ```

  And change:
  ```json
  "@vitejs/plugin-react": "^5.1.4"
  ```
  to:
  ```json
  "@vitejs/plugin-react": "^6.0.0"
  ```

- [ ] **Step 2: Install dependencies**

  Run from `frontend/`:
  ```bash
  npm install
  ```

  Expected: installs without peer dependency errors. Vite 8.x and @vitejs/plugin-react 6.x resolve cleanly. `package-lock.json` updates.

  If you see peer dependency errors referencing other packages (e.g., vitest, eslint plugins), check whether they need separate version bumps. Vitest 4 is confirmed compatible with Vite 8 — its peer dep is `vite >= 6.0.0`.

- [ ] **Step 3: Verify installed versions**

  Run from `frontend/`:
  ```bash
  npm list vite @vitejs/plugin-react --depth=0
  ```

  Expected output (versions may be higher patch/minor):
  ```
  ├── @vitejs/plugin-react@6.x.x
  └── vite@8.x.x
  ```

---

### Task 2: Migrate vite.config.ts to Rolldown API

The current `build` section in `frontend/vite.config.ts` (lines 69–83):

```ts
build: {
  outDir: 'dist',
  sourcemap: true,
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        mui: ['@mui/material', '@mui/icons-material'],
        charts: ['chart.js', 'react-chartjs-2'],
        router: ['react-router-dom'],
        redux: ['@reduxjs/toolkit', 'react-redux'],
      },
    },
  },
},
```

- [ ] **Step 1: Replace the `build` section in `frontend/vite.config.ts`**

  Replace the entire `build: { ... }` block above with:

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

  Key differences:
  - `rollupOptions` → `rolldownOptions`
  - `manualChunks` object → `codeSplitting.groups` array
  - Each entry uses `test` (regex matching resolved file paths) instead of package name arrays
  - `priority` ensures higher-priority groups claim modules before lower-priority ones
  - `[\\/]` matches both Unix and Windows path separators

- [ ] **Step 2: Run TypeScript check**

  Run from `frontend/`:
  ```bash
  npm run type-check
  ```

  Expected: no TypeScript errors. If you see errors like `Property 'rolldownOptions' does not exist`, ensure the installed `vite` version is 8.x (Task 1 Step 3). The `rolldownOptions` type is only available in Vite 8's type definitions.

---

### Task 3: Verify the build

- [ ] **Step 1: Run production build**

  Run from `frontend/`:
  ```bash
  npm run build
  ```

  Expected:
  - Build completes without errors
  - No deprecation warnings about `rollupOptions` or `manualChunks`
  - `dist/assets/` contains chunk files named like `vendor-[hash].js`, `mui-[hash].js`, `charts-[hash].js`, `router-[hash].js`, `redux-[hash].js`

  If you see a build error about `codeSplitting` not being a valid option, confirm you are on Vite 8 (`npx vite --version`) and that `rolldownOptions` (not `rollupOptions`) is used.

- [ ] **Step 2: Inspect chunk output**

  Run from `frontend/`:
  ```bash
  ls dist/assets/*.js | grep -E 'vendor|mui|charts|router|redux'
  ```

  Expected: at least 5 matching files. Exact filenames include a content hash, e.g. `vendor-abc123.js`.

---

### Task 4: Verify tests and dev server

- [ ] **Step 1: Run the test suite**

  Run from `frontend/`:
  ```bash
  npm run test
  ```

  Expected: all tests pass. Vitest 4 is compatible with Vite 8 — no test changes are required. If a test fails, it is a pre-existing failure, not caused by this upgrade.

- [ ] **Step 2: Smoke-test the dev server**

  Run from `frontend/`:
  ```bash
  npm run dev
  ```

  Expected:
  - Server starts on port 3000 without errors
  - No console errors about `rollupOptions`, `manualChunks`, or Babel
  - Open a component file, make a trivial change (e.g., add a comment), save — browser should update without a full page reload (Fast Refresh working)

  Stop the server with `Ctrl+C` when done.

---

### Task 5: Commit

- [ ] **Step 1: Stage and commit**

  Run from the repo root:
  ```bash
  git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts
  git commit -m "feat(frontend): upgrade to Vite 8 and @vitejs/plugin-react v6 (closes #92)"
  ```

  Expected: commit succeeds. The message closes issue #92.
