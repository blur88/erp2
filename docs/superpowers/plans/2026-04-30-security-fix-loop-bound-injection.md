# Security Fix for Loop Bound Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix security alert #42 by hardening CSV parsing in `ProductService` with type validation and resource limits.

**Architecture:** Add private constants for limits and implement guard clauses in `parseCsvContent` and `parseCsvLine`.

**Tech Stack:** NestJS, TypeScript, Jest

---

### Task 1: Research & Reproduction

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.spec.ts`

- [ ] **Step 1: Add a failing test for row limit**
Add a test case that calls `parseCsvContent` with more than 1000 lines.

```typescript
it('should throw BadRequestException if CSV exceeds 1000 rows', () => {
  const content = 'header1,header2\n' + 'data1,data2\n'.repeat(1001);
  expect(() => (service as any).parseCsvContent(content)).toThrow(BadRequestException);
});
```

- [ ] **Step 2: Add a failing test for line length limit**
Add a test case that calls `parseCsvLine` with a line longer than 2048 characters.

```typescript
it('should throw BadRequestException if CSV line exceeds 2048 characters', () => {
  const line = 'a'.repeat(2049);
  expect(() => (service as any).parseCsvLine(line)).toThrow(BadRequestException);
});
```

- [ ] **Step 3: Run tests to verify failure**
Run: `cd backend && npx jest src/modules/inventory/services/product.service.spec.ts`
Expected: FAIL

### Task 2: Implement Hardening in `ProductService`

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`

- [ ] **Step 1: Add private constants**
Add `MAX_IMPORT_ROWS = 1000` and `MAX_LINE_LENGTH = 2048` to the `ProductService` class.

- [ ] **Step 2: Implement guard in `parseCsvContent`**
Check `lines.length > this.MAX_IMPORT_ROWS`.

- [ ] **Step 3: Implement guard in `parseCsvLine`**
Check `typeof line !== 'string'` and `line.length > this.MAX_LINE_LENGTH`.

### Task 3: Verification

- [ ] **Step 1: Run tests to verify pass**
Run: `cd backend && npx jest src/modules/inventory/services/product.service.spec.ts`
Expected: PASS

- [ ] **Step 2: Commit changes**
```bash
git add backend/src/modules/inventory/services/product.service.ts backend/src/modules/inventory/services/product.service.spec.ts
git commit -m "fix(inventory): harden CSV parsing against loop bound injection (alert #42)"
```
