# ReDoS Fix: DataSanitizerService.sanitizeUserAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Polynomial ReDoS vulnerability in `sanitizeUserAgent` by adding a 1000-char length guard and replacing the unbounded regex with bounded quantifiers.

**Architecture:** Two-layer defense — a length guard returns a placeholder immediately for oversized inputs, and the rewritten regex `/\d{1,10}\.\d{1,10}\.\d{1,10}/g` ensures linear-time matching for all inputs that pass the guard. Consistent with the existing pattern in `sanitizeErrorMessage`.

**Tech Stack:** NestJS 11, TypeScript, Jest

---

### Task 1: Write failing tests for the fixed behavior

**Files:**
- Create: `backend/src/common/filters/security/data-sanitizer.service.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { DataSanitizerService } from './data-sanitizer.service';

describe('DataSanitizerService', () => {
  let service: DataSanitizerService;

  beforeEach(() => {
    service = new DataSanitizerService();
  });

  describe('sanitizeUserAgent', () => {
    it('replaces version numbers in a normal UA string', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.6099 Safari/537.36';
      expect(service.sanitizeUserAgent(ua)).toBe(
        'Mozilla/x.x.x (Windows NT x.x.x; Win64; x64) AppleWebKit/x.x.x Chrome/x.x.x Safari/x.x.x',
      );
    });

    it('returns [UNKNOWN] for empty string', () => {
      expect(service.sanitizeUserAgent('')).toBe('[UNKNOWN]');
    });

    it('returns [UNKNOWN] for null/undefined', () => {
      expect(service.sanitizeUserAgent(null as any)).toBe('[UNKNOWN]');
      expect(service.sanitizeUserAgent(undefined as any)).toBe('[UNKNOWN]');
    });

    it('applies regex to a string of exactly 1000 chars', () => {
      // Build a 1000-char string that contains a version number at the end
      const padding = 'a'.repeat(990);
      const ua = padding + '1.2.3456'; // 990 + 9 = 999... pad to exactly 1000
      const ua1000 = ('a'.repeat(991) + '1.2.3').slice(0, 1000);
      const result = service.sanitizeUserAgent(ua1000);
      expect(result).not.toBe('[USER_AGENT_TOO_LONG]');
      expect(result).toContain('x.x.x');
    });

    it('returns [USER_AGENT_TOO_LONG] for a string of 1001 chars', () => {
      const ua = 'a'.repeat(1001);
      expect(service.sanitizeUserAgent(ua)).toBe('[USER_AGENT_TOO_LONG]');
    });

    it('returns [USER_AGENT_TOO_LONG] for a crafted ReDoS input without hanging', () => {
      const malicious = '1.' + '1'.repeat(500);
      const start = Date.now();
      const result = service.sanitizeUserAgent(malicious);
      const elapsed = Date.now() - start;
      expect(result).toBe('[USER_AGENT_TOO_LONG]');
      expect(elapsed).toBeLessThan(50); // must complete near-instantly
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/common/filters/security/data-sanitizer.service.spec.ts --no-coverage
```

Expected: several tests FAIL — `[USER_AGENT_TOO_LONG]` is not returned, and the ReDoS test may hang or timeout on the current implementation.

---

### Task 2: Apply the fix to sanitizeUserAgent

**Files:**
- Modify: `backend/src/common/filters/security/data-sanitizer.service.ts` (lines 28–33)

- [ ] **Step 1: Replace the sanitizeUserAgent method**

Open `backend/src/common/filters/security/data-sanitizer.service.ts` and replace the existing `sanitizeUserAgent` method:

```typescript
// BEFORE
sanitizeUserAgent(userAgent: string): string {
  if (!userAgent) return '[UNKNOWN]';
  // Keep browser info but remove detailed version numbers
  return userAgent.replace(/\d+\.\d+\.\d+/g, 'x.x.x');
}
```

```typescript
// AFTER
sanitizeUserAgent(userAgent: string): string {
  if (!userAgent) return '[UNKNOWN]';
  if (userAgent.length > 1000) return '[USER_AGENT_TOO_LONG]';
  return userAgent.replace(/\d{1,10}\.\d{1,10}\.\d{1,10}/g, 'x.x.x');
}
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd backend && npx jest src/common/filters/security/data-sanitizer.service.spec.ts --no-coverage
```

Expected output: all tests PASS, suite completes in well under 1 second.

- [ ] **Step 3: Run the full backend test suite to check for regressions**

```bash
cd backend && npm run test
```

Expected: no new failures.

- [ ] **Step 4: Commit**

```bash
git add backend/src/common/filters/security/data-sanitizer.service.ts \
        backend/src/common/filters/security/data-sanitizer.service.spec.ts
git commit -m "fix(security): resolve ReDoS in sanitizeUserAgent — bound regex quantifiers and add length guard (closes #493)"
```
