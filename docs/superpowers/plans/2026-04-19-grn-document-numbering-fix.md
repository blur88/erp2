# GRN Document Numbering Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy fallback from GRN number generation and make the sync aware of legacy-format numbers.

**Architecture:** Drop the `try/catch` fallback in `GoodsReceivedNoteService` so misconfigured document settings surface as errors. Update `syncDocumentNumbersWithDatabase` to scan both `GRN-YY-NNN` and legacy `GRN-XXXXXX` formats when computing `nextNumber`.

**Tech Stack:** NestJS 11, TypeORM, Jest (backend tests)

**Spec:** `docs/superpowers/specs/2026-04-19-grn-document-numbering-fix-design.md`

---

## Files

- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.ts` — remove private `generateSequentialGrnNumber()`, inline the settings call
- Modify: `backend/src/modules/settings/settings.service.ts` — update `'Goods Received'` sync case to also scan legacy-format numbers
- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.spec.ts` — update/add tests for no-fallback behaviour

---

### Task 1: Update tests for no-fallback GRN number generation

**Files:**
- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.spec.ts`

The existing `create` suite mocks `settingsService.generateDocumentNumber` in a `beforeEach`. We need to add two tests:

1. Confirm the document number returned by settings is used as-is.
2. Confirm that when settings throws, `create()` throws `BadRequestException` (no fallback).

- [ ] **Step 1: Add tests at the end of the `create` describe block**

Open `backend/src/modules/purchasing/services/goods-received-note.service.spec.ts`.

After the last `it(...)` inside `describe('create', ...)`, add:

```ts
it('should use the document number returned by settingsService', async () => {
  const fullGrn = {
    ...mockGrn,
    supplier: mockPurchaseOrder.supplier,
    purchaseOrder: mockPurchaseOrder,
  } as GoodsReceivedNote;

  grnRepository.findOne
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(fullGrn)
    .mockResolvedValueOnce(fullGrn);

  settingsService.generateDocumentNumber.mockResolvedValue('GRN-26-007');
  grnRepository.create.mockReturnValue({ ...mockGrn, grnNumber: 'GRN-26-007' } as GoodsReceivedNote);

  await service.create(createDto);

  expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith('Goods Received');
  expect(grnRepository.create).toHaveBeenCalledWith(
    expect.objectContaining({ grnNumber: 'GRN-26-007' }),
  );
});

it('should throw BadRequestException when settingsService.generateDocumentNumber fails', async () => {
  grnRepository.findOne.mockResolvedValueOnce(null); // no existing GRN
  settingsService.generateDocumentNumber.mockRejectedValue(
    new Error("Document number config for 'Goods Received' not found"),
  );

  await expect(service.create(createDto)).rejects.toThrow('Failed to create goods received note');
  expect(grnRepository.save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new tests — expect them to FAIL**

```bash
cd backend && npx jest src/modules/purchasing/services/goods-received-note.service.spec.ts --no-coverage
```

The second test ("should throw BadRequestException…") will PASS (the existing code already throws after the catch), but the first test ("should use the document number…") will FAIL because the current code ignores the returned value and falls back.

Note: if both pass already, re-read — you may be looking at wrong test names.

---

### Task 2: Remove the fallback in GoodsReceivedNoteService

**Files:**
- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.ts`

- [ ] **Step 1: Delete `generateSequentialGrnNumber` and inline the call**

In `goods-received-note.service.ts`, delete the entire private method `generateSequentialGrnNumber()` (lines 72–102).

Then inside `create()`, find:

```ts
// Generate sequential GRN number
const grnNumber = await this.generateSequentialGrnNumber();
```

Replace it with:

```ts
const grnNumber = await this.settingsService.generateDocumentNumber('Goods Received');
```

The surrounding `try/catch` in `create()` already logs the error and re-throws as `BadRequestException('Failed to create goods received note')`, so no additional error handling is needed.

- [ ] **Step 2: Run the tests — expect both new tests to PASS**

```bash
cd backend && npx jest src/modules/purchasing/services/goods-received-note.service.spec.ts --no-coverage
```

Expected output: all tests pass (previously failing test now passes, no regressions).

- [ ] **Step 3: Commit**

```bash
cd backend && cd .. && git add backend/src/modules/purchasing/services/goods-received-note.service.ts backend/src/modules/purchasing/services/goods-received-note.service.spec.ts
git commit -m "fix: remove GRN number fallback, delegate entirely to document number settings (issue #391)"
```

---

### Task 3: Update syncDocumentNumbersWithDatabase to handle legacy GRN format

**Files:**
- Modify: `backend/src/modules/settings/settings.service.ts`

The sync currently only scans `GRN-YY-NNN` format. We also need to check `GRN-XXXXXX` (legacy 6-digit, no year) so `nextNumber` is set to `max(legacyMax, currentYearMax) + 1`.

- [ ] **Step 1: Replace the `'Goods Received'` case in `syncDocumentNumbersWithDatabase`**

In `settings.service.ts`, find the `case 'Goods Received':` block (around line 574–583):

```ts
case 'Goods Received': {
  const r = await this.goodsReceivedNoteRepository
    .createQueryBuilder('grn')
    .select('grn.grnNumber')
    .where('grn.grnNumber LIKE :p', { p: pattern(row.prefix) })
    .orderBy('grn.grnNumber', 'DESC')
    .limit(1)
    .getOne();
  if (r?.grnNumber) maxNumber = parseInt(r.grnNumber.split('-')[2], 10) || 0;
  break;
}
```

Replace it with:

```ts
case 'Goods Received': {
  // Current-year format: GRN-26-NNN
  const r = await this.goodsReceivedNoteRepository
    .createQueryBuilder('grn')
    .select('grn.grnNumber')
    .where('grn.grnNumber LIKE :p', { p: pattern(row.prefix) })
    .orderBy('grn.grnNumber', 'DESC')
    .limit(1)
    .getOne();
  if (r?.grnNumber) maxNumber = parseInt(r.grnNumber.split('-')[2], 10) || 0;

  // Legacy format: GRN-XXXXXX (no year segment)
  const legacy = await this.goodsReceivedNoteRepository
    .createQueryBuilder('grn')
    .select('grn.grnNumber')
    .where("grn.grnNumber ~ '^GRN-\\\\d+$'")
    .orderBy('grn.grnNumber', 'DESC')
    .limit(1)
    .getOne();
  if (legacy?.grnNumber) {
    const legacyNum = parseInt(legacy.grnNumber.split('-')[1], 10) || 0;
    maxNumber = Math.max(maxNumber, legacyNum);
  }
  break;
}
```

- [ ] **Step 2: Run the full purchasing service test suite to check for regressions**

```bash
cd backend && npx jest src/modules/purchasing/ --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 3: Run the settings service tests**

```bash
cd backend && npx jest src/modules/settings/ --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
cd .. && git add backend/src/modules/settings/settings.service.ts
git commit -m "fix: sync GRN nextNumber accounts for legacy GRN-XXXXXX format (issue #391)"
```
