# jsdom 28 → 29 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `jsdom` from `28.1.0` to `29.0.0` in `frontend/package.json` and ensure all 67 Vitest tests continue to pass.

**Architecture:** This is a pure dependency upgrade with no application code changes. The codebase audit confirmed no pre-emptive code fixes are required — all three files that redefine `window.navigator.clipboard` already use `configurable: true`, which is compatible with jsdom v29's data→accessor property conversion.

**Tech Stack:** Vitest v4.0.18, jsdom, npm, Node.js v24.13.1

---

## Chunk 1: Bump the dependency and verify

### Task 1: Update jsdom version in package.json

**Files:**
- Modify: `frontend/package.json` (devDependencies.jsdom line)

- [ ] **Step 1: Open `frontend/package.json` and find the jsdom line**

  Look for this line in `devDependencies`:
  ```json
  "jsdom": "28.1.0",
  ```

- [ ] **Step 2: Change the version to 29.0.0**

  Replace with:
  ```json
  "jsdom": "29.0.0",
  ```

- [ ] **Step 3: Install the updated dependency**

  Run from the `frontend/` directory:
  ```bash
  cd frontend && npm install
  ```

  Expected: npm resolves and installs jsdom 29.0.0. No peer dependency errors. A `package-lock.json` update is normal.

- [ ] **Step 4: Verify the installed version**

  ```bash
  cd /home/blur/erp2/frontend && node -e "console.log(require('./node_modules/jsdom/package.json').version)"
  ```

  Expected output:
  ```
  29.0.0
  ```

- [ ] **Step 5: Run the full test suite**

  ```bash
  cd frontend && npm run test
  ```

  Expected: All tests pass. If any tests fail, proceed to Task 2 before committing.

- [ ] **Step 6: Commit**

  ```bash
  cd /home/blur/erp2
  git add frontend/package.json frontend/package-lock.json
  git commit -m "chore: update jsdom to 29.0.0 (issue #109)"
  ```

---

### Task 2: Fix any test failures (conditional — only if Task 1 Step 5 has failures)

**Files:**
- Modify: whichever test files are reported as failing

- [ ] **Step 1: Identify failing tests from the output**

  Read the failure messages carefully. Common jsdom v29 failure patterns:

  | Symptom | Cause | Fix |
  |---------|-------|-----|
  | `TypeError: Cannot redefine property` on a window property | Property was converted from data to accessor; missing `configurable: true` | Add `configurable: true` to the `Object.defineProperty` call |
  | `NotSupportedError: document.createEvent(...)` | Stricter event type validation | Replace `document.createEvent('CustomEvent')` with `new CustomEvent(...)` |
  | SVG element event handler not firing on window | SVG event proxying removed | Move listener to the SVG element directly |

- [ ] **Step 2: Apply the minimal fix to each failing file**

  For a `Cannot redefine property` error on `window.X`, the pattern to use is:
  ```ts
  Object.defineProperty(window, 'X', {
    value: mockValue,
    configurable: true,   // ← this is the required flag
    writable: true,
  })
  ```

  For a `document.createEvent` strictness error, replace:
  ```ts
  const event = document.createEvent('CustomEvent')
  event.initCustomEvent('myevent', true, true, detail)
  ```
  with:
  ```ts
  const event = new CustomEvent('myevent', { bubbles: true, cancelable: true, detail })
  ```

- [ ] **Step 3: Re-run the full test suite**

  ```bash
  cd frontend && npm run test
  ```

  Expected: All tests pass. If new failures appear, repeat Step 1–3 for each one.

- [ ] **Step 4: Commit all fixes**

  Stage only the fixed test files (not application code):
  ```bash
  cd /home/blur/erp2
  git add frontend/package.json frontend/package-lock.json
  # Also stage each test file you fixed in Step 2, e.g.:
  # git add frontend/src/path/to/fixed.test.tsx
  git commit -m "chore: update jsdom to 29.0.0, fix test compatibility (issue #109)"
  ```
