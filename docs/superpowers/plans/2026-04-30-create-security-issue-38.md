# Create GitHub Issue for Path Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a GitHub issue to track the Path Injection vulnerability (Alert #38 and related).

**Architecture:** Use the `gh` CLI to create the issue with a detailed description and checklist.

**Tech Stack:** GitHub CLI (gh)

---

## Task 1: Create GitHub Issue

**Files:**
- N/A

- [x] **Step 1: Execute gh issue create**

Run the following command:

```bash
gh issue create \
  --title "Security: Harden Backup Module against Path Injection (Alerts #37, #38, #39, #40, #41)" \
  --body "## Description
CodeQL has identified multiple Path Injection vulnerabilities (CWE-22, CWE-23) in the backup module. These occur when user-provided filenames are used to construct filesystem paths, potentially allowing an attacker to access or overwrite files outside the intended directories.

### Affected Alerts
- Alert #37: \`backend/src/modules/backup/backup.service.ts:371\`
- Alert #38: \`backend/src/modules/backup/backup.service.ts:1009\`
- Alert #39: \`backend/src/modules/backup/backup.service.ts:1001\`
- Alert #40: \`backend/src/modules/backup/backup.service.ts:1023\`
- Alert #41: \`backend/src/modules/backup/backup.service.ts:1070\`

## Implementation Checklist

### 1. Controller Layer: Filename Sanitization
- [ ] Update \`backupUploadFileFilter\` in \`BackupController\` to strictly validate filenames (alphanumeric only, no \`..\`).
- [ ] Update \`diskStorage.filename\` to use system-generated unique names for temporary uploads.

### 2. Service Layer: Path Hardening
- [ ] Treat \`file.originalname\` as metadata only.
- [ ] Generate final archive filenames using system-controlled timestamps and UUIDs.
- [ ] Use \`path.resolve()\` and a boundary check (\`startsWith\`) to ensure all operations stay within the authorized \`archives/\` directory.

## Verification Plan
- [ ] **Unit Tests:** Verify filename rejection in \`backup.controller.spec.ts\`.
- [ ] **Service Tests:** Verify generated path construction and boundary checks in \`backup.service.spec.ts\`.
- [ ] **Manual:** Attempt upload with \`..\` segments and verify rejection.

---
*Reference: \`docs/superpowers/specs/2026-04-30-path-injection-fix-design.md\`*"
```

Expected: Issue created and URL returned.

- [x] **Step 2: Commit the plan**

```bash
git add docs/superpowers/plans/2026-04-30-create-security-issue-38.md
git commit -m "docs: add implementation plan for GitHub issue 38"
```
