# Spec: Fix Security Alert #7 (Bad HTML Filtering Regexp)

## 1. Problem
CodeQL identified a security vulnerability (Alert #7) in `backend/src/common/security/threat-detection/patterns.ts`. The regular expression used to detect `<script>` tags is brittle and can be bypassed using variations like `</script >` or `</script foo="bar">`. Additionally, it fails to match scripts containing newlines.

## 2. Goals
- Resolve CodeQL Alert #7 (js/bad-tag-filter).
- Improve XSS threat detection reliability.
- Replace brittle regex-based detection with structural HTML analysis.

## 3. Proposed Solution
Switch from custom regular expressions to the industry-standard `sanitize-html` library for XSS threat detection.

### 3.1 Architecture Changes
- **Dependency:** Add `sanitize-html` and `@types/sanitize-html` to the backend.
- **Service:** Update `ThreatDetector` in `backend/src/common/security/threat-detection/detector.ts`.

### 3.2 Implementation Details
The `detectXssThreats` method will be refactored:
- It will use `sanitize-html` to process the input.
- It will be configured to strip high-risk tags (`script`, `iframe`, `object`, `embed`, etc.) and event handlers (`on*` attributes).
- If the sanitized output differs from the input and contains HTML-like structures, a threat will be flagged.

### 3.3 Example Comparison
- **Current (Regex):** `/<script[^>]*>.*?<\/script>/gim` (Fails on newlines, fails on `</script >`)
- **New (Library):** Full HTML parsing. Correctly identifies `<script>\nalert(1)\n</script >` as a threat.

## 4. Verification Plan
### 4.1 Automated Tests
- Create a unit test for `ThreatDetector` with various bypass payloads:
  - `<script>alert(1)</script >`
  - `<script\n>alert(1)</script>`
  - `<iframe src="javascript:alert(1)">`
  - `<img src=x onerror=alert(1)>`
- Ensure legitimate text remains unaffected.

### 4.2 Manual Verification
- Verify the fix resolves the local CodeQL warnings (if applicable) or conceptually satisfies the `js/bad-tag-filter` rule requirements.
