# isActive Filter Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `isActive` boolean transform in `SupplierQueryDto` and `QueryCustomersDto` so that omitting the parameter returns all records instead of only inactive ones.

**Architecture:** Two DTO files need a one-line transform replacement each. The service layer is already correct — both services guard with `if (isActive !== undefined)` before applying the filter. Unit tests are added as new spec files alongside the DTOs, following the `plainToInstance` + `class-validator` pattern established in `src/modules/search/dto/track-click.dto.spec.ts`.

**Tech Stack:** NestJS, class-transformer (`plainToInstance`), class-validator (`validate`), Jest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/src/modules/purchasing/dto/supplier.dto.ts:99` | Fix `isActive` transform in `SupplierQueryDto` |
| Create | `backend/src/modules/purchasing/dto/supplier.dto.spec.ts` | Unit tests for `SupplierQueryDto.isActive` transform |
| Modify | `backend/src/modules/sales/dto/customer.dto.ts:231` | Fix `isActive` transform in `QueryCustomersDto` |
| Create | `backend/src/modules/sales/dto/customer.dto.spec.ts` | Unit tests for `QueryCustomersDto.isActive` transform |

---

### Task 1: Fix and test SupplierQueryDto

**Files:**
- Modify: `backend/src/modules/purchasing/dto/supplier.dto.ts:99`
- Create: `backend/src/modules/purchasing/dto/supplier.dto.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/purchasing/dto/supplier.dto.spec.ts`:

```typescript
import { plainToInstance } from 'class-transformer';
import { SupplierQueryDto } from './supplier.dto';

describe('SupplierQueryDto', () => {
  function make(raw: Record<string, unknown> = {}): SupplierQueryDto {
    return plainToInstance(SupplierQueryDto, raw);
  }

  describe('isActive transform', () => {
    it('returns undefined when isActive is not provided', () => {
      const dto = make({});
      expect(dto.isActive).toBeUndefined();
    });

    it('returns true when isActive is the string "true"', () => {
      const dto = make({ isActive: 'true' });
      expect(dto.isActive).toBe(true);
    });

    it('returns false when isActive is the string "false"', () => {
      const dto = make({ isActive: 'false' });
      expect(dto.isActive).toBe(false);
    });

    it('returns true when isActive is the boolean true', () => {
      const dto = make({ isActive: true });
      expect(dto.isActive).toBe(true);
    });

    it('returns undefined when isActive is an empty string', () => {
      const dto = make({ isActive: '' });
      expect(dto.isActive).toBeUndefined();
    });

    it('returns undefined when isActive is null', () => {
      const dto = make({ isActive: null });
      expect(dto.isActive).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest src/modules/purchasing/dto/supplier.dto.spec.ts --no-coverage
```

Expected: FAIL — `returns undefined when isActive is not provided` fails because the transform returns `false`.

- [ ] **Step 3: Fix the transform in supplier.dto.ts**

In `backend/src/modules/purchasing/dto/supplier.dto.ts`, replace line 99:

```typescript
// Before (line 99)
  @Transform(({ value }) => value === 'true' || value === true)
```

```typescript
// After
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx jest src/modules/purchasing/dto/supplier.dto.spec.ts --no-coverage
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/purchasing/dto/supplier.dto.ts \
        backend/src/modules/purchasing/dto/supplier.dto.spec.ts
git commit -m "fix(purchasing): isActive filter no longer defaults to false when omitted

Closes #297"
```

---

### Task 2: Fix and test QueryCustomersDto

**Files:**
- Modify: `backend/src/modules/sales/dto/customer.dto.ts:231`
- Create: `backend/src/modules/sales/dto/customer.dto.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/sales/dto/customer.dto.spec.ts`:

```typescript
import { plainToInstance } from 'class-transformer';
import { QueryCustomersDto } from './customer.dto';

describe('QueryCustomersDto', () => {
  function make(raw: Record<string, unknown> = {}): QueryCustomersDto {
    return plainToInstance(QueryCustomersDto, raw);
  }

  describe('isActive transform', () => {
    it('returns undefined when isActive is not provided', () => {
      const dto = make({});
      expect(dto.isActive).toBeUndefined();
    });

    it('returns true when isActive is the string "true"', () => {
      const dto = make({ isActive: 'true' });
      expect(dto.isActive).toBe(true);
    });

    it('returns false when isActive is the string "false"', () => {
      const dto = make({ isActive: 'false' });
      expect(dto.isActive).toBe(false);
    });

    it('returns true when isActive is the boolean true', () => {
      const dto = make({ isActive: true });
      expect(dto.isActive).toBe(true);
    });

    it('returns undefined when isActive is an empty string', () => {
      const dto = make({ isActive: '' });
      expect(dto.isActive).toBeUndefined();
    });

    it('returns undefined when isActive is null', () => {
      const dto = make({ isActive: null });
      expect(dto.isActive).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest src/modules/sales/dto/customer.dto.spec.ts --no-coverage
```

Expected: FAIL — `returns undefined when isActive is not provided` fails because the transform returns `false`.

- [ ] **Step 3: Fix the transform in customer.dto.ts**

In `backend/src/modules/sales/dto/customer.dto.ts`, replace line 231:

```typescript
// Before (line 231)
  @Transform(({ value }) => value === 'true' || value === true)
```

```typescript
// After
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value === 'true' || value === true;
  })
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx jest src/modules/sales/dto/customer.dto.spec.ts --no-coverage
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/dto/customer.dto.ts \
        backend/src/modules/sales/dto/customer.dto.spec.ts
git commit -m "fix(sales): isActive filter no longer defaults to false when omitted

Closes #297"
```

---

### Task 3: Final verification

- [ ] **Step 1: Run both new spec files together**

```bash
cd backend && npx jest src/modules/purchasing/dto/supplier.dto.spec.ts src/modules/sales/dto/customer.dto.spec.ts --no-coverage
```

Expected: PASS — 12 tests pass total.

- [ ] **Step 2: Run the full backend test suite to check for regressions**

```bash
cd backend && npm run test
```

Expected: all tests pass (no new failures).
