# Memory link validator verification — issue #1699

Verified on 2026-11-06 for [issue #1699](https://github.com/blur88/erp2/issues/1699).

## Scope

The implementation and memory cleanup live outside Git, in
`~/.claude/projects/-home-blur-erp2/memory/`. This document records their
verification; merging it does not install or distribute the external changes.

The external `validate-links.py` now validates absolute repository links and
backtick paths starting with `backend/`, `frontend/`, `docs/`, or `scripts/`.
It removes anchors, Markdown destination delimiters, prose punctuation, and
line/column suffixes before checking existence. It skips star globs and
placeholder paths and supports an exact-path allowlist with reasons.

The cleanup marks references to unavailable memories and the former frontend
testing document as unavailable. Historical or intentionally absent repository
paths have explicit allowlist entries.

## Evidence

Before cleanup, validation exited 1 with 12 missing repository path references
and 14 broken memory links. The final directory exits 0:

```text
OK — 113 memories, 143 links, 113 index rows; all resolve, no duplicates
```

All nine fixture checks and the live-directory check passed on 2026-11-06.

### Current regression check (added for #1710)

The persistent suite is beside the external validator at
`~/.claude/projects/-home-blur-erp2/memory/test_validate_links.py`.
Run `cd ~/.claude/projects/-home-blur-erp2/memory && python3 -m unittest test_validate_links`.
This is the current regression command, not a command run on 2026-11-06.
For environment requirements and live validation, follow the external
`project_memory_link_hygiene.md` note.

## Review and limits

The final standards and specification review reported no remaining findings.
This is local verification, not a CI check: the external memory directory and
validator are not available in a fresh checkout. The external memory work has
no application, database, or environment configuration effects. Frontend CI
also exposed reconciliation debounce callbacks running after test teardown;
the accompanying application cleanup and unmount regression tests address that
separate failure.
