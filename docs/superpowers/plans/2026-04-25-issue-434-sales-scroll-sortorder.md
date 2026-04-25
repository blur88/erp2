# Issue #434: Sales Page Scroll + sortOrder Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs on the Sales overview page — missing scroll and a 500 error caused by lowercase `sortOrder` in the API call.

**Architecture:** Three targeted changes across two files: add `useLayoutScroll(true)` to `SalesPage`, uppercase the `sortOrder` param in the `fetchRecentOrders` call, and add a `@Transform` to `BaseQueryDto.sortOrder` to normalize case before validation.

**Tech Stack:** React 19, NestJS 11, class-validator, class-transformer, Vitest (frontend tests), Jest (backend tests)

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/sales/SalesPage.tsx` | Add `useLayoutScroll(true)` hook call; fix `sortOrder: 'desc'` → `'DESC'` |
| `backend/src/common/dto/base-query.dto.ts` | Add `@Transform` to normalize `sortOrder` to uppercase |

---

### Task 1: Fix scroll on SalesPage

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

- [ ] **Step 1: Add the import**

In `frontend/src/pages/sales/SalesPage.tsx`, add `useLayoutScroll` to the imports. The existing import block ends at line 35. Add after line 35:

```ts
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
```

- [ ] **Step 2: Call the hook**

In `SalesPage.tsx`, the component function starts at line 37:

```ts
const SalesPage: React.FC = () => {
  const navigate = useNavigate()
```

Add `useLayoutScroll(true)` as the first line of the component body:

```ts
const SalesPage: React.FC = () => {
  useLayoutScroll(true)
  const navigate = useNavigate()
```

- [ ] **Step 3: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "fix: enable scroll on SalesPage (closes #434 scroll)"
```

---

### Task 2: Fix sortOrder case in fetchRecentOrders

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

- [ ] **Step 1: Fix the typo**

In `frontend/src/pages/sales/SalesPage.tsx` at line 114, change `sortOrder: 'desc'` to `sortOrder: 'DESC'`:

Before:
```ts
params: { limit: 5, sortBy: 'orderDate', sortOrder: 'desc' },
```

After:
```ts
params: { limit: 5, sortBy: 'orderDate', sortOrder: 'DESC' },
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run the existing SalesPage test**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/SalesPage.filters.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "fix: use uppercase DESC in fetchRecentOrders (closes #434 500)"
```

---

### Task 3: Harden BaseQueryDto — normalize sortOrder to uppercase

**Files:**
- Modify: `backend/src/common/dto/base-query.dto.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/common/dto/base-query.dto.spec.ts` with this content:

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BaseQueryDto } from './base-query.dto';

describe('BaseQueryDto', () => {
  it('accepts uppercase ASC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'ASC' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('ASC');
  });

  it('accepts uppercase DESC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'DESC' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('DESC');
  });

  it('normalizes lowercase asc to ASC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'asc' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('ASC');
  });

  it('normalizes lowercase desc to DESC', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'desc' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.sortOrder).toBe('DESC');
  });

  it('rejects invalid sortOrder values', async () => {
    const dto = plainToInstance(BaseQueryDto, { sortOrder: 'INVALID' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts omitted sortOrder', async () => {
    const dto = plainToInstance(BaseQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/common/dto/base-query.dto.spec.ts --no-coverage
```

Expected: the `normalizes lowercase asc` and `normalizes lowercase desc` tests FAIL (sortOrder is not normalized yet).

- [ ] **Step 3: Add the @Transform to BaseQueryDto**

In `backend/src/common/dto/base-query.dto.ts`, update the `sortOrder` field (currently lines 19–25):

Before:
```ts
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
```

After:
```ts
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
```

`Transform` is already imported from `class-transformer` at line 1.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/common/dto/base-query.dto.spec.ts --no-coverage
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run broader backend tests to check for regressions**

```bash
cd backend && npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/dto/base-query.dto.ts backend/src/common/dto/base-query.dto.spec.ts
git commit -m "fix: normalize sortOrder to uppercase in BaseQueryDto"
```

---

### Task 4: Open PR closing issue #434

- [ ] **Step 1: Push and open PR**

```bash
gh pr create --title "fix: sales page scroll and sortOrder 500 (closes #434)" --body "$(cat <<'EOF'
## Summary
- Enables scroll on the Sales overview page via `useLayoutScroll(true)`
- Fixes 500 error by correcting `sortOrder: 'desc'` → `'DESC'` in `fetchRecentOrders`
- Hardens `BaseQueryDto` to normalize `sortOrder` to uppercase before validation, preventing recurrence

## Test plan
- [ ] Navigate to `/sales` — content below the fold should be scrollable
- [ ] No 500 in browser console on page load
- [ ] Backend tests pass: `cd backend && npm run test`
- [ ] Frontend type-check passes: `cd frontend && npm run type-check`

Closes #434

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
