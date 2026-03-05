# Fix LoginPage Credentials Test Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the failing test `LoginPage > should display default credentials hint` by mocking the async API call and using `waitFor()`.

**Architecture:** The `LoginPage` component fetches `authApi.shouldShowDefaultCredentials()` on mount to determine whether to show credentials. The test has no mock for this, so the credentials box is never rendered. We mock the API to return `true` and wrap assertions in `waitFor()`.

**Tech Stack:** Vitest, @testing-library/react, vi.mock

---

### Task 1: Fix the LoginPage credentials hint test

**Files:**
- Modify: `frontend/src/pages/auth/__tests__/LoginPage.test.tsx`

**Step 1: Read the current test file**

Open `frontend/src/pages/auth/__tests__/LoginPage.test.tsx` and confirm the import list at the top (lines 1-18) and the failing test (lines 142-148).

**Step 2: Add the authApi mock**

After the existing `vi.mock('react-router-dom', ...)` block (after line 18), add:

```ts
vi.mock('../../../services/authApi', () => ({
  authApi: {
    shouldShowDefaultCredentials: vi.fn().mockResolvedValue({
      data: { showDefaultCredentials: true },
    }),
  },
}));
```

**Step 3: Update the failing test to use `waitFor`**

Replace the existing `should display default credentials hint` test (lines 142-148):

```ts
it('should display default credentials hint', async () => {
  renderLoginPage();

  await waitFor(() => {
    expect(screen.getByText(/default admin credentials/i)).toBeInTheDocument();
  });
  expect(screen.getByText(/username:/i)).toBeInTheDocument();
  expect(screen.getByText(/password:/i)).toBeInTheDocument();
});
```

Note: `waitFor` is already imported from `@testing-library/react` on line 2.

**Step 4: Run only this test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/auth/__tests__/LoginPage.test.tsx
```

Expected: `Tests: 8 passed (8)` — all 8 tests in this file pass.

**Step 5: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: 0 new failures introduced.

**Step 6: Commit**

```bash
git add frontend/src/pages/auth/__tests__/LoginPage.test.tsx
git commit -m "fix(test): mock authApi and use waitFor in LoginPage credentials hint test"
```
