# Toolbar UI Consistency Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every filter-area element in PurchaseOrdersToolbar, OrdersToolbar, and InvoicesToolbar exactly 40px tall by applying consistent `sx` overrides referencing `TYPOGRAPHY_STYLES.searchField.input`.

**Architecture:** Pure CSS/sx override fix across 3 React component files. No new constants, no new files, no tests. The existing `TYPOGRAPHY_STYLES.searchField.input` constant (`height: '40px'`, `fontSize: '0.875rem'`, `padding: '8.5px 14px'`) is the single source of truth — we just need all toolbar elements to reference it consistently.

**Tech Stack:** React 19, Material UI v7, TypeScript. Constant lives in `frontend/src/constants/typography.ts`.

**Spec:** `docs/superpowers/specs/2026-03-11-purchase-orders-toolbar-ui-fix-design.md`

---

## Chunk 1: All Three File Fixes

### Files

- Modify: `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx`
- Modify: `frontend/src/pages/sales/components/OrdersToolbar.tsx`
- Modify: `frontend/src/pages/sales/components/InvoicesToolbar.tsx`
- No changes: `frontend/src/pages/inventory/components/ProductsToolbar.tsx` (already correct)
- No changes: `frontend/src/constants/typography.ts` (constant already defined)

---

### Task 1: Fix PurchaseOrdersToolbar

**File:** `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx`

All 7 filter-area elements are missing height overrides. `TYPOGRAPHY_STYLES` is already imported on line 25.

- [ ] **Step 1: Apply sx overrides to the Search TextField**

Find the TextField starting at line 79. Replace:
```tsx
          <TextField
            inputRef={searchInputRef}
            placeholder="Search orders..."
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value })}
            size="medium"
            sx={{ minWidth: isMobile ? 'auto' : 250, flex: isMobile ? 'none' : 1, maxWidth: isMobile ? 'none' : 400 }}
            InputProps={{
```
With:
```tsx
          <TextField
            inputRef={searchInputRef}
            placeholder="Search orders..."
            value={filters.search}
            onChange={(event) => onFilterChange({ search: event.target.value })}
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& input': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              },
            }}
            InputProps={{
```

- [ ] **Step 2: Apply sx override to the Date Filter FormControl**

Find `<FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }}>` (the first one, wrapping Date Filter Select, around line 95). Replace its `sx` prop:
```tsx
          <FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120, '& .MuiOutlinedInput-root': { height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize } }}>
```

- [ ] **Step 3: Apply sx overrides to the From Date and To Date TextFields**

Find the two date TextFields inside the `{filters.dateFilter === 'custom' && ...}` block (around lines 111–113). Replace:
```tsx
              <TextField label="From Date" type="date" value={filters.customFromDate} onChange={(event) => onFilterChange({ customFromDate: event.target.value })} size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }} InputLabelProps={{ shrink: true }} />
              <TextField label="To Date" type="date" value={filters.customToDate} onChange={(event) => onFilterChange({ customToDate: event.target.value })} size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }} InputLabelProps={{ shrink: true }} />
```
With:
```tsx
              <TextField
                label="From Date"
                type="date"
                value={filters.customFromDate}
                onChange={(event) => onFilterChange({ customFromDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: isMobile ? 'auto' : 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="To Date"
                type="date"
                value={filters.customToDate}
                onChange={(event) => onFilterChange({ customToDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: isMobile ? 'auto' : 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
```

- [ ] **Step 4: Apply sx override to the Supplier FormControl**

Find the second `<FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }}>` (wrapping Supplier Select, around line 116). Replace its `sx` prop the same way as Step 2:
```tsx
          <FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120, '& .MuiOutlinedInput-root': { height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize } }}>
```

- [ ] **Step 5: Add sx to the Clear Filters Button**

Find the Clear Filters Button (around line 129):
```tsx
            <Button variant="outlined" size="medium" onClick={onClearFilters}>
              Clear Filters
            </Button>
```
Replace with:
```tsx
            <Button variant="outlined" size="medium" onClick={onClearFilters} sx={{ height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>
              Clear Filters
            </Button>
```

- [ ] **Step 6: Add sx to the Sort Button**

