# Design Spec: Security Fix for Loop Bound Injection (Alert #42)

## Problem Statement
The product import's CSV parsing logic in `ProductService.parseCsvLine` iterates over the `.length` property of a user-provided string. While the buffer is converted to a string before parsing, this pattern is vulnerable to "Loop bound injection" (CWE-834, CWE-730). An attacker could provide a crafted file with extremely long lines or manipulated properties to cause a Denial of Service (DoS) by exhausting CPU or memory resources, hanging the Node.js event loop.

## Proposed Changes

### 1. Service Layer Hardening (`ProductService`)
We will add strict resource limits and input validation to the CSV parsing methods.

#### `parseCsvContent`
-   **Max Rows:** Define a constant `MAX_IMPORT_ROWS = 1000`.
-   **Validation:** Throw a `BadRequestException` if the number of lines in the CSV exceeds this limit.

#### `parseCsvLine`
-   **Type Validation:** Explicitly verify that the `line` parameter is a string.
-   **Max Line Length:** Define a constant `MAX_LINE_LENGTH = 2048` (2KB).
-   **Validation:** Throw a `BadRequestException` if `line.length` exceeds this limit.

### 2. Configuration & Constants
We will define these limits as private constants within the `ProductService` class to keep them centralized.

## Technical Details

### `backend/src/modules/inventory/services/product.service.ts`

```typescript
// Constants to be added to the class
private readonly MAX_IMPORT_ROWS = 1000;
private readonly MAX_LINE_LENGTH = 2048;

// Update parseCsvContent
private parseCsvContent(content: string): any[] {
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length > this.MAX_IMPORT_ROWS) {
    throw new BadRequestException(`Import file exceeds maximum allowed rows (${this.MAX_IMPORT_ROWS})`);
  }
  // ... existing logic
}

// Update parseCsvLine
private parseCsvLine(line: string): string[] {
  if (typeof line !== 'string') {
    throw new InternalServerErrorException('CSV parsing error: expected string input');
  }

  if (line.length > this.MAX_LINE_LENGTH) {
    throw new BadRequestException(`CSV line length exceeds maximum allowed limit (${this.MAX_LINE_LENGTH} characters)`);
  }
  // ... existing loop logic
}
```

## Verification Plan

### Automated Tests
-   **Unit Tests:** Add tests to `backend/src/modules/inventory/services/product.service.spec.ts` (or create a new one if it doesn't exist) to:
    -   Verify `parseCsvContent` throws when exceeding row limit.
    -   Verify `parseCsvLine` throws when exceeding character limit.
    -   Verify `parseCsvLine` still correctly parses valid CSV lines.

### Manual Verification
1.  Upload a CSV with 1,001 rows and verify it is rejected.
2.  Upload a CSV with a line longer than 2,048 characters and verify it is rejected.
3.  Upload a standard valid CSV and verify it still imports correctly.
