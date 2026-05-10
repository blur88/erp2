# GRN Document Numbering Fix — Design Spec

**Issue:** #391
**Date:** 2026-04-19

## Problem

`GoodsReceivedNoteService.generateSequentialGrnNumber` wraps the call to
`settingsService.generateDocumentNumber('Goods Received')` in a try/catch with a
fallback that produces legacy `GRN-XXXXXX` (6-digit, no year) numbers. This:

1. Silently masks misconfiguration instead of surfacing it.
2. Produces numbers in a format (`GRN-000001`) that `syncDocumentNumbersWithDatabase`
   does not recognise, so the sync sets `nextNumber` too low and risks duplicates.

## Decisions

- Drop the fallback entirely. Let `NotFoundException` from `SettingsService` propagate.
- No migration — no schema changes, no normalization of existing records.
- Update the sync to also scan legacy-format GRN numbers so `nextNumber` is always
  set to `max(legacy, current-year) + 1`.

## Changes

### 1. `backend/src/modules/purchasing/services/goods-received-note.service.ts`

Remove `generateSequentialGrnNumber()` entirely. Inline the single call directly in
`create()`:

```ts
const grnNumber = await this.settingsService.generateDocumentNumber('Goods Received');
```

The outer `try/catch` in `create()` already catches any thrown error, logs it, and
re-throws as `BadRequestException('Failed to create goods received note')`.

### 2. `backend/src/modules/settings/settings.service.ts` — `syncDocumentNumbersWithDatabase`

In the `'Goods Received'` case, run a second query for legacy-format numbers
(`GRN-XXXXXX`) and use `Math.max(legacyMax, currentYearMax)` when setting
`nextNumber`.

```ts
case 'Goods Received': {
  // current-year format: GRN-26-NNN
  const r = await this.goodsReceivedNoteRepository
    .createQueryBuilder('grn')
    .select('grn.grnNumber')
    .where('grn.grnNumber LIKE :p', { p: pattern(row.prefix) })
    .orderBy('grn.grnNumber', 'DESC')
    .limit(1)
    .getOne();
  if (r?.grnNumber) maxNumber = parseInt(r.grnNumber.split('-')[2], 10) || 0;

  // legacy format: GRN-XXXXXX (no year segment)
  const legacy = await this.goodsReceivedNoteRepository
    .createQueryBuilder('grn')
    .select('grn.grnNumber')
    .where("grn.grnNumber ~ '^GRN-\\d+$'")
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

### 3. `backend/src/modules/purchasing/services/goods-received-note.service.spec.ts`

Add/update tests:

- **Happy path:** `settingsService.generateDocumentNumber` returns a number → GRN
  created with that number.
- **Settings failure:** `settingsService.generateDocumentNumber` throws → `create()`
  throws `BadRequestException`; no fallback GRN number is produced.

## Out of Scope

- Normalizing existing legacy `GRN-XXXXXX` records in the database.
- Frontend changes (document number format is already displayed correctly).
