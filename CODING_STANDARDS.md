# Coding standards

The principles guide judgment. They are not mandatory rules, and a departure from them is not a blocking finding by itself. Every other section of this file is a mandatory repository standard.

## Principles

**Minimum Necessary Complexity: simplicity is the default; complexity requires justification.** This applies to application code and to engineering process alike.

1. **Build only what is needed.** Address actual requirements and demonstrated risks. Avoid speculative functionality, premature optimization, and unrelated scope expansion.
2. **Prefer the simplest correct solution.** Add complexity only when requirements or meaningful risks justify it.
3. **Reuse before introducing more.** Prefer suitable existing capabilities and one authoritative definition for each business rule that must stay consistent. Avoid harmful duplication of business knowledge; similar code that serves different behavior may stay separate. Do not force abstraction or reuse that adds coupling or complexity.
4. **Keep changes maintainable.** Prefer solutions that are easy to understand, test, modify, and troubleshoot, without unnecessary indirection.

When these conflict, decide in this order: correctness, security, reliability, and data integrity; then actual requirements, acceptance criteria, and existing contracts; then simplicity. Maintainability and future extensibility break remaining ties. Never trade the first tier for simplicity.

Adopting a principle does not make existing code non-compliant or justify unrelated refactoring.

## Rules

1. New shell scripts start with a short comment describing their purpose, plus the related issue reference where there is one. Scripts without a related issue do not need an issue number.
2. Extract nontrivial GitHub Actions `run:` logic (branching, failure handling, exit-status propagation) into testable scripts under `scripts/`, with tests under `scripts/__tests__/`.
3. Keep build-time-only code out of frontend runtime source directories unless there is a justified architectural reason.
4. Agent-facing documentation (AGENTS.md, CLAUDE.md, docs/agents/) must use tool-neutral instructions unless explicitly scoped to a specific agent or environment; link to the authoritative document instead of duplicating its requirements; keep session-specific validation evidence in PRs rather than reusable instructions; and place guidance pointers where agents encounter the relevant workflow or decision.
5. When adding or changing a guard that protects work before a destructive script operation, give each independently blocking condition its own test and assert that the protected work or ref is preserved. See the [worktree tests](https://github.com/blur88/erp2/blob/8dc76fca44b47b23867744d10208ceb9e583f3b7/scripts/__tests__/cleanup-merged-pr.test.js#L172-L200) from [PR #1938](https://github.com/blur88/erp2/pull/1938).

## Retrospectives and process changes

This applies to retrospectives and to any proposed permanent change to standards, procedures, skills, scripts, documentation, CI gates, or other engineering controls.

- The default outcome is no permanent change. "Learned, no change" is a valid result.
- When an adequate rule existed and was not followed, do not add another rule for the same requirement.
- Prefer clarifying ambiguous guidance and consolidating or removing redundant, overly specific, or obsolete rules. Keep incident-specific examples in the PR unless general wording would lose an important invariant.
- Take preventive action only when the root cause is understood and recurrence or the seriousness of actual or potential consequences justifies it; one serious incident can be enough. Weigh it against the maintenance cost, prefer improving an existing mechanism, and automate only when the benefits justify implementation, execution, and maintenance costs.
- In this repository, this section overrides conflicting skill defaults. The Matt Pocock `retro` skill's preference for building a check over writing a rule applies only after preventive action is justified.
- Agent recommendations become mandatory only when approved and merged through the normal PR process.

## Complexity in reviews

Unnecessary complexity is a blocking finding only when it is a material engineering problem or violates a mandatory rule. The finding must state the complexity the change introduces or materially worsens, why requirements, existing contracts, or demonstrated risks do not justify it, and its concrete or reasonably foreseeable impact on correctness, security, reliability, maintainability, testability, operational burden, or scope. Where practical, name a simpler viable alternative that keeps the required behavior.

- Potentially blocking: premature abstraction that materially adds coupling or maintenance cost; unneeded dependencies, infrastructure, or configuration that add material risk or burden; duplicated business rules that risk inconsistent behavior; speculative functionality or scope expansion; process or enforcement mechanisms with disproportionate cost.
- Not blocking on their own: minor simplifications, harmless duplication, alternatives with no material advantage, preferences about elegance, style, or patterns, hypothetical future improvements, and pre-existing complexity the change does not materially worsen.

Implementers justify material complexity; reviewers justify complexity findings. A proposed fix must not be more complex than the problem warrants. Once blocking findings are resolved and the applicable criteria and verification are satisfied, report no blocking findings instead of continuing to optimize; merge remains the owner's decision.

## Acceptance-criterion evidence in reviews

- Before assessment, collect the PR URL, reviewed head SHA, and applicable verification commands with their actual results and evidence links. For work without a PR, use the reviewed commit and available local results.
- Review every applicable acceptance criterion individually. For each criterion, distinguish **Implemented** (the relevant implementation exists), **Demonstrated** (the required behavior is supported by valid execution or test evidence), and **Unverified** (evidence is missing, incomplete, stale, or insufficient). An implemented criterion may still lack the evidence required to demonstrate it.
- Cite concrete evidence for each criterion, such as source locations, test results, CI links, or reproducible commands.
- A PR-body probe can demonstrate observed behavior, but required regression coverage stays **Unverified** until a committed spec passes on the reviewed head.
- A negative test proves the expected failure only when it fails for the intended reason. A setup error or a zero-test run does not demonstrate the expected behavior.
- Claims that motivate a behavioral change must cite the installed library implementation, directly relevant test evidence, or a focused reproducer. Mark unsupported claims as **Unverified**.
- When demonstrating a removal by execution, use baseline and candidate evidence. Describe source inspection as a diff, not as execution.
- Synthetic process waits do not demonstrate real CI behavior. A documentation link alone does not prove that an agent encounters an instruction at the correct workflow stage.
- For agent-facing documentation, verify when and how the intended reader encounters the instruction.
- Before reporting, refresh pending checks and confirm that the evidence still applies to the reviewed SHA. If the PR head moved, identify the reviewed SHA and flag which conclusions need reassessment.
- Never report complete acceptance-criterion coverage when required evidence is missing.
- When behavior depends on omitted fields, defaults, or coercion, verify it through `createGlobalValidationPipe()` directly or through an HTTP test that uses it; see [the stock adjustment DTO test](backend/src/modules/inventory/dto/stock-adjustment.dto.spec.ts).

### Runbook rehearsal evidence

This applies to [high-risk](docs/agents/skill-verification.md#risk-levels) changes that affect operational behavior, and wherever acceptance criteria require a rehearsal. It does not apply to documentation changes that leave operational behavior unchanged.

**During rehearsal**, extract and execute the applicable blocks directly from the runbook at the candidate commit, in documented order. When phases require continuity, use the same disposable stack for cutover, verification, and rollback. Distinguish mandatory steps from documented alternatives and identify which alternatives were exercised. You may use recorded setup and adapters around the blocks. Execute the documented blocks themselves to preserve their behavior. For heading-based extraction, see [`bashBlock()` in the PostgreSQL 19 runbook guard test](https://github.com/blur88/erp2/blob/895a9674cdcc612231a195092c22f5179d07b4ec/scripts/__tests__/postgres19-upgrade-runbook-guards.test.js#L25) from [PR #2087](https://github.com/blur88/erp2/pull/2087).

Record evidence as you run in one Markdown report in a temporary location both reviewers can access. Use the report as the source for the shared reviewer snapshot and PR evidence. Include the following details.

- For each verification command, record the command, working directory, revision, exit status, sanitized relevant output, and environment identity where applicable. Label follow-up probes separately from original execution results.
- Record the reviewed revision, the runbook checksum, the exact blocks executed and their checksums, and the disposable environment used for each phase.
- Record setup and adapters, including seed data, fixture databases, and how confirmations or root commands were supplied.

**During review**, inspect the actual rehearsal driver and execution transcript. Extract and compare the reviewed runbook blocks to establish block identity. Block identity alone is insufficient to demonstrate execution or required stack continuity. Verify documented order from the execution results and same-stack continuity from phase-specific environment evidence. Apply the **Unverified** definition above to gaps in required rehearsal evidence. Mark affected criteria **Unverified** when execution materially differs from the documented procedure, including when substitute scripts change its behavior.
