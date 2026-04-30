# Design Spec: Security Fix for CodeQL Alert #17

## Context
A security finding (#17) was identified by CodeQL in `frontend/src/pages/sales/SalesOrderSummary.tsx`. The finding is "Incomplete string escaping or encoding" (js/incomplete-sanitization).

## Vulnerability
The current code attempts to escape single quotes in `reportTitle` before embedding it into a Javascript `document.title` assignment:

```javascript
document.title = '${reportTitle.replace(/'/g, "\\'")}';
```

This is insufficient because it does not escape backslashes. If `reportTitle` contains a backslash at the end (e.g., `Title\`), the resulting JS becomes `document.title = 'Title\'';`, which causes a syntax error (the closing quote is escaped). More seriously, it could potentially be exploited for XSS if the title is influenced by user input.

## Proposed Solution
Use `JSON.stringify()` to safely embed the string. `JSON.stringify()` handles all necessary escaping for a valid Javascript string literal, including quotes and backslashes.

### Implementation Details
Change line 499 in `frontend/src/pages/sales/SalesOrderSummary.tsx`:

From:
```javascript
document.title = '${reportTitle.replace(/'/g, "\\'")}';
```

To:
```javascript
document.title = ${JSON.stringify(reportTitle)};
```

## Verification Plan
1. Create a GitHub issue documenting this finding and the proposed fix.
2. (Optional/Future) Implement the fix and verify that titles with quotes and backslashes no longer cause JS errors or XSS.

## Risk Assessment
Low. `JSON.stringify` is a standard and robust method for this purpose. It will change the output format slightly (it will include surrounding quotes), so the template literal surrounding the variable should be removed.

Current: `'${...}'`
New: `${JSON.stringify(...)}`
