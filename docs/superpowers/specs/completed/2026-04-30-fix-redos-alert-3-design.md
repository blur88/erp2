# Design Spec: Fix ReDoS in DataSanitizerService (Alert #3)

## 1. Problem
CodeQL identified a potential **Polynomial Regular Expression Denial of Service (ReDoS)** vulnerability ([Alert #3](https://github.com/blur88/erp2/security/code-scanning/3)) in `backend/src/common/filters/security/data-sanitizer.service.ts`. The `sanitizeUserAgent` method applies the global regex `/\d+\.\d+\.\d+/g` to the `User-Agent` header, which is uncontrolled user input. Without a length limit, an extremely long malicious User-Agent string could cause the regex engine to consume excessive CPU resources.

## 2. Goals
- Resolve CodeQL Alert #3 (`js/polynomial-redos`).
- Prevent ReDoS attacks via the `User-Agent` header.
- Maintain existing version number sanitization functionality for legitimate requests.

## 3. Proposed Solution
Add a **length limit** to the `userAgent` input before processing it with the regular expression. This is consistent with other sanitization methods in the same service (e.g., `sanitizeErrorMessage` and `containsSensitiveInfo`).

## 4. Implementation Details
The `sanitizeUserAgent` method in `backend/src/common/filters/security/data-sanitizer.service.ts` will be updated to check the length of the input string.

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

A limit of **1000 characters** is sufficient for legitimate User-Agent strings while protecting against ReDoS.

## 5. Verification Plan
### 5.1 Automated Tests
Add unit tests to `backend/src/common/filters/security/data-sanitizer.service.spec.ts` (if it exists, otherwise create it) to verify:
- Legitimate User-Agent strings are sanitized correctly.
- Strings longer than 1000 characters return `[USER_AGENT_TOO_LONG]`.

### 5.2 Manual Verification
Verify that the fix addresses the core concern of CodeQL Alert #3 by restricting the input size for polynomial-time regex operations.
