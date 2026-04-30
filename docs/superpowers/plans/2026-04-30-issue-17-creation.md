# Security Issue Creation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a GitHub issue for security finding #17 in the erp2 repository.

**Architecture:** Use the GitHub CLI (`gh`) to create an issue with the approved title and description.

**Tech Stack:** GitHub CLI

---

### Task 1: Create GitHub Issue

**Files:**
- N/A

- [x] **Step 1: Create the issue using `gh issue create`**

Run:
```bash
gh issue create --repo blur88/erp2 --title "Security: Incomplete string sanitization in SalesOrderSummary.tsx (CodeQL Alert #17)" --body "CodeQL identified a security vulnerability (js/incomplete-sanitization) in \`frontend/src/pages/sales/SalesOrderSummary.tsx\`.

### Vulnerability
In the PDF generation template, \`reportTitle\` is embedded into a \`<script>\` tag using an incomplete regex replace:
\`\`\`javascript
document.title = '\${reportTitle.replace(/'/g, \"\\\\'\")}';
\`\`\`
This fails to escape backslashes, which can lead to Javascript execution errors or potential XSS if the title is user-controlled.

### Remediation
Replace the manual escaping with \`JSON.stringify(reportTitle)\`. This is a more robust way to embed string data into a script block as it correctly handles quotes, backslashes, and other special characters.

### Proposed Change
\`\`\`javascript
document.title = \${JSON.stringify(reportTitle)};
\`\`\`

### Location
\`frontend/src/pages/sales/SalesOrderSummary.tsx\` line 499."
```

Expected: Issue created and URL returned.

- [x] **Step 2: Verify the issue exists**

Run: `gh issue list --repo blur88/erp2 --search "Security: Incomplete string sanitization"`
Expected: See the newly created issue.
