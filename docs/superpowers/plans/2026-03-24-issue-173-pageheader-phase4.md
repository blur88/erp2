# PageHeader Phase 4: Adoption Completion & Enforcement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PageHeader adoption across 4 remaining standard pages, add an ESLint rule blocking the legacy header pattern, and update docs/ui.md with a new-page checklist.

**Architecture:** Four pages still use the legacy `TYPOGRAPHY_STYLES.pageHeader` Typography pattern instead of `<PageHeader>`. Three are form-shell pages (Tier 1, zero-compromise migrations). One is a list page (Tier 2) that requires moving bulk-action buttons from the header into an inline selection-context bar. After all migrations, an ESLint `no-restricted-syntax` rule is added so any future use of `TYPOGRAPHY_STYLES.pageHeader` is caught at lint time.

**Tech Stack:** React 19, MUI v7, Vitest, ESLint flat config (`eslint.config.js`)

**Spec:** `docs/superpowers/specs/2026-03-24-issue-173-pageheader-phase4-design.md`

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx` | Modify | Replace legacy header block (lines 344–352) with `<PageHeader>` |
| `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx` | Modify | Add header render test |
| `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` | Modify | Replace legacy header block (lines 283–291) with `<PageHeader>` |
| `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx` | Modify | Add header render test |
| `frontend/src/pages/accounting/JournalEntryFormPage.tsx` | Modify | Replace legacy header block (lines 359–367) with `<PageHeader>` |
| `frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx` | Modify | Add header render test |
| `frontend/src/pages/accounting/ExpensesPage.tsx` | Modify | Replace legacy header block with `<PageHeader>`, move refresh + bulk actions below header |
| `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx` | Modify | Update title test, add subtitle test, add bulk-action placement test |
| `frontend/eslint.config.js` | Modify | Add `no-restricted-syntax` rule with two selectors |

---

## Task 1: Migrate CreatePurchaseOrderPage (Tier 1)

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx:344-352`
- Modify: `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx`

The existing header block is a `Box` containing an `IconButton` (back-arrow) and a `Typography` title. Replace the `Typography` with `<PageHeader>`. Keep the `IconButton` as a sibling above `PageHeader`.

- [ ] **Step 1: Write the failing tests**

Open `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx`. The existing tests render inline (`render(<BrowserRouter><CreatePurchaseOrderPage /></BrowserRouter>)`) and use `mockParams.mockReturnValue({})` (a `vi.fn`) to control route params. `beforeEach` already calls `mockParams.mockReturnValue({})` — no id, so create mode.

Add these two tests inside the existing `describe('CreatePurchaseOrderPage', ...)` block, near the top:

```tsx
it('renders PageHeader with title "Create Purchase Order" in create mode', () => {
  // beforeEach sets mockParams.mockReturnValue({}) — create mode
  render(
    <BrowserRouter>
      <CreatePurchaseOrderPage />
    </BrowserRouter>
  )
  expect(screen.getByRole('heading', { name: 'Create Purchase Order' })).toBeInTheDocument()
})

it('renders PageHeader with title "Edit Purchase Order" in edit mode', async () => {
  mockParams.mockReturnValue({ id: 'po-test-id' })
  render(
    <BrowserRouter>
      <CreatePurchaseOrderPage />
    </BrowserRouter>
  )
  expect(await screen.findByRole('heading', { name: 'Edit Purchase Order' })).toBeInTheDocument()
})
```

> **Note on `getByRole('heading')`:** `PageHeader` renders the title as `Typography variant="h5"` (an `<h5>`). The legacy header used `TYPOGRAPHY_STYLES.pageHeader.variant` = `'h4'` (an `<h4>`). Both have the heading role, so `getByRole('heading', { name: '...' })` passes both before and after migration for Tasks 1–3. These tests are correctness assertions, not red-green gates — they verify the title text is present as a heading and will still catch regressions if the title text changes or `PageHeader` is removed.

