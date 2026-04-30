# Issue 484 CSV Import Loop Bound Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden product CSV import parsing against loop bound injection by validating parser inputs and enforcing fixed row and line limits.

**Architecture:** Keep the existing `ProductService` CSV parser and add early guard clauses around the two private parser methods. `parseCsvContent` owns file-level validation, including the 1,000 data-row limit, while `parseCsvLine` owns per-line type and length validation with an 8,192-character limit.

**Tech Stack:** NestJS, TypeScript, Jest

---

## File Structure

- Modify: `backend/src/modules/inventory/services/product.service.ts`
  - Add private readonly CSV import limits to `ProductService`.
  - Add input type validation to `parseCsvContent` and `parseCsvLine`.
  - Enforce the data-row and line-length limits before expensive parsing loops.
- Modify: `backend/src/modules/inventory/services/product.service.spec.ts`
  - Add focused unit tests for malformed parser inputs, row-limit boundaries, line-length boundaries, and quoted CSV parsing.

## Reference Spec

- `docs/superpowers/specs/2026-04-30-security-fix-loop-bound-injection-design.md`

---

### Task 1: Add Failing Parser Hardening Tests

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.spec.ts`

- [ ] **Step 1: Import `BadRequestException`**

Update the first import in `backend/src/modules/inventory/services/product.service.spec.ts` from:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
```

to:

```typescript
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
```

- [ ] **Step 2: Add parser hardening test group**

Add this `describe` block inside the existing top-level `describe('ProductService pagination removal', () => { ... })`, after the existing `beforeEach` and before the first `it('findAll returns all matching products with total-only metadata', ...)` test:

```typescript
  describe('CSV import parser hardening', () => {
    const requiredHeader = 'name,type,categoryName,baseCost';
    const validDataRow = 'Widget,GOODS,Hardware,12.50';

    it('parseCsvContent rejects non-string content', () => {
      expect(() => (service as any).parseCsvContent({ length: 2 })).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvContent({ length: 2 })).toThrow('CSV content must be a string');
    });

    it('parseCsvContent accepts exactly 1000 data rows plus a header row', () => {
      const content = `${requiredHeader}\n${Array.from({ length: 1000 }, () => validDataRow).join('\n')}`;

      const rows = (service as any).parseCsvContent(content);

      expect(rows).toHaveLength(1000);
      expect(rows[0]).toEqual({
        name: 'Widget',
        type: 'GOODS',
        categoryname: 'Hardware',
        basecost: '12.50',
      });
    });

    it('parseCsvContent rejects 1001 data rows plus a header row', () => {
      const content = `${requiredHeader}\n${Array.from({ length: 1001 }, () => validDataRow).join('\n')}`;

      expect(() => (service as any).parseCsvContent(content)).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvContent(content)).toThrow(
        'Import file exceeds maximum allowed data rows (1000)',
      );
    });

    it('parseCsvLine rejects non-string input', () => {
      expect(() => (service as any).parseCsvLine({ length: 8192 })).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvLine({ length: 8192 })).toThrow('CSV line must be a string');
    });

    it('parseCsvLine accepts a line exactly 8192 characters long', () => {
      const line = 'a'.repeat(8192);

      expect((service as any).parseCsvLine(line)).toEqual([line]);
    });

    it('parseCsvLine rejects a line longer than 8192 characters', () => {
      const line = 'a'.repeat(8193);

      expect(() => (service as any).parseCsvLine(line)).toThrow(BadRequestException);
      expect(() => (service as any).parseCsvLine(line)).toThrow(
        'CSV line exceeds maximum allowed length (8192 characters)',
      );
    });

    it('parseCsvLine preserves quoted comma parsing for valid CSV lines', () => {
      expect((service as any).parseCsvLine('Widget,"Hardware, Tools",12.50')).toEqual([
        'Widget',
        'Hardware, Tools',
        '12.50',
      ]);
    });
  });
```

- [ ] **Step 3: Run focused test and verify failure**

