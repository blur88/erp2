---
title: Issue #474 - Type Confusion Validation Hardening
date: 2026-04-30
issue: https://github.com/blur88/erp2/issues/474
---

# Type Confusion Validation Hardening (Issue #474)

## Summary

Fix CodeQL Alert #6 by validating untrusted request body and query parameters at the NestJS controller boundary. The primary vulnerable path is `POST /api/sales/invoices/batch-send`, where a single string can currently be passed as `invoiceIds` and then iterated as individual characters. The implementation should also harden the directly related date query parameters named in the issue without expanding into a repo-wide validation migration.

## Goals

- Reject non-array `invoiceIds` for invoice batch send requests.
- Reject invoice ID arrays containing non-UUID values.
- Reject array-valued date query parameters where controllers expect a single string date.
- Preserve existing service contracts and valid request behavior.
- Add focused regression tests for the vulnerable and hardened paths.

## Non-Goals

- Do not standardize validation across every backend controller in this issue.
- Do not change global `ValidationPipe` behavior unless a focused fix requires it.
- Do not change valid response shapes or service-level business rules.
- Do not migrate unrelated body/query params to DTOs.

## Affected Components

### Primary

- `backend/src/modules/sales/controllers/invoice.controller.ts`
- `backend/src/modules/sales/dto/invoice.dto.ts`
- `backend/src/modules/sales/services/invoice.service.ts`

### Secondary

- `backend/src/modules/sales/controllers/invoice.controller.ts`
- `backend/src/modules/sales/controllers/payment.controller.ts`
- `backend/src/modules/accounting/controllers/accounting-reports.controller.ts`

The secondary scope is limited to the report/stat endpoints called out by issue #474: `fromDate`, `toDate`, and `asOfDate` query params that currently accept raw `@Query('...')` values.

## Approach

### Batch Send DTO

Add a `BatchSendInvoicesDto` to `backend/src/modules/sales/dto/invoice.dto.ts`.

The DTO should require:

- `invoiceIds` is an array.
- Each `invoiceIds` entry is a UUID v4 string.
- The array is not empty.

Update `InvoiceController.batchSendInvoices` from `@Body('invoiceIds') invoiceIds: string[]` to `@Body() dto: BatchSendInvoicesDto`, then call `this.invoiceService.batchSendInvoices(dto.invoiceIds)`.

The service can keep its existing `string[]` signature. The controller boundary becomes responsible for rejecting incompatible request types before business logic runs.

### Date Query Validation

Add focused query DTOs or a small strict query parsing helper for endpoints that currently read raw report/stat date params:

- `GET /api/sales/invoices/stats/revenue` with `fromDate` and `toDate`.
- `GET /api/sales/payments/statistics/summary` with `fromDate` and `toDate`.
- Accounting report endpoints with `asOfDate`.

Validation should reject:

- Array values such as `?asOfDate=2026-01-01&asOfDate=2026-01-02`.
- Non-string values after Nest/Express parsing.
- Invalid date strings.

Valid single date strings should continue to work. Controllers may continue converting validated strings to `Date` objects when their services already expect dates.

### Error Handling

Invalid input should produce `400 Bad Request` through Nest validation or `BadRequestException`. Error message wording does not need to be part of the public contract, but tests should confirm the status code and that the service is not called for invalid input.

## Testing

Add focused backend tests covering:

- `batch-send` rejects `invoiceIds` as a single string.
- `batch-send` rejects array entries that are not UUID v4 strings.
- `batch-send` accepts a valid non-empty UUID v4 array and passes it unchanged to `InvoiceService.batchSendInvoices`.
- Date query endpoints reject duplicated/array-style params.
- Valid date query params continue to call their services with the same effective values as before.

Prefer controller-level unit tests where possible to keep setup small. Use e2e tests only if controller-level tests cannot exercise the same validation path.

## Verification

Because this is a backend source change, run:

```bash
cd backend && npm run lint && npm run test
```

If implementation touches e2e setup or global validation behavior, also run:

```bash
cd backend && npm run test:e2e
```

## Risk

Risk is moderate because controller validation changes can reject requests that were previously accepted. The scope is intentionally limited to the vulnerable batch-send body and the date query params named in the issue. Keeping service signatures unchanged reduces the chance of business logic regressions.
