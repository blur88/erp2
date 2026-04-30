# Fix Security Alert #7 (Bad HTML Filtering Regexp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve CodeQL Alert #7 by replacing brittle regex-based XSS detection with robust structural analysis using `sanitize-html`.

**Architecture:** Refactor `ThreatDetector` to use `sanitize-html` for identifying high-risk HTML tags and attributes in input strings. This approach avoids the pitfalls of regex-based parsing and handles edge cases like malformed tags, newlines, and browser-specific parser behaviors.

**Tech Stack:** Node.js, NestJS, `sanitize-html`, Jest.

---

### Task 1: Add Dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install `sanitize-html` and its types**

Run: `npm install sanitize-html && npm install -D @types/sanitize-html` in the `backend` directory.

- [ ] **Step 2: Verify `package.json` update**

Check that `sanitize-html` is in `dependencies` and `@types/sanitize-html` is in `devDependencies`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add sanitize-html dependency for robust XSS detection"
```

---

### Task 2: Create Reproduction Test Case

**Files:**
- Create: `backend/test/unit/security/threat-detector.spec.ts`

- [ ] **Step 1: Write failing tests for current regex bypasses**

```typescript
import { ThreatDetector } from '../../../src/common/security/threat-detection/detector';
import { SecurityLogger } from '../../../src/common/security/logging/security-logger';

describe('ThreatDetector (XSS Bypass Reproduction)', () => {
  let detector: ThreatDetector;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = { logThreatDetection: jest.fn() };
    detector = new ThreatDetector(mockLogger as SecurityLogger);
  });

  it('should detect scripts with newlines (Currently fails with regex)', () => {
    const input = '<script>\nalert(1)\n</script>';
    // @ts-ignore - accessing private method for testing
    const result = detector.detectXssThreats(input);
    expect(result).toBe(true);
  });

  it('should detect scripts with spaces in end tag (CodeQL Alert #7)', () => {
    const input = '<script>alert(1)</script >';
    // @ts-ignore - accessing private method for testing
    const result = detector.detectXssThreats(input);
    expect(result).toBe(true);
  });

  it('should detect scripts with attributes in end tag (CodeQL Alert #7)', () => {
    const input = '<script>alert(1)</script foo="bar">';
    // @ts-ignore - accessing private method for testing
    const result = detector.detectXssThreats(input);
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test backend/test/unit/security/threat-detector.spec.ts`
Expected: Fails (as current regex misses these cases).

---

### Task 3: Implement Robust XSS Detection

**Files:**
- Modify: `backend/src/common/security/threat-detection/detector.ts`
- Modify: `backend/src/common/security/threat-detection/patterns.ts`

- [ ] **Step 1: Update `ThreatPatterns` to mark the regex as legacy/deprecated**

```typescript
// backend/src/common/security/threat-detection/patterns.ts

export class ThreatPatterns {
  /** @deprecated Use sanitize-html based detection in ThreatDetector instead */
  static readonly LEGACY_XSS_PATTERN = /<script[^>]*>.*?<\/script>/gim;
  
  // Keep others for now if they are used elsewhere or for layered defense
  static readonly CRITICAL_XSS_PATTERNS = [
    // We'll replace the first one with the more robust check
    /<iframe[^>]*src\s*=\s*["']?javascript:/gim,
    /javascript:\s*(alert|eval|document\.)/gim,
    /vbscript:\s*(alert|eval|document\.)/gim,
    /data:text\/html[^;]*;base64/gim,
    /on(load|error|click|focus|blur)\s*=\s*["']?[^"']*\beval\b/gim,
  ];
  // ... rest of patterns
}
```

- [ ] **Step 2: Refactor `ThreatDetector.detectXssThreats` to use `sanitize-html`**

```typescript
// backend/src/common/security/threat-detection/detector.ts
import * as sanitizeHtml from 'sanitize-html';
// ... imports

export class ThreatDetector {
  // ... constructor

  private detectXssThreats(input: string): boolean {
    if (!input || typeof input !== 'string') return false;

    // Layer 1: Dedicated sanitization check for complex HTML structures
    const sanitized = sanitizeHtml(input, {
      allowedTags: [], // Strip EVERYTHING
      allowedAttributes: {},
      disallowedTagsMode: 'recursiveEscape',
    });

    // If the library modified the string (stripped tags), it's a threat
    // Note: &lt; becomes < etc, so we compare decoded or just check for presence of tags
    if (sanitized !== input && (input.includes('<') || input.includes('>'))) {
        return true;
    }

    // Layer 2: Fallback for event handlers and other patterns not caught by stripping
    return ThreatPatterns.CRITICAL_XSS_PATTERNS.some(pattern => pattern.test(input));
  }
  // ...
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test backend/test/unit/security/threat-detector.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/common/security/threat-detection/
git commit -m "feat: implement robust XSS detection using sanitize-html"
```

---

### Task 4: Final Validation and Cleanup

**Files:**
- Modify: `backend/test/unit/security/threat-detector.spec.ts`

- [ ] **Step 1: Add more comprehensive test cases**

```typescript
  it('should not flag legitimate text', () => {
    const input = 'This is a normal sentence. 1 < 2 and 3 > 2.';
    // @ts-ignore
    const result = detector.detectXssThreats(input);
    expect(result).toBe(false);
  });

  it('should detect onerror handlers', () => {
    const input = '<img src=x onerror=alert(1)>';
    // @ts-ignore
    const result = detector.detectXssThreats(input);
    expect(result).toBe(true);
  });
```

- [ ] **Step 2: Run all backend tests**

Run: `npm test` in `backend` directory.

- [ ] **Step 3: Final Commit**

```bash
git add backend/test/unit/security/threat-detector.spec.ts
git commit -m "test: add comprehensive XSS detection tests"
```