Run:

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts
```

Expected: FAIL. The failures should come from the new parser hardening expectations because `parseCsvContent` and `parseCsvLine` do not yet throw the new `BadRequestException`s or enforce the new limits.

- [ ] **Step 4: Commit the failing tests**

```bash
git add backend/src/modules/inventory/services/product.service.spec.ts
git commit -m "test(inventory): cover CSV parser import limits"
```

---

### Task 2: Implement CSV Parser Guard Clauses

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`

- [ ] **Step 1: Add private import limit constants**

Find the opening of the `ProductService` class in `backend/src/modules/inventory/services/product.service.ts` and add these private readonly properties near the other class-level constants or before the constructor:

```typescript
  private readonly MAX_IMPORT_DATA_ROWS = 1000;
  private readonly MAX_CSV_LINE_LENGTH = 8192;
```

- [ ] **Step 2: Replace `parseCsvContent` with guarded implementation**

Replace the existing `parseCsvContent` method with:

```typescript
  /**
   * Parse CSV content
   */
  private parseCsvContent(content: string): any[] {
    if (typeof content !== 'string') {
      throw new BadRequestException('CSV content must be a string');
    }

    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      throw new BadRequestException('File must contain at least a header row and one data row');
    }

    const dataRowCount = lines.length - 1;
    if (dataRowCount > this.MAX_IMPORT_DATA_ROWS) {
      throw new BadRequestException(
        `Import file exceeds maximum allowed data rows (${this.MAX_IMPORT_DATA_ROWS})`,
      );
    }

    // Parse header
    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine).map(h => h.toLowerCase().replace(/\*/g, ''));

    // Validate required headers
    const requiredHeaders = ['name', 'type', 'categoryname', 'basecost'];
    const missingHeaders = requiredHeaders.filter(req => !headers.includes(req));

    if (missingHeaders.length > 0) {
      throw new BadRequestException(`Missing required headers: ${missingHeaders.join(', ')}`);
    }

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const values = this.parseCsvLine(line);
      const rowData: any = {};

      headers.forEach((header, index) => {
        rowData[header] = values[index] || '';
      });

      rows.push(rowData);
    }

    return rows;
  }
```

- [ ] **Step 3: Replace `parseCsvLine` with guarded implementation**

Replace the existing `parseCsvLine` method with:

```typescript
  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    if (typeof line !== 'string') {
      throw new BadRequestException('CSV line must be a string');
    }

    if (line.length > this.MAX_CSV_LINE_LENGTH) {
      throw new BadRequestException(
        `CSV line exceeds maximum allowed length (${this.MAX_CSV_LINE_LENGTH} characters)`,
      );
    }

    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && (i === 0 || line[i - 1] === ',')) {
        inQuotes = true;
      } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i + 1] === ',')) {
        inQuotes = false;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    values.push(currentValue.trim());
    return values;
  }
```

- [ ] **Step 4: Run focused test and verify pass**

Run:

```bash
cd backend && npx jest src/modules/inventory/services/product.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit implementation**

```bash
git add backend/src/modules/inventory/services/product.service.ts
git commit -m "fix(inventory): harden CSV parser import limits"
```

---

### Task 3: Change-Scoped Verification

**Files:**
- Verify: `backend/src/modules/inventory/services/product.service.ts`
- Verify: `backend/src/modules/inventory/services/product.service.spec.ts`

- [ ] **Step 1: Run backend lint**

Run:

```bash
cd backend && npm run lint
```

Expected: PASS.

- [ ] **Step 2: Run backend tests**

Run:

```bash
cd backend && npm run test
```

Expected: PASS.

- [ ] **Step 3: Record verification evidence**

Add the exact commands and results to the PR body or issue comment:

```markdown
Verification:
- `cd backend && npx jest src/modules/inventory/services/product.service.spec.ts` - PASS
- `cd backend && npm run lint` - PASS
- `cd backend && npm run test` - PASS
```
