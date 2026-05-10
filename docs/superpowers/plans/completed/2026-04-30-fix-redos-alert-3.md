# Fix ReDoS in DataSanitizerService Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve CodeQL Security Alert #3 by implementing a length limit on the input to `DataSanitizerService.sanitizeUserAgent`.

**Architecture:** Use a standard length-check guard clause (1000 characters) before applying the version-stripping regular expression to uncontrolled User-Agent strings.

**Tech Stack:** NestJS, Jest, TypeScript.

---

### Task 1: Setup Unit Tests

**Files:**
- Create: `backend/test/unit/data-sanitizer.service.spec.ts`

- [ ] **Step 1: Write initial tests**

Create the test file with cases for normal sanitization and the new length-limit requirement.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DataSanitizerService } from '../../src/common/filters/security/data-sanitizer.service';

describe('DataSanitizerService', () => {
  let service: DataSanitizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataSanitizerService],
    }).compile();

    service = module.get<DataSanitizerService>(DataSanitizerService);
  });

  describe('sanitizeUserAgent', () => {
    it('should sanitize version numbers in standard User-Agent strings', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.456.78 Safari/537.36';
      const result = service.sanitizeUserAgent(ua);
      expect(result).toContain('Chrome/x.x.x');
      expect(result).not.toMatch(/\d+\.\d+\.\d+/);
    });

    it('should handle empty or null user agents', () => {
      expect(service.sanitizeUserAgent('')).toBe('[UNKNOWN]');
      expect(service.sanitizeUserAgent(null as any)).toBe('[UNKNOWN]');
    });

    it('should reject extremely long User-Agent strings (Alert #3)', () => {
      const longUA = 'A'.repeat(1001);
      const result = service.sanitizeUserAgent(longUA);
      expect(result).toBe('[USER_AGENT_TOO_LONG]');
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && npx jest test/unit/data-sanitizer.service.spec.ts`
Expected: 1 failure (the "extremely long" case should fail because it currently processes the string).

- [ ] **Step 3: Commit initial test**

```bash
git add backend/test/unit/data-sanitizer.service.spec.ts
git commit -m "test(security): add unit tests for DataSanitizerService including ReDoS case"
```

---

### Task 2: Implement ReDoS Mitigation

**Files:**
- Modify: `backend/src/common/filters/security/data-sanitizer.service.ts`

- [ ] **Step 1: Implement length check**

Update the `sanitizeUserAgent` method to include the guard clause.

```typescript
  /**
   * Sanitize user agent string
   */
  sanitizeUserAgent(userAgent: string): string {
    if (!userAgent) return '[UNKNOWN]';

    // Limit processing to reasonable length to prevent ReDoS (Alert #3)
    if (userAgent.length > 1000) {
      return '[USER_AGENT_TOO_LONG]';
    }

    // Keep browser info but remove detailed version numbers
    return userAgent.replace(/\d+\.\d+\.\d+/g, 'x.x.x');
  }
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && npx jest test/unit/data-sanitizer.service.spec.ts`
Expected: ALL PASS.

- [ ] **Step 3: Commit implementation**

```bash
git add backend/src/common/filters/security/data-sanitizer.service.ts
git commit -m "fix(security): implement length limit in sanitizeUserAgent to prevent ReDoS (Alert #3)"
```

---

### Task 3: Final Verification

**Files:**
- Modify: N/A (Verification)

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run linting**

Run: `cd backend && npm run lint`
Expected: No lint errors in modified files.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore(security): complete ReDoS fix for Alert #3"
```
