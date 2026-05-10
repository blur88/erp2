# Design Spec: Issue 484 CSV Import Loop Bound Injection

## Problem Statement

GitHub issue 484 tracks Code Scanning alert 42 for loop bound injection in product CSV import parsing. The vulnerable surface is `ProductService.parseCsvLine`, which loops over `line.length` for input derived from an uploaded file. The current code converts the upload buffer to a string before parsing, but it does not enforce type or resource limits before calling string APIs and iterating over each character.

The fix should make malformed or excessive import files fail early with a clear client error, while preserving valid product imports and the existing CSV parsing behavior.

## Scope

This change is limited to backend product import parsing in `backend/src/modules/inventory/services/product.service.ts` and its unit tests.

In scope:
- Validate CSV parser inputs before using `.split()` or `.length`.
- Limit one import to 1,000 data rows, excluding the header row.
- Limit each CSV line to 8,192 characters.
- Add regression tests for the limits and existing quoted CSV parsing.

Out of scope:
- Replacing the hand-written CSV parser with a streaming parser.
- Adding environment variables for import limits.
- Changing import DTO validation or frontend upload behavior.
- Changing the import template format.

## Recommended Approach

Use fixed private limits inside `ProductService`:

```typescript
private readonly MAX_IMPORT_DATA_ROWS = 1000;
private readonly MAX_CSV_LINE_LENGTH = 8192;
```

Fixed limits are enough for this security fix. They keep the parser behavior easy to understand and test without adding configuration surface that current deployments do not need.

The row limit should apply to data rows only. A file with one header row and 1,000 non-empty data rows is valid. A file with one header row and 1,001 non-empty data rows is rejected.

The line limit should apply to every non-empty line, including the header. A line of exactly 8,192 characters is valid. A line of 8,193 characters is rejected.

## Parser Behavior

`parseCsvContent(content)` should:
- Throw `BadRequestException` if `content` is not a string.
- Split content by newline and keep the existing non-empty-line behavior.
- Throw `BadRequestException` if the filtered file has fewer than two rows.
- Throw `BadRequestException` if the number of data rows exceeds `MAX_IMPORT_DATA_ROWS`.
- Call `parseCsvLine` for the header and each data row, so line length validation is centralized.
- Preserve the existing required-header validation and row mapping.

`parseCsvLine(line)` should:
- Throw `BadRequestException` if `line` is not a string.
- Throw `BadRequestException` if `line.length` exceeds `MAX_CSV_LINE_LENGTH`.
- Preserve the existing quote and comma parsing behavior for valid lines.

These checks intentionally use `BadRequestException` because the failure is caused by invalid import input.

## Error Handling

Error messages should name the violated limit without exposing stack traces or internal implementation details. Suitable messages:
- `CSV content must be a string`
- `CSV line must be a string`
- `Import file exceeds maximum allowed data rows (1000)`
- `CSV line exceeds maximum allowed length (8192 characters)`

The import flow already surfaces `BadRequestException` responses to the client, so no controller changes are required.

## Testing Plan

Add focused unit coverage in `backend/src/modules/inventory/services/product.service.spec.ts`.

Tests should verify:
- `parseCsvContent` rejects non-string content.
- `parseCsvContent` accepts exactly 1,000 data rows plus one header row.
- `parseCsvContent` rejects 1,001 data rows plus one header row.
- `parseCsvLine` rejects non-string input.
- `parseCsvLine` accepts a line exactly 8,192 characters long.
- `parseCsvLine` rejects a line 8,193 characters long.
- `parseCsvLine` still parses valid quoted CSV values as it does today.

The targeted verification command is:

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts
```

Before PR, because this touches `backend/src/**`, run:

```bash
cd backend && npm run lint && npm run test
```
