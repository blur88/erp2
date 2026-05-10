# Fix: Polynomial ReDoS in DataSanitizerService.sanitizeUserAgent

**Issue:** #493
**Severity:** High
**File:** `backend/src/common/filters/security/data-sanitizer.service.ts`

## Problem

`sanitizeUserAgent` applies the regex `/\d+\.\d+\.\d+/g` to an uncontrolled `User-Agent` header with no length limit. Unbounded `+` quantifiers on adjacent digit groups allow polynomial backtracking on crafted inputs (e.g. `"1." + "1".repeat(500)`), which can block the Node.js event loop.

## Fix

Two layers of defense, consistent with how the rest of the file handles similar risks:

### 1. Length guard (defense-in-depth)

If `userAgent.length > 1000`, return the placeholder `'[USER_AGENT_TOO_LONG]'` immediately — no regex applied. Real User-Agent strings are rarely over 500 chars. This mirrors the `length > 5000` guard already used in `sanitizeErrorMessage`.

### 2. Bounded regex (primary fix)

Replace `/\d+\.\d+\.\d+/g` with `/\d{1,10}\.\d{1,10}\.\d{1,10}/g`. Bounding the quantifiers makes matching linear time regardless of input, eliminating catastrophic backtracking. The cap of 10 digits per segment is generous for any real version number.

### Result

```ts
sanitizeUserAgent(userAgent: string): string {
  if (!userAgent) return '[UNKNOWN]';
  if (userAgent.length > 1000) return '[USER_AGENT_TOO_LONG]';
  return userAgent.replace(/\d{1,10}\.\d{1,10}\.\d{1,10}/g, 'x.x.x');
}
```

No changes to the method signature or callers.

## Testing

Add/extend the spec for `DataSanitizerService` to cover:

| Case | Expected |
|---|---|
| Normal UA string (e.g. `"Mozilla/5.0 Chrome/120.0.0"`) | Version numbers replaced with `x.x.x` |
| Empty string | `'[UNKNOWN]'` |
| String exactly 1000 chars | Regex applied (boundary check) |
| String 1001 chars | `'[USER_AGENT_TOO_LONG]'` |
| Crafted ReDoS input (`'1.' + '1'.repeat(500)`) | Returns `'[USER_AGENT_TOO_LONG]'` without hanging |

## Out of scope

- No changes to `sanitizePath`, `sanitizeIP`, `sanitizeErrorMessage`, `sanitizeStackTrace`, or `containsSensitiveInfo` — they are not affected by this issue.