Find the Sort Button (around line 134). It currently has no `sx`. Add:
```tsx
          <Button
            variant={filters.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={filters.sortBy === 'orderNumber' ? filters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon /> : <SortIcon />}
            onClick={() => onSort('orderNumber')}
            sx={{ height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}
          >
            Sort
          </Button>
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx
git commit -m "fix(purchasing): standardise toolbar element heights to 40px (#76)"
```

---

### Task 2: Fix OrdersToolbar

**File:** `frontend/src/pages/sales/components/OrdersToolbar.tsx`

9 elements need fixing: Search TextField (hardcoded values), Date Filter / Customer / Payment Status / Fulfillment FormControls (no height), From/To Date TextFields (no height), Clear Filters Button (no sx), Sort Button (no sx).

- [ ] **Step 1: Fix the Search TextField**

Find the TextField around line 158. Replace the `sx` block:
```tsx
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: '0.875rem',
                '& input': {
                  padding: '8.5px 14px',
                  fontSize: '0.875rem',
                },
              },
            }}
```
With:
```tsx
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& input': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              },
            }}
```

- [ ] **Step 2: Fix the Date Filter FormControl**

Find `<FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120 }}>` around line 188 (wrapping Date Filter Select). Replace `sx`:
```tsx
          <FormControl size="medium" sx={{ minWidth: isMobile ? 'auto' : 120, '& .MuiOutlinedInput-root': { height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize } }}>
```

- [ ] **Step 3: Fix the From Date and To Date TextFields**

Find the two date TextFields inside `{orderFilters.dateFilter === 'custom' && ...}` (around lines 208–226). They currently have `sx={{ minWidth: 120 }}`. Replace each:
```tsx
              <TextField
                label="From Date"
                type="date"
                value={orderFilters.customFromDate}
                onChange={(event) => onFilterChange({ customFromDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="To Date"
                type="date"
                value={orderFilters.customToDate}
                onChange={(event) => onFilterChange({ customToDate: event.target.value })}
                size="medium"
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
```

- [ ] **Step 4: Fix the Customer, Payment Status, and Fulfillment FormControls**

Find the three FormControls around lines 229–271 (Customer, Payment Status, Fulfillment). Each currently has `sx={{ minWidth: isMobile ? 'auto' : 120 }}`. Add the height override to each:
```tsx
sx={{ minWidth: isMobile ? 'auto' : 120, '& .MuiOutlinedInput-root': { height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize } }}
```

- [ ] **Step 5: Add sx to the Clear Filters Button**

Find the Clear Filters Button around line 274:
```tsx
            <Button variant="outlined" size="medium" onClick={onClearFilters}>
              Clear Filters
            </Button>
```
Replace with:
```tsx
            <Button variant="outlined" size="medium" onClick={onClearFilters} sx={{ height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>
              Clear Filters
            </Button>
```

- [ ] **Step 6: Add sx to the Sort Button**

Find the Sort Button around line 279. It currently has no `sx`. Add:
```tsx
          <Button
            variant={orderFilters.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={
              orderFilters.sortBy === 'orderNumber' ? (
                orderFilters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />
              ) : (
                <SortIcon />
              )
            }
            onClick={() => onSort('orderNumber')}
            sx={{ height: TYPOGRAPHY_STYLES.searchField.input.height, fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}
          >
            Sort
          </Button>
```

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/sales/components/OrdersToolbar.tsx
git commit -m "fix(sales): standardise orders toolbar element heights to 40px (#76)"
```

---

### Task 3: Fix InvoicesToolbar

**File:** `frontend/src/pages/sales/components/InvoicesToolbar.tsx`

6 elements need updating: mostly replacing hardcoded `'0.875rem'` / `'8.5px 14px'` strings with `TYPOGRAPHY_STYLES.searchField.input.*` constants. The Date Filter Select also has a `MenuProps` font override that must be kept but updated to use the constant.

- [ ] **Step 1: Fix the Search TextField**

Find the TextField around line 129. Replace the `sx` block:
```tsx
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: '0.875rem',
                '& input': {
                  padding: '8.5px 14px',
                  fontSize: '0.875rem',
                },
              },
            }}
