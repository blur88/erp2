# XSS Blocking — Security Fix (Issue #492)

**Date:** 2026-05-02
**Status:** Approved
**Closes:** #492 (CodeQL Alert #7 — Bad HTML filtering regexp)

## Problem

`patterns.ts` uses hand-rolled regexes for XSS detection. CodeQL Alert #7 flags this as
brittle — regex-based HTML filtering is bypassable via encoding tricks, mixed case, and
attribute injection vectors. The current behavior is also log-only; detected attacks are
never blocked.

## Solution

Replace the `CRITICAL_XSS_PATTERNS` regex array with `sanitize-html` (Approach 1).
Use a diff-check: if `sanitize-html` with zero allowed tags/attributes produces output
different from the input, the input contained dangerous HTML. When detected, throw a
`BadRequestException` (400) after logging. SQL and NoSQL patterns remain unchanged
(detection-only logging).

## Affected Files

| File | Change |
|------|--------|
| `backend/package.json` | Add `sanitize-html` + `@types/sanitize-html` |
| `backend/src/common/security/threat-detection/patterns.ts` | Remove `CRITICAL_XSS_PATTERNS` |
| `backend/src/common/security/threat-detection/detector.ts` | Replace regex XSS check with `sanitize-html` diff-check; throw on XSS |
| `backend/src/common/security/middleware/security-monitoring.middleware.ts` | Re-throw `BadRequestException` in catch block |
| `backend/src/common/security/threat-detection/detector.spec.ts` | New test file |

## Implementation Details

### `patterns.ts`
Remove `CRITICAL_XSS_PATTERNS`. Keep `CRITICAL_SQL_PATTERNS` and `CRITICAL_NOSQL_PATTERNS` unchanged.

### `detector.ts`

```ts
import sanitizeHtml from 'sanitize-html';
import { BadRequestException } from '@nestjs/common';

// In checkStringForThreats — throw after logging on XSS
if (this.detectXssThreats(input)) {
  this.logger.logThreatDetection({ threats: 'CRITICAL_XSS', ... });
  throw new BadRequestException('Request contains potentially malicious content');
}

// XSS detection via sanitize-html diff-check
private detectXssThreats(input: string): boolean {
  const sanitized = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  return sanitized !== input;
}
```

SQL/NoSQL detections continue to log-only (no throw).

### `security-monitoring.middleware.ts`

```ts
} catch (error) {
  if (error instanceof BadRequestException) {
    throw error;
  }
  this.logger.logError('Security monitoring error:', error);
  next();
}
```

## Test Cases (`detector.spec.ts`)

| Input | Expected |
|-------|----------|
| `hello world` | passes (no throw) |
| `<script>alert(1)</script>` | throws `BadRequestException` |
| `<img src=x onerror=alert(1)>` | throws `BadRequestException` |
| `javascript:alert(1)` | passes — plain text URI, not HTML; sanitize-html won't strip this |
| `&lt;script&gt;alert(1)&lt;/script&gt;` | passes — already encoded, safe |
| `SELECT * FROM users` (SQL) | logs only, does not throw |

> Note: `javascript:` URIs in plain text strings are not stripped by `sanitize-html`
> because they are not HTML. They are still caught by the existing SQL/NoSQL log path
> if they match those patterns. If blocking `javascript:` URIs in plain text is needed,
> a separate targeted check can be added in a follow-up.

## Out of Scope

- Sanitizing/stripping HTML from input (Option C) — not needed for ERP data
- Field-by-field allow-lists for rich text — no fields accept HTML in this app
- Blocking SQL/NoSQL detections — deferred, separate decision
