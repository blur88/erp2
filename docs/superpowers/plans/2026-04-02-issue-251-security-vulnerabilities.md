# Security Vulnerability Resolution (Issue #251) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all high and moderate npm security vulnerabilities in the root and backend directories without breaking changes.

**Architecture:** Root vulnerabilities (picomatch, brace-expansion) are resolved via `npm audit fix` since they are dev-only sub-deps of semantic-release. Backend vulnerabilities all trace to `lodash@4.17.23`; rather than downgrading NestJS packages (which would break the app), we add `"lodash": "^4.18.1"` to the existing `overrides` block in `backend/package.json` to force all transitive consumers to the patched version.

**Tech Stack:** npm, NestJS 11, Jest

---

### Task 1: Fix root vulnerabilities

**Files:**
- Modify: `/home/blur/erp2/package-lock.json` (updated by npm)

- [ ] **Step 1: Run `npm audit fix` in root**

```bash
cd /home/blur/erp2
npm audit fix
```

Expected output: something like `fixed 2 of 2 vulnerabilities`

- [ ] **Step 2: Verify root is clean**

```bash
npm audit
```

Expected: `found 0 vulnerabilities`

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add package-lock.json
git commit -m "fix(deps): resolve root picomatch and brace-expansion vulnerabilities"
```

---

### Task 2: Fix backend lodash vulnerability via overrides

**Files:**
- Modify: `backend/package.json` (add lodash to existing overrides block)
- Modify: `backend/package-lock.json` (updated by npm install)

- [ ] **Step 1: Add lodash to the existing overrides block in `backend/package.json`**

Open `backend/package.json`. Find the `"overrides"` block (currently around line 91). Add `"lodash": "^4.18.1"` as a new entry. The block should look like:

```json
"overrides": {
  "glob": "11.1.0",
  "body-parser": "2.2.1",
  "tar": "7.5.4",
  "js-yaml": "4.1.1",
  "qs": "6.14.2",
  "multer": "2.1.1",
  "file-type": "21.3.2",
  "path-to-regexp": "8.4.0",
  "lodash": "^4.18.1",
  "@angular-devkit/core": {
    "ajv": "8.18.0"
  },
  "picomatch": ">=4.0.4"
},
```

- [ ] **Step 2: Run `npm install` to apply the override**

```bash
cd /home/blur/erp2/backend
npm install
```

Expected: installs without errors, `package-lock.json` updated.

- [ ] **Step 3: Verify lodash is now at the patched version**

```bash
cd /home/blur/erp2/backend
npm list lodash
```

Expected: all instances of lodash should show `4.18.1` (not `4.17.23`).

- [ ] **Step 4: Verify backend audit is clean**

```bash
cd /home/blur/erp2/backend
npm audit
```

Expected: `found 0 vulnerabilities`

- [ ] **Step 5: Run backend tests to confirm no breakage**

```bash
cd /home/blur/erp2/backend
npm run test
```

Expected: all tests pass (same pass/fail as before).

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2/backend
git add package.json package-lock.json
git commit -m "fix(deps): pin lodash to ^4.18.1 via overrides to resolve high-severity vulns"
```

---

### Task 3: Final verification and close issue

- [ ] **Step 1: Confirm both directories are clean**

```bash
cd /home/blur/erp2 && npm audit && cd backend && npm audit
```

Expected: two consecutive `found 0 vulnerabilities` outputs.

- [ ] **Step 2: Close issue #251**

```bash
gh issue close 251 --comment "Resolved via npm overrides (lodash ^4.18.1 in backend) and npm audit fix (root). All vulnerabilities cleared."
```
