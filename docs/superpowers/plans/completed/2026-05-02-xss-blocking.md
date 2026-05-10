# XSS Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace brittle regex-based XSS detection in the security middleware with `sanitize-html` and block (400) requests that contain dangerous HTML.

**Architecture:** Install `sanitize-html`; replace `CRITICAL_XSS_PATTERNS` regex array with a library diff-check in `ThreatDetector`; throw `BadRequestException` on XSS hits; update the middleware catch block to re-throw security rejections rather than swallowing them.

**Tech Stack:** NestJS 11, `sanitize-html` + `@types/sanitize-html`, Jest

---

## File Map

| File | Action |
|------|--------|
| `backend/package.json` | Add `sanitize-html` to dependencies, `@types/sanitize-html` to devDependencies |
| `backend/src/common/security/threat-detection/patterns.ts` | Remove `CRITICAL_XSS_PATTERNS` array |
| `backend/src/common/security/threat-detection/detector.ts` | Replace regex XSS check with `sanitize-html` diff-check; throw `BadRequestException` on XSS |
| `backend/src/common/security/middleware/security-monitoring.middleware.ts` | Re-throw `BadRequestException` in catch block |
| `backend/src/common/security/threat-detection/detector.spec.ts` | New — unit tests for `ThreatDetector` |

---

## Task 1: Install `sanitize-html`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install the library**

Run from `backend/`:
```bash
npm install sanitize-html
npm install -D @types/sanitize-html
```

Expected: both packages appear in `package.json` and `package-lock.json`.

- [ ] **Step 2: Verify install**

```bash
node -e "require('sanitize-html'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(security): install sanitize-html for XSS detection"
```

---

## Task 2: Write failing tests for `ThreatDetector`

