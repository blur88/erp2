# Design: GenericDeletedDialog — AppButton + FilterSearch refactor

**Issues:** #383, #384  
**Date:** 2026-04-18  
**PR strategy:** Single combined PR closing both issues

## Summary

Two small, focused refactors to `GenericDeletedDialog.tsx` that improve consistency with the project's design system. No prop interface changes, no new files.

## #383 — Replace TextField with FilterSearch

**File:** `frontend/src/components/common/GenericDeletedDialog.tsx`

Replace the manual `TextField` search box (lines 296–311) with the existing `FilterSearch` component from `@/components/filters/FilterSearch`.

- Wrap `FilterSearch` in `<Box sx={{ flex: 1, minWidth: '300px' }}>` to preserve layout behaviour
- Pass `onCommit={() => {}}` as a no-op (Enter key has no special behaviour in this context)
- Map: `value={searchTerm}`, `placeholder={searchPlaceholder}`, `onChange={setSearchTerm}`
- Remove unused imports: `TextField`, `InputAdornment`, `SearchIcon`

**Benefit:** Users get a Clear (X) button; visual consistency with main-page search boxes; one less manual MUI configuration to maintain.

## #384 — Replace Button with AppButton

**File:** `frontend/src/components/common/GenericDeletedDialog.tsx`

Replace all 8 `<Button>` instances with `<AppButton>` from `@/components/common/AppButton`. Collapse the manual `startIcon={isLoading ? <CircularProgress/> : <Icon/>}` pattern to `startIcon={<Icon/>} loading={...}` — `AppButton` handles the spinner swap internally.

### Variant mapping

| Location | Variant | Loading prop |
|---|---|---|
| Bulk Restore (toolbar) | `success` | `loading={bulkRestoring}` |
| Bulk Delete (toolbar) | `danger` | `loading={bulkDeleting}` |
| Main dialog Close | `outlined` | — |
| Confirm-delete Cancel | `outlined` | — |
| Confirm-delete Submit | `danger` | `loading={deletingId === confirmDelete?.id}` |
| Bulk-restore Cancel | `outlined` | — |
| Bulk-restore Submit | `success` | `loading={bulkRestoring}` |
| Bulk-delete Cancel | `outlined` | — |
| Bulk-delete Submit | `danger` | `loading={bulkDeleting}` |

- Remove `Button` and `CircularProgress` from MUI imports
- Add `import { AppButton } from '@/components/common/AppButton'`

**Benefit:** Unified button styling; loading states handled automatically; one fewer manual spinner pattern.

## Testing

Run `npx vitest run src/components/common/GenericDeletedDialog.test.tsx` after changes. Rendered DOM is semantically identical so no test changes are expected.

## Out of scope

- Row-level `IconButton` actions (Restore/Delete per row) — these are icon-only buttons and remain as-is
- Any other dialog or page component
