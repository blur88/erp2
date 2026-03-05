# Fix LoginPage Test: should display default credentials hint

**Date:** 2026-02-24
**Branch:** fix/settings-backup-restore

## Problem

The test `LoginPage > should display default credentials hint` fails because:

- `LoginPage` fetches `authApi.shouldShowDefaultCredentials()` in a `useEffect` on mount
- If the call resolves `false` (or throws), `showDefaultCredentials` stays `false` and the credentials box is not rendered
- The test has no mock for `authApi`, so the call fails silently and credentials are never shown
- Assertions on `screen.getByText(/default admin credentials/i)` throw `Unable to find an element`

## Solution (Option A)

**Scope:** Test file only — no production code changes.

1. Add `vi.mock('@/services/authApi')` mocking `shouldShowDefaultCredentials` to resolve with `{ data: { showDefaultCredentials: true } }`
2. Wrap assertions in `waitFor()` to handle the async state update from `useEffect`

## Files Changed

- `frontend/src/pages/auth/__tests__/LoginPage.test.tsx`
