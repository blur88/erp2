# Spec: Update jsdom to 29.1.1

Update the `jsdom` development dependency in the `frontend` module from `29.1.0` to `29.1.1` to stay current. This task includes creating a tracking GitHub issue.

## 1. Requirements

- **Target Package:** `jsdom`
- **Target Version:** `29.1.1`
- **Location:** `frontend/package.json`
- **Goal:** Stay current with the latest patch release.
- **Tracking:** Create a GitHub issue before implementation.

## 2. Approach: Issue-First Workflow

1.  **Issue Creation:** Use GitHub CLI (`gh`) to create a chore issue.
2.  **Implementation:**
    - Update `frontend/package.json`.
    - Run `npm install` in the `frontend` directory to update `package-lock.json`.
3.  **Validation:**
    - Run `npm run test` in the `frontend` directory to ensure no regressions in the testing environment.

## 3. Design Details

### GitHub Issue
- **Title:** `chore(deps): update jsdom to 29.1.1`
- **Body:**
    ```markdown
    Update the `jsdom` development dependency in the `frontend` module to ensure the project stays current with the latest patch releases.

    **Rationale:**
    Maintenance update. `jsdom` is currently at version `29.1.0`. Moving to `29.1.1` maintains environment parity with the latest upstream fixes.

    **Impact:**
    - **Module:** `frontend`
    - **Scope:** Unit testing environment (Vitest/Testing Library).

    **Proposed Checklist:**
    - [ ] Update `jsdom` in `frontend/package.json` to `29.1.1`.
    - [ ] Regenerate `frontend/package-lock.json` via `npm install`.
    - [ ] Verify changes by running the frontend test suite: `cd frontend && npm run test`.
    ```

## 4. Verification Plan

| Step | Command | Expected Result |
| :--- | :--- | :--- |
| Create Issue | `gh issue create ...` | Issue created and URL returned. |
| Update Dep | `npm install jsdom@29.1.1 --save-dev` | `package.json` and `package-lock.json` updated. |
| Test | `npm run test` | All frontend tests pass. |