- [ ] **Step 2: Run tests to verify they run cleanly**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx --no-coverage
```

Expected: new tests PASS (both the legacy `Typography variant="h4"` and `PageHeader`'s `Typography variant="h5"` render heading elements, so `getByRole('heading')` matches both — these tests are correctness assertions, not red-green gates). All existing tests continue to pass.

- [ ] **Step 3: Implement the migration**

In `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`:

1. Add the import (after existing imports):
```tsx
import PageHeader from '@/components/common/PageHeader'
```

2. Replace lines 344–352 (the `{/* Header */}` block containing the legacy `Typography`):

**Remove:**
```tsx
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton onClick={() => navigate('/purchasing/orders')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}>
            {isEditMode ? 'Edit Purchase Order' : 'Create Purchase Order'}
          </Typography>
        </Box>
```

**Replace with:**
```tsx
        {/* Header */}
        <IconButton onClick={() => navigate('/purchasing/orders')} sx={{ mb: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <PageHeader
          title={isEditMode ? 'Edit Purchase Order' : 'Create Purchase Order'}
          showDivider={false}
        />
```

3. Remove the `TYPOGRAPHY_STYLES` import line if `TYPOGRAPHY_STYLES` is no longer referenced anywhere else in the file. Search the file for `TYPOGRAPHY_STYLES` — if it only appeared in the header block, remove the import. Also remove `Typography` from MUI imports if it is now unused.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx --no-coverage
```

Expected: all tests PASS including the new ones.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "createpurchaseorder\|error" | head -20
```

Expected: no errors in `CreatePurchaseOrderPage.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx \
        frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx
git commit -m "feat(ui): migrate CreatePurchaseOrderPage to PageHeader (Phase 4 Tier 1)"
```

---

## Task 2: Migrate CreateStockAdjustmentPage (Tier 1)

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx:283-291`
- Modify: `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`

Same pattern as Task 1.

- [ ] **Step 1: Write the failing test**

Open `frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx`. The file has two `describe` blocks. `mockParams` is a `vi.fn(() => ({}))` and `beforeEach` calls `mockParams.mockReturnValue({})`. There is no `renderPage()` helper — render inline.

Add this test inside the first `describe` block (`CreateStockAdjustmentPage product search`), near the top:

```tsx
it('renders PageHeader with title "Create Stock Adjustment" in create mode', () => {
  // beforeEach sets mockParams.mockReturnValue({}) — create mode
  render(
    <BrowserRouter>
      <CreateStockAdjustmentPage />
    </BrowserRouter>
  )
  expect(screen.getByRole('heading', { name: 'Create Stock Adjustment' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it runs cleanly**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx --no-coverage
```

Expected: new test PASSES (same reason as Task 1 — heading role matched by both h4 and h5). All existing tests continue to pass.

- [ ] **Step 3: Implement the migration**

In `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`:

1. Add import:
```tsx
import PageHeader from '@/components/common/PageHeader'
```

2. Replace lines 283–291 (the `{/* Header */}` block):

**Remove:**
```tsx
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton onClick={() => navigate('/inventory/stock-adjustments')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}>
            {isEditMode ? 'Edit Stock Adjustment' : 'Create Stock Adjustment'}
          </Typography>
        </Box>
```

**Replace with:**
```tsx
        {/* Header */}
        <IconButton onClick={() => navigate('/inventory/stock-adjustments')} sx={{ mb: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <PageHeader
          title={isEditMode ? 'Edit Stock Adjustment' : 'Create Stock Adjustment'}
          showDivider={false}
        />
```

3. Remove `TYPOGRAPHY_STYLES` import if unused. Remove `Typography` from MUI imports if unused.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "createstockadjustment\|error" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx \
        frontend/src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
git commit -m "feat(ui): migrate CreateStockAdjustmentPage to PageHeader (Phase 4 Tier 1)"
```

---

## Task 3: Migrate JournalEntryFormPage (Tier 1)

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx:359-367`
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Open `frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx`. The existing test `'renders create form with header and fields'` (line 107) uses `screen.getByText` but not `getByRole('heading')`. Add these two new tests inside the existing `describe` block:

```tsx
it('renders PageHeader with title "New Journal Entry" in create mode', () => {
  // mockParams.id is undefined from beforeEach
  renderWithProviders()
  expect(screen.getByRole('heading', { name: 'New Journal Entry' })).toBeInTheDocument()
})

it('renders PageHeader with title "Edit Journal Entry" in edit mode', async () => {
  mockParams.id = 'test-id'
  renderWithProviders()
  expect(await screen.findByRole('heading', { name: 'Edit Journal Entry' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they run cleanly**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx --no-coverage
```

Expected: new tests PASS (same reason as Tasks 1–2 — heading role matched by both h4 and h5). All existing tests continue to pass.

- [ ] **Step 3: Implement the migration**

In `frontend/src/pages/accounting/JournalEntryFormPage.tsx`:

1. Add import:
```tsx
import PageHeader from '@/components/common/PageHeader'
```

2. Replace lines 359–367 (the `{/* Header */}` block):

**Remove:**
```tsx
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}>
          {isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}
        </Typography>
      </Box>
```

**Replace with:**
```tsx
      {/* Header */}
      <IconButton onClick={handleBack} sx={{ mb: 1 }}>
        <ArrowBackIcon />
      </IconButton>
      <PageHeader
        title={isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}
        showDivider={false}
      />
```

3. Remove `TYPOGRAPHY_STYLES` import if unused. Remove `Typography` from MUI imports if unused. Also remove `Box` from MUI imports if it is no longer used anywhere else in the file — scan the file for remaining `Box` usages before removing.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx --no-coverage
```

Expected: all tests PASS including the two new ones.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "journalentryform\|error" | head -20
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntryFormPage.tsx \
        frontend/src/pages/accounting/__tests__/JournalEntryFormPage.test.tsx
git commit -m "feat(ui): migrate JournalEntryFormPage to PageHeader (Phase 4 Tier 1)"
```

---

## Task 4: Migrate ExpensesPage (Tier 2)

**Files:**
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx:272-304`
- Modify: `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`

This is a Tier 2 migration. The page header currently contains the title, subtitle, refresh icon, "New Expense" button, and conditional bulk-action buttons. After migration:
- `PageHeader` gets the title, subtitle, and "New Expense" primary action
- Refresh `IconButton` moves to the right side of the filter `Paper` block (line 313)
- Bulk-action buttons move to a conditional `Box` between the filter block and the table

**Stop condition:** If at any point this requires building a new shared component or adding exceptions to `PageHeader`, stop and revert all changes to this file. Leave ExpensesPage in its current state and add a note in the commit.

- [ ] **Step 1: Write the failing test**

Open `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`. The existing `'renders the page title'` test uses `getByText('Expenses')` — this passes before and after migration.

The legacy header uses `TYPOGRAPHY_STYLES.pageHeader.variant` = `'h4'` (an `<h4>` element). `PageHeader` renders `Typography variant="h5"` (an `<h5>` element). Use `getByRole('heading', { level: 5 })` as the red-green test — it will fail before migration (no `<h5>` heading exists yet) and pass after (`PageHeader` renders `<h5>`).

```tsx
it('renders Expenses title via PageHeader (h5 heading)', () => {
  renderPage()
  // PageHeader renders Typography variant="h5" — the legacy header used h4
  // This assertion will fail until PageHeader is in place
  expect(screen.getByRole('heading', { level: 5, name: 'Expenses' })).toBeInTheDocument()
})
```

Also add a test that documents the correct post-migration behavior of bulk actions (this test passes before AND after migration — it documents the intended state):

```tsx
it('bulk action buttons are hidden when no rows are selected', () => {
  renderPage()
  expect(screen.queryByText(/Bulk Post/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/Bulk Delete/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify the heading test fails**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ExpensesPage.test.tsx --no-coverage
```

Expected: `'renders Expenses title via PageHeader (h5 heading)'` FAILS — the legacy `Typography variant="h4"` renders an `<h4>`, not an `<h5>`, so `getByRole('heading', { level: 5 })` finds nothing. The bulk-action test PASSES — that's expected.

- [ ] **Step 3: Implement the migration**

In `frontend/src/pages/accounting/ExpensesPage.tsx`, make the following changes:

**A. Add PageHeader import:**
```tsx
import PageHeader from '@/components/common/PageHeader'
```

**B. Replace lines 272–304 (the full header `Box`):**

**Remove:**
```tsx
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography
            variant={TYPOGRAPHY_STYLES.pageHeader.variant}
            sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <ExpenseIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
            Expenses
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Record and manage business expense transactions
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {selectedIds.size > 0 && (
            <>
              <Button variant="contained" startIcon={<PostIcon />} onClick={onBulkPost}>
                Bulk Post ({selectedIds.size})
              </Button>
              <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={onBulkDelete}>
                Bulk Delete ({selectedIds.size})
              </Button>
            </>
          )}
          <IconButton onClick={() => refetch()}>
            <RefreshIcon />
          </IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New Expense
          </Button>
        </Stack>
      </Box>
```

**Replace with:**
```tsx
      <PageHeader
        title="Expenses"
        subtitle="Record and manage business expense transactions"
        primaryAction={{ label: 'New Expense', onClick: openCreate }}
      />
```

**C. Update the filter `Paper` block (lines 313–358) to add refresh icon on the right:**

The filter block is a `<Paper sx={{ p: 2, mb: 2 }}>` containing a single `<Stack>` with all the filter fields. Replace just the opening `<Paper>` tag and the opening `<Stack>` tag, and replace the closing `</Stack></Paper>` at lines 357–358 — leaving all filter fields unchanged in between.

**Remove lines 313–314:**
```tsx
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
```

**Replace with:**
```tsx
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flex: 1, flexWrap: 'wrap' }}>
```

**Remove lines 357–358:**
```tsx
        </Stack>
      </Paper>
```

**Replace with:**
```tsx
          </Stack>
          <IconButton onClick={() => refetch()} size="small" sx={{ mt: 0.5 }}>
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Paper>
```

All filter field elements between lines 315 and 356 remain completely unchanged.

**D. Add a selection-context bar between the filter `Paper` and the table `Paper`:**

After the closing `</Paper>` of the filter block and before `<Paper>` that wraps the table, add:

```tsx
      {selectedIds.size > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, bgcolor: 'action.selected', borderRadius: 1 }}>
          <Button variant="contained" size="small" startIcon={<PostIcon />} onClick={onBulkPost}>
            Bulk Post ({selectedIds.size})
          </Button>
          <Button variant="outlined" size="small" color="error" startIcon={<DeleteIcon />} onClick={onBulkDelete}>
            Bulk Delete ({selectedIds.size})
          </Button>
        </Box>
      )}
```

**E. Remove unused imports:**
- Remove `TYPOGRAPHY_STYLES` import
- Remove `ExpenseIcon` import (the icon was only used in the header title — verify it is not used elsewhere in the file before removing)
- Remove `Typography` from MUI imports if unused elsewhere
- Keep `Stack`, `Box`, `IconButton`, `RefreshIcon`, `AddIcon`, `PostIcon`, `DeleteIcon` — they are all still used

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ExpensesPage.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "expensespage\|error" | head -20
```

- [ ] **Step 6: Visual check** (if running locally)

Start the frontend dev server and navigate to the Expenses page. Verify:
- Header shows "Expenses" title and subtitle
- No bulk-action buttons visible initially
- Refresh icon appears in the filter bar (right side)
- Selecting rows causes the selection-context bar to appear between filters and table
- "New Expense" button works

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/accounting/ExpensesPage.tsx \
        frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx
git commit -m "feat(ui): migrate ExpensesPage to PageHeader; move bulk actions to selection-context bar (Phase 4 Tier 2)"
```

---

## Task 5: Add ESLint enforcement rule

**Files:**
- Modify: `frontend/eslint.config.js`

This rule is added now that all migrations are complete. It flags any future use of `TYPOGRAPHY_STYLES.pageHeader`.

- [ ] **Step 1: Verify zero existing violations**

```bash
cd frontend && npx eslint src --rule '{"no-restricted-syntax": ["error", {"selector": "MemberExpression[object.name='\''TYPOGRAPHY_STYLES'\''][property.name='\''pageHeader'\'']", "message": "test"}]}' 2>&1 | grep -c "error\|warning" || echo "0 violations"
```

Expected: `0 violations` (or 0 errors listed). If violations exist, stop — one of the migrations above is incomplete. Fix before proceeding.

- [ ] **Step 2: Add the rule**

Open `frontend/eslint.config.js`. In the config block that already contains `'react-hooks/exhaustive-deps': 'off'` (the block starting at line 22), add the new rule to the `rules` object:

```js
      // PageHeader enforcement — prevent regression to legacy TYPOGRAPHY_STYLES.pageHeader pattern
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='TYPOGRAPHY_STYLES'][property.name='pageHeader']",
          message: 'Use the <PageHeader> component instead of TYPOGRAPHY_STYLES.pageHeader. See docs/ui.md for usage rules and exception categories.',
        },
        {
          selector: "VariableDeclarator[init.name='TYPOGRAPHY_STYLES'] > ObjectPattern > Property[key.name='pageHeader']",
          message: 'Do not destructure TYPOGRAPHY_STYLES.pageHeader. Use <PageHeader> instead. See docs/ui.md.',
        },
      ],
