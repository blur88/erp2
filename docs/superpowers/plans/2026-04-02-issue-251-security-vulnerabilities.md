# Security Vulnerability Resolution (Issue #251) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all actionable npm security vulnerabilities in the root and backend directories without breaking changes.

**Architecture:** Root vulnerabilities (picomatch, brace-expansion) are bundled inside `npm@11.12.1`, which is pulled by `@semantic-release/npm@13.1.5`. Because they are bundled deps, `npm audit fix` and `overrides` cannot reach them — and `npm@11.12.1` is already the latest published version. These vulns are dev/CI-only (`npm audit --omit=dev` returns 0) and cannot be fixed until npm publishes a new release with patched bundled deps. They are documented but deferred. Backend vulnerabilities all trace to `lodash@4.17.23`; rather than downgrading NestJS packages (which would break the app), we add `"lodash": "^4.18.1"` to the existing `overrides` block in `backend/package.json` to force all transitive consumers to the patched version.

**Tech Stack:** npm, NestJS 11, Jest

---

### Task 1: Document root vulnerability blocker

**Context:** `picomatch` and `brace-expansion` are bundled inside `npm@11.12.1`
(`node_modules/npm/node_modules/`). npm `overrides` cannot reach inside another package's bundled
dependency tree. `npm@11.12.1` is the latest published version. These are dev/CI-only deps —
`npm audit --omit=dev` returns 0 vulnerabilities. No fix is possible until npm publishes `11.12.2+`
with patched bundled deps.

**Files:**
- Modify: `docs/superpowers/specs/2026-04-02-issue-251-security-vulnerabilities-design.md`

- [ ] **Step 1: Update the spec to document the root blocker**

In `docs/superpowers/specs/2026-04-02-issue-251-security-vulnerabilities-design.md`, replace the Root section under `## Approach`:

```markdown
### Root: Deferred (upstream blocker)

`picomatch` and `brace-expansion` are bundled inside `npm@11.12.1`, which is pulled by
`@semantic-release/npm@13.1.5`. Bundled dependencies cannot be overridden from outside the
package — npm `overrides` in `package.json` only affect the top-level dependency resolution
tree, not the private bundled tree inside `node_modules/npm/node_modules/`.

`npm@11.12.1` is the latest published version as of 2026-04-02. No fix is available until npm
publishes a new release with patched versions of `brace-expansion` (needs >=5.0.5) and
`picomatch` (needs >=4.0.4) in its bundled tree.

**Impact:** Dev/CI-only. `npm audit --omit=dev` returns 0 vulnerabilities. These packages are
only executed during the `semantic-release` publish step in CI — not in production, not in
the Docker image. Risk is low and limited to CI environment.

**Action:** Monitor npm releases. When `npm` ships a version with patched bundled deps,
`@semantic-release/npm` will pick it up automatically on the next `npm install`.
```

- [ ] **Step 2: Commit the spec update**

```bash
cd /home/blur/erp2
git add docs/superpowers/specs/2026-04-02-issue-251-security-vulnerabilities-design.md
git commit -m "docs: document root vulnerability blocker — bundled in npm@11.12.1, no fix available"
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

Expected: all instances of lodash show `4.18.1` (not `4.17.23`).

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

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2/backend
git add package.json package-lock.json
git commit -m "fix(deps): pin lodash to ^4.18.1 via overrides to resolve high-severity vulns"
```

---

### Task 3: Final verification and close issue

- [ ] **Step 1: Confirm backend is clean**

```bash
cd /home/blur/erp2/backend && npm audit
```

Expected: `found 0 vulnerabilities`

- [ ] **Step 2: Confirm root production deps are clean**

```bash
cd /home/blur/erp2 && npm audit --omit=dev
```

Expected: `found 0 vulnerabilities`

- [ ] **Step 3: Close issue #251 with explanation**

```bash
gh issue close 251 --comment "Backend: resolved via \`overrides: { lodash: '^4.18.1' }\` in backend/package.json — all 3 high-severity backend vulns cleared.

Root: picomatch and brace-expansion are bundled inside npm@11.12.1 (pulled by @semantic-release/npm@13.1.5). These cannot be fixed via overrides or audit fix — bundled deps are private to the package. npm@11.12.1 is the latest published version. These are dev/CI-only (npm audit --omit=dev returns 0). Will resolve automatically when npm ships a patched release."
```
