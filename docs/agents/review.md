# Review guidance

## Review process

### Prepare the committed scope

Commit the intended changes on a feature branch before formal review. HEAD-based review cannot see uncommitted work. Resolve the fixed-point reference, confirm the intended changes appear in `git diff <fixed-point>...HEAD`, and record the reviewed HEAD SHA. Use the PR comparison baseline (normally the merge base) for “Before” and the final PR head SHA for “After”; intermediate implementation states belong in verification history.

Plan one formal, fresh-context, independent review of the intended committed SHA. Checks run inline in the implementing session, including the installed implement skill's review step (`/implement`), count as self-review. When a Haiku implementation has a fresh Opus review planned, that Opus session is the formal gate. If fixes change the SHA, apply the applicable re-review rules to the changed scope and record the new reviewed SHA.

Choose reviewer count from the actual committed diff:

- One fresh-context reviewer **may** cover both axes only when the diff is documentation-only under [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr) and `git diff --shortstat <fixed-point>...HEAD` reports at most 150 changed lines (insertions plus deletions across the entire diff).
- Otherwise run two fresh-context reviewers, one for Standards and one for Spec.

The 150-line ceiling is an initial policy choice, not a threshold established by review-cost evidence. The single-reviewer path runs separately from the installed code-review plugin, which always spawns two sub-agents. Keep distinct `Standards` and `Spec` headings even with one reviewer.

Record the fixed-point reference and its resolved SHA, reviewed HEAD SHA, shortstat, and reviewer count in the report, so the decision remains auditable after branches move.

### Verify independently

Formal reviewers start with fresh context rather than inheriting the implementing agent's conversation. Preserve the existing axes: Standards checks repository rules; Spec checks the originating requirements.

For changed documentation, check consequential factual claims against the repository or by running the relevant check. Trace script claims through implementation branches and existing tests, including applicable skip and failure paths. For example, cleanup switches to `main` and fast-forwards only under conditions permitted by the script; worktree restrictions and “rerun from main” skips matter.

For a consequential command claim, independently choose and run a case that would fail if the claim were wrong, rather than only repeating implementer- or orchestrator-supplied cases. In #1835, `package-lock.json` existed at both root and `backend/`, masking a path-resolution bug; checking root-only `AGENTS.md` from `backend/` exposed the missing `git ls-tree --full-tree` (fixed in PR #1863).

When instructions move, follow relevant references between `CLAUDE.md` and `AGENTS.md` to identify the rule's owner. Check surrounding heading hierarchy so adjacent sections such as Attribution retain their intended scope.

The Spec reviewer retrieves the original issue body, comments, and any referenced Agent Brief directly, using the read command in [issue-tracker.md](issue-tracker.md#conventions), rather than inheriting them from the implementer. State that retrieval in the report. Within the existing Spec report:

- Map every acceptance criterion to code, tests, or verification evidence at the reviewed SHA; identify missing evidence.
- Verify concrete inputs required by the brief through the agreed interface. For example, PR #1857 exercises the actual Markdown-link attribution form through `git commit`.
- Report findings separately from acceptance-evidence status. Zero findings does not establish that required evidence exists. Mark a criterion satisfied only when its required evidence is available; explicitly name pending PR or CI evidence. PR #1861's initial review had zero findings while PR mutation evidence was pending because no PR existed.

### Use gate evidence

Select gates from [AGENTS.md's change-scoped table](../../AGENTS.md#change-scoped-verification-required-before-pr). Reviewers may rely on implementer-supplied gate results only when the handoff records the gate's working directory, exact command, exit status, and concise output for the exact reviewed HEAD SHA, with clean trees in both the checkout where the gate ran and the reviewed checkout.

Neither reviewer routinely reruns a full gate with valid evidence. Either may rerun when there is a concrete reason to doubt applicability or result. Missing or stale evidence requires running the affected gate. Label evidence as supplied or rerun. Same-SHA evidence supports gate completion; it does not replace Standards or Spec verification or the independently chosen cases testing consequential command claims.

### Record the handoff

If an independent reviewer cannot run in the current session, record independent review as pending in the PR or handoff and name the fresh session that will run it. Label inline implementing-session review as self-review.

Provide the tested SHA or working-tree state and verification records with the fields specified in [Use gate evidence](#use-gate-evidence). When a nonstandard tool installation matters, include its path and version. Reviewers distinguish supplied evidence from checks they reran and describe availability in their own environment: a tool absent from a review sub-agent's PATH is not necessarily absent from the machine.

Before reporting completion, account for every acceptance criterion: record its evidence and whether it was verified locally, verified against a live PR or CI run, or is pending or blocked. Tie live evidence to the relevant PR head SHA. When authorized scope includes opening the PR or obtaining live evidence, carry those steps through and wait for the relevant CI result. Preserve pending states; see the [tracker check-evidence convention](issue-tracker.md#conventions). Surface conflicts with repository instructions early, naming the specific criterion and instruction.

Use this report shape within the existing two-axis report:

- Header: fixed-point reference and resolved SHA, reviewed HEAD SHA, shortstat, reviewer count.
- `Standards`: findings against repository standards, including the checks below; label supplied and rerun evidence.
- `Spec`: direct source retrieval, findings, then a separate per-criterion evidence/status mapping, including pending or blocked evidence.
- Handoff: gate records and remaining independent-review or PR/CI evidence, with the responsible fresh session where needed.

## Standards checks

### Extracted CI logic

When a PR extracts inline CI logic into a file, verify that repository verification rules cover that changed file correctly and that `AGENTS.md` routes edits to verification of the real CI step. In #1834, PR #1861 extracted the root `node:test` zero-case guard into `scripts/test-root-release-tooling.sh`: Bats exercised the guard against fixtures, while only the root release-tooling CI step ran the real 21-case suite. Commit `b7a1c065d` added that script to the root release-tooling gate.

### Failure-path assertions

A failure-path test must assert the expected failure status plus a diagnostic, error code, or outcome identifying the intended failure. For text diagnostics, the asserted output as a whole must identify both the tool and intended failure; no single line needs to repeat both. In PR #1849, missing-file specs asserted `*"LICENSE"*`, which appeared in every licence message; `*"does not exist"*` distinguished the intended failure from the outside-the-package case.

### Affected enforcement documentation

When an enforcement mechanism changes, inspect its activation instructions, scope, and documented limits, including directly relevant files outside the diff. In #1832, the PR attribution check made the hook header's local-only wording and related `AGENTS.md` wording stale; limiting review to the diff missed both. Attribution documentation cleanup remains separate in #1860.