```

- [ ] **Step 3: Run lint to confirm zero violations**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

Expected: lint passes with 0 errors. If any `no-restricted-syntax` errors appear, one of the Tier 1/2 migrations has a missed cleanup — fix the source file and re-run.

- [ ] **Step 4: Commit**

```bash
git add frontend/eslint.config.js
git commit -m "chore(lint): add no-restricted-syntax rule to block TYPOGRAPHY_STYLES.pageHeader (Phase 4 governance)"
```

---

## Task 6: Update docs/ui.md

**Files:**
- Modify: `docs/ui.md`

Two additions: a New Page Checklist section and an updated Deferred Pages reference.

- [ ] **Step 1: Add New Page Checklist**

Open `docs/ui.md`. After the `### Do / Don't` section (ends around line 73) and before the `---` separator, add:

```markdown
### New Page Checklist

- Is this a standard CRUD, list, or form page? → Use `PageHeader`
- Does the page have at most 2 header actions? If not, move extras to a toolbar below
- Subtitle: stable, operational, non-dynamic — or omit it entirely
- Do not use `TYPOGRAPHY_STYLES.pageHeader` — it is lint-blocked
- If the page does not fit `PageHeader` without introducing exceptions, classify it as Deferred/Exception — do not customize the component
```

- [ ] **Step 2: Update Deferred Pages spec reference**

