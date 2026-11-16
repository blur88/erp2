# Coding standards

1. New shell scripts start with a short comment describing their purpose, plus the related issue reference where there is one. Scripts without a related issue do not need an issue number.
2. Extract nontrivial GitHub Actions `run:` logic (branching, failure handling, exit-status propagation) into testable scripts under `scripts/`, with tests under `scripts/__tests__/`.
3. Keep build-time-only code out of frontend runtime source directories unless there is a justified architectural reason.
4. Agent-facing documentation (AGENTS.md, CLAUDE.md, docs/agents/) must use tool-neutral instructions unless explicitly scoped to a specific agent or environment; link to the authoritative document instead of duplicating its requirements; keep session-specific validation evidence in PRs rather than reusable instructions; and place guidance pointers where agents encounter the relevant workflow or decision.

## Acceptance-criterion evidence in reviews

- Review every applicable acceptance criterion individually. For each criterion, distinguish **Implemented** (the relevant implementation exists), **Demonstrated** (the required behavior is supported by valid execution or test evidence), and **Unverified** (evidence is missing, incomplete, stale, or insufficient). An implemented criterion may still lack the evidence required to demonstrate it.
- Cite concrete evidence for each criterion, such as source locations, test results, CI links, or reproducible commands.
- Synthetic process waits do not demonstrate real CI behavior. A documentation link alone does not prove that an agent encounters an instruction at the correct workflow stage.
- For agent-facing documentation, verify when and how the intended reader encounters the instruction.
- Never report complete acceptance-criterion coverage when required evidence is missing.