**Files:**
- Create: `backend/src/common/security/threat-detection/detector.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { BadRequestException } from '@nestjs/common';
import { ThreatDetector } from './detector';
import { SecurityLogger } from '../logging/security-logger';

const mockLogger = {
  logThreatDetection: jest.fn(),
  logError: jest.fn(),
} as unknown as SecurityLogger;

const mockReq = {
  path: '/test',
  method: 'POST',
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest' },
} as any;

describe('ThreatDetector', () => {
  let detector: ThreatDetector;

  beforeEach(() => {
    jest.clearAllMocks();
    detector = new ThreatDetector(mockLogger);
  });

  describe('XSS detection', () => {
    it('passes clean input without throwing', () => {
      expect(() =>
        detector.detectThreats({ name: 'Widget A' }, 'body', mockReq),
      ).not.toThrow();
    });

    it('blocks <script> tag', () => {
      expect(() =>
        detector.detectThreats(
          { name: '<script>alert(1)</script>' },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('logs before throwing on XSS', () => {
      expect(() =>
        detector.detectThreats(
          { name: '<script>alert(1)</script>' },
          'body',
          mockReq,
        ),
      ).toThrow();
      expect(mockLogger.logThreatDetection).toHaveBeenCalledWith(
        expect.objectContaining({ threats: expect.stringContaining('CRITICAL_XSS') }),
      );
    });

    it('blocks <img onerror> XSS vector', () => {
      expect(() =>
        detector.detectThreats(
          { note: '<img src=x onerror=alert(1)>' },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('passes already-encoded HTML entities', () => {
      expect(() =>
        detector.detectThreats(
          { note: '&lt;script&gt;alert(1)&lt;/script&gt;' },
          'body',
          mockReq,
        ),
      ).not.toThrow();
    });

    it('passes plain text with no HTML', () => {
      expect(() =>
        detector.detectThreats(
          { description: 'Price is 10 < 20 and cost > 5' },
          'body',
          mockReq,
        ),
      ).not.toThrow();
    });
  });

  describe('SQL injection detection (log-only, no throw)', () => {
    it('does not throw on SQL injection patterns', () => {
      expect(() =>
        detector.detectThreats(
          { search: "' OR 1=1" },
          'body',
          mockReq,
        ),
      ).not.toThrow();
    });

    it('logs SQL injection detection', () => {
      detector.detectThreats({ search: 'UNION SELECT * FROM users' }, 'body', mockReq);
      expect(mockLogger.logThreatDetection).toHaveBeenCalledWith(
        expect.objectContaining({ threats: expect.stringContaining('CRITICAL_SQL_INJECTION') }),
      );
    });
  });

  describe('nested object traversal', () => {
    it('detects XSS in nested object', () => {
      expect(() =>
        detector.detectThreats(
          { product: { description: '<script>alert(1)</script>' } },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });

    it('detects XSS in array element', () => {
      expect(() =>
        detector.detectThreats(
          { tags: ['safe', '<script>x</script>'] },
          'body',
          mockReq,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run from `backend/`:
```bash
npx jest src/common/security/threat-detection/detector.spec.ts --no-coverage
```

Expected: tests fail — most likely because `ThreatDetector` currently only logs and never throws.

---

## Task 3: Remove `CRITICAL_XSS_PATTERNS` from `patterns.ts`

**Files:**
- Modify: `backend/src/common/security/threat-detection/patterns.ts`

- [ ] **Step 1: Remove the XSS regex array**

Replace the entire file with:

```typescript
export class ThreatPatterns {
  // High-risk SQL injection patterns - avoid false positives
  static readonly CRITICAL_SQL_PATTERNS = [
    /\b(UNION\s+SELECT|DROP\s+TABLE|DELETE\s+FROM)\b/gim,
    /('\s*OR\s*'[^']*'\s*=\s*'|'\s*OR\s*1\s*=\s*1)/gim,
    /(;\s*(DROP|DELETE|UPDATE|INSERT|CREATE))\b/gim,
    /\b(EXEC|EXECUTE)\s*\(/gim,
  ];

  // NoSQL injection - specific operators only
  static readonly CRITICAL_NOSQL_PATTERNS = [
    /\$where.*function/gim,
    /\$regex.*\.\*/gim,
    /\$ne.*null/gim,
  ];
}
```

---

## Task 4: Update `detector.ts` — replace regex XSS check with `sanitize-html` + throw

**Files:**
- Modify: `backend/src/common/security/threat-detection/detector.ts`

- [ ] **Step 1: Rewrite `detector.ts`**

Replace the entire file with:

```typescript
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import sanitizeHtml from 'sanitize-html';
import { ThreatPatterns } from './patterns';
import { SecurityLogger } from '../logging/security-logger';

export class ThreatDetector {
  constructor(private readonly logger: SecurityLogger) {}

  detectThreats(obj: any, context: string, req: Request): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) =>
        this.detectThreats(item, `${context}[${index}]`, req),
      );
      return;
    }

    if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this.checkStringForThreats(key, `${context}.${key}(key)`, req);
        this.detectThreats(value, `${context}.${key}`, req);
      }
      return;
    }

    if (typeof obj === 'string') {
      this.checkStringForThreats(obj, context, req);
    }
  }

  private checkStringForThreats(input: string, context: string, req: Request): void {
    if (!input || typeof input !== 'string') {
      return;
    }

    // XSS: block immediately after logging
    if (this.detectXssThreats(input)) {
      this.logger.logThreatDetection({
        threats: 'CRITICAL_XSS',
        context,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        sample: input.substring(0, 200),
      });
      throw new BadRequestException('Request contains potentially malicious content');
    }

    const threats: string[] = [];

    if (this.detectSqlThreats(input)) {
      threats.push('CRITICAL_SQL_INJECTION');
    }

    if (this.detectNoSqlThreats(input)) {
      threats.push('CRITICAL_NOSQL_INJECTION');
    }

    if (threats.length > 0) {
      this.logger.logThreatDetection({
        threats: threats.join(', '),
        context,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        sample: input.substring(0, 200),
      });
    }
  }

  private detectXssThreats(input: string): boolean {
    const sanitized = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
    // sanitize-html encodes bare < and > as &lt;/&gt; in plain text (not HTML tags).
    // Allow that: only block when sanitized output is not simply the bracket-encoded input.
    return sanitized !== input && sanitized !== this.escapeAngleBrackets(input);
  }

  private escapeAngleBrackets(input: string): string {
    return input.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private detectSqlThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_SQL_PATTERNS.some(pattern => pattern.test(input));
  }

  private detectNoSqlThreats(input: string): boolean {
    return ThreatPatterns.CRITICAL_NOSQL_PATTERNS.some(pattern => pattern.test(input));
  }
}
```

- [ ] **Step 2: Run the tests and confirm they pass**

Run from `backend/`:
```bash
npx jest src/common/security/threat-detection/detector.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/security/threat-detection/patterns.ts \
        backend/src/common/security/threat-detection/detector.ts \
        backend/src/common/security/threat-detection/detector.spec.ts
git commit -m "fix(security): replace XSS regex with sanitize-html diff-check and block on detection (closes #492)"
```

---

## Task 5: Update middleware catch block

**Files:**
- Modify: `backend/src/common/security/middleware/security-monitoring.middleware.ts`

- [ ] **Step 1: Update the catch block to re-throw `BadRequestException`**

Replace lines 53-57 (the `catch` block):

```typescript
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.logError('Security monitoring error:', error);
      next();
    }
```

Also add the import at the top of the file (after the existing imports):

```typescript
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
```

(Replace the existing `@nestjs/common` import line — `Injectable` and `NestMiddleware` are already imported, just add `BadRequestException`.)

The full updated import line:
```typescript
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
```

- [ ] **Step 2: Run the full security module tests**

Run from `backend/`:
```bash
npx jest src/common/security --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Run the full backend test suite**

```bash
cd backend && npm run test
```

Expected: all tests pass. (This suite takes a few minutes — do not assume it is hung.)

- [ ] **Step 4: TypeScript check**

```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/security/middleware/security-monitoring.middleware.ts
git commit -m "fix(security): re-throw BadRequestException in security middleware catch block"
```

---

## Done

At this point:
- CodeQL Alert #7 is resolved — `sanitize-html` replaces the brittle regex
- XSS in any request body/query/param field returns a 400 and is logged
- SQL/NoSQL patterns continue to log-only
- Monitoring failures still fall through to `next()` without blocking requests