In `docs/ui.md`, find the line in the Deferred Pages section that references the Phase 3 spec:

```
See `docs/superpowers/specs/2026-03-24-page-header-phase3-design.md` for the full classification table.
```

Replace it with:

```
See `docs/superpowers/specs/2026-03-24-issue-173-pageheader-phase4-design.md` for the full classification table.
```

- [ ] **Step 3: Verify docs/ui.md renders correctly**

Read through the file and confirm:
- No broken markdown (no unclosed code blocks, no mismatched headers)
- The checklist appears in the PageHeader section, after Do/Don't, before the `---` separator
- The Deferred Pages section still makes sense with the updated spec reference

- [ ] **Step 4: Commit**

```bash
git add docs/ui.md
git commit -m "docs(ui): add new page checklist and update Phase 4 spec reference (Phase 4 governance)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run full lint**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
```

Expected: no errors.

- [ ] **Step 4: Confirm no TYPOGRAPHY_STYLES.pageHeader remains in migrated files**

```bash
grep -rn "TYPOGRAPHY_STYLES.pageHeader" frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx \
  frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx \
  frontend/src/pages/accounting/JournalEntryFormPage.tsx \
  frontend/src/pages/accounting/ExpensesPage.tsx 2>/dev/null
```

Expected: no output (zero matches).

- [ ] **Step 5: Confirm deferred pages are untouched**

```bash
grep -rn "TYPOGRAPHY_STYLES.pageHeader" \
  frontend/src/pages/accounting/JournalEntriesPage.tsx \
  frontend/src/pages/accounting/BankReconciliationsPage.tsx \
  frontend/src/pages/purchasing/PurchasingPage.tsx 2>/dev/null | wc -l
```

Expected: 3 or more lines (deferred pages still use the old pattern — they are intentionally unchanged).
