# @hookform/resolvers v5 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade `@hookform/resolvers` from `^3.3.2` to `5.2.2`, fix any resulting TypeScript errors, and verify the build stays clean.

**Architecture:** Bump the package version, install, run the TypeScript checker, and surgically fix any type errors that surface. All 18 affected files use `yupResolver` with explicit `useForm<T>()` generics; v5's new input/output type inference may require adding a second generic parameter `useForm<T, object, T>()` on forms whose Yup schema output type doesn't exactly match the declared `T`. The import path `@hookform/resolvers/yup` is unchanged.

**Tech Stack:** React 18, react-hook-form 7.71.2, @hookform/resolvers, Yup 1.x, TypeScript (strict: false), Vite, Vitest

---

### Task 1: Upgrade the package

**Files:**
- Modify: `frontend/package.json`

**Step 1: Update the version in package.json**

In `frontend/package.json`, change:
```json
"@hookform/resolvers": "^3.3.2",
```
to:
```json
"@hookform/resolvers": "5.2.2",
```

**Step 2: Install the updated package**

```bash
cd /home/blur/erp2/frontend && npm install
```
Expected: installs `@hookform/resolvers@5.2.2`, no peer-dependency errors. `react-hook-form@7.71.2` already satisfies the `^7.55.0` requirement.

**Step 3: Verify installed version**

```bash
node -e "const p = require('./node_modules/@hookform/resolvers/package.json'); console.log(p.version)"
```
Expected output: `5.2.2`

---

### Task 2: Run TypeScript check and assess errors

**Step 1: Run the type-checker**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tee /tmp/type-check-before-fixes.txt
```
Expected: either `Found 0 errors` (done — skip to Task 4), or a list of errors in the 18 `useForm` files.

**Step 2: Count and categorise errors**

```bash
grep "error TS" /tmp/type-check-before-fixes.txt | wc -l
grep "error TS" /tmp/type-check-before-fixes.txt | head -30
```

Typical v5 error pattern:
```
Argument of type 'Resolver<XxxFormData, any, XxxFormData>' is not assignable to parameter of type 'Resolver<XxxFormData, any, DefaultValues<XxxFormData>>'
```

If zero errors: skip to Task 4 (commit).

---

### Task 3: Fix TypeScript errors (only if Task 2 found errors)

**Background:** When `useForm<T>()` is used with `yupResolver`, v5 infers a three-parameter `Resolver<Input, Context, Output>`. If the Yup schema output matches the declared `T`, no change is needed. If TypeScript complains, the fix is to either:
- Add a second generic: `useForm<T, object, T>()` — tells TS the output type is also `T`
- Or remove the generic and let it infer: `useForm()` — only safe if nothing else in the file relies on the explicit type

**Preferred fix: `useForm<T, object, T>()`** — minimal and explicit.

**Step 1: For each file with errors, apply the fix**

Pattern to find and fix (repeat for every affected file shown by type-check):

Example — `src/pages/auth/LoginPage.tsx` line 56:
```typescript
// BEFORE
} = useForm<LoginCredentials>({

// AFTER
} = useForm<LoginCredentials, object, LoginCredentials>({
```

Apply the same pattern to each affected file. The affected files are among:
- `src/pages/purchasing/SuppliersPage.tsx`
- `src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- `src/pages/inventory/CreateProductPage.tsx`
- `src/pages/inventory/CreateStockAdjustmentPage.tsx`
- `src/pages/inventory/CategoriesPage.tsx`
- `src/pages/sales/CreateSalesOrderPage.tsx`
- `src/pages/sales/CustomersPage.tsx`
- `src/pages/accounting/JournalEntryFormPage.tsx`
- `src/pages/settings/CompanySettingsPage.tsx`
- `src/pages/settings/PrintSettings/GeneralTab.tsx`
- `src/pages/settings/PriceCostingPage.tsx`
- `src/pages/settings/RegionalSettingsPage.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/MandatoryPasswordChangePage.tsx`
- `src/components/accounting/ChartOfAccountFormDialog.tsx`
- `src/components/settings/PriceListFormDialog.tsx`
- `src/components/settings/PriceListCopyDialog.tsx`
- `src/components/settings/UserFormDialog.tsx`

**Step 2: Re-run type-check after each batch of fixes**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | grep "error TS" | wc -l
```
Expected: error count decreases with each fix. Continue until `0 errors`.

---

### Task 4: Run frontend tests

**Step 1: Run Vitest**

```bash
cd /home/blur/erp2/frontend && npm run test -- --run 2>&1 | tail -20
```
Expected: all tests pass (same as before upgrade).

---

### Task 5: Commit

**Step 1: Stage changes**

```bash
cd /home/blur/erp2 && git add frontend/package.json frontend/package-lock.json frontend/src/
```

**Step 2: Commit**

```bash
git commit -m "chore(frontend): upgrade @hookform/resolvers 3→5.2.2, fix TS generics"
```

---

## Notes

- The import path `import { yupResolver } from '@hookform/resolvers/yup'` is **unchanged** — do not modify imports.
- Runtime behaviour is identical between v3 and v5 for `yupResolver`; this is a types-only change.
- If any error involves a field other than the `useForm` generic (e.g., `handleSubmit` callback typing), check whether the declared type matches the Yup `InferType<typeof schema>` and align them.