```
With:
```tsx
            sx={{
              minWidth: isMobile ? 'auto' : 250,
              flex: isMobile ? 'none' : 1,
              maxWidth: isMobile ? 'none' : 400,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& input': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              },
            }}
```

- [ ] **Step 2: Fix the Date Filter FormControl and its Select**

Find the Date Filter FormControl around line 157. It currently has:
```tsx
          <FormControl
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 120,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: '0.875rem',
              },
            }}
          >
```
Replace its `sx.fontSize` with the constant:
```tsx
          <FormControl
            size="medium"
            sx={{
              minWidth: isMobile ? 'auto' : 120,
              '& .MuiOutlinedInput-root': {
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              },
            }}
          >
```

Then find the `Select` inside this FormControl (around line 168). It has a `sx` prop with hardcoded values and a `MenuProps` with a hardcoded font size. Replace:
```tsx
              sx={{
                fontSize: '0.875rem',
                '& .MuiSelect-select': {
                  padding: '8.5px 14px',
                  fontSize: '0.875rem',
                },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    '& .MuiMenuItem-root': {
                      fontSize: '0.875rem',
                    },
                  },
                },
              }}
```
With:
```tsx
              sx={{
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                '& .MuiSelect-select': {
                  padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    '& .MuiMenuItem-root': {
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                },
              }}
```

- [ ] **Step 3: Fix the From Date and To Date TextFields**

Find the two date TextFields inside `{filters.dateFilter === 'custom' && ...}` (around lines 202–232). Each has a `sx` with height (constant) and hardcoded `fontSize`, but is missing the `'& input': { padding }` sub-rule.

Replace the From Date TextField `sx` + `InputLabelProps` block:
```tsx
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: '0.875rem',
                  },
                }}
                InputLabelProps={{ shrink: true }}
```
With:
```tsx
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
```

Replace the To Date TextField `sx` + `InputLabelProps` block (same pattern):
```tsx
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: '0.875rem',
                  },
                }}
                InputLabelProps={{ shrink: true }}
```
With:
```tsx
                sx={{
                  minWidth: 120,
                  '& .MuiOutlinedInput-root': {
                    height: TYPOGRAPHY_STYLES.searchField.input.height,
                    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    '& input': {
                      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                    },
                  },
                }}
                InputLabelProps={{ shrink: true }}
```

- [ ] **Step 4: Fix the Clear Filters Button**

Find the Clear Filters Button around line 235. It currently has:
```tsx
              sx={{
                minWidth: 'auto',
                px: 2,
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: '0.875rem',
              }}
```
Replace `fontSize`:
```tsx
              sx={{
                minWidth: 'auto',
                px: 2,
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              }}
```

- [ ] **Step 5: Fix the Sort Button**

Find the Sort Button around line 251. It currently has:
```tsx
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
              minWidth: 'auto',
              px: 2,
            }}
```
Replace `fontSize`:
```tsx
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              minWidth: 'auto',
              px: 2,
            }}
```

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/components/InvoicesToolbar.tsx
git commit -m "fix(sales): standardise invoices toolbar element heights to 40px (#76)"
```

---

### Task 4: Visual verification

- [ ] **Step 1: Start the frontend dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Verify Purchase Orders toolbar**

Navigate to `/purchasing/orders`. Confirm the search field, Date Filter dropdown, Supplier dropdown, Sort button, and (by setting a custom date range) the From/To date fields are all the same height as each other and match the Sort button height.

- [ ] **Step 3: Verify Sales Orders toolbar**

Navigate to `/sales/orders`. Confirm all filter dropdowns (Date Filter, Customer, Payment Status, Fulfillment), search field, and buttons are all the same height.

- [ ] **Step 4: Cross-page comparison**

Open Products page and Purchase Orders page side by side (or in separate tabs). Confirm the toolbar heights look identical.

- [ ] **Step 5: Close PR**

```bash
gh issue close 76 --comment "Fixed in commits: standardised all filter-area toolbar elements to 40px using TYPOGRAPHY_STYLES.searchField.input across PurchaseOrdersToolbar, OrdersToolbar, and InvoicesToolbar."
```
