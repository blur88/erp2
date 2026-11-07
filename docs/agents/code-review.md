# Code review convention

Use this convention when invoking `/code-review`. It overrides the `mattpocock-skills:code-review` skill's unconditional subagents and its baseline question when review state is already known. Use the plugin's Standards smell baseline and originating issue for both delegated and inline reviews.

## Terms

- **PR baseline**: merge-base of HEAD with the PR's actual base branch (`main` by default; the real base for a stacked PR). Ask only when repository and PR metadata can't settle it unambiguously; a detached HEAD or unpushed base alone doesn't require a question. It stays fixed across normal rounds; a scope reset may set and record a new baseline.
- **Last reviewed commit**: the reviewed head of the latest *complete* round of kind *committed* after the latest scope reset. It's unset if there is none. It moves forward only when a round completes, never when one starts.

## Rounds

- **Initial round**: subagents (always), scope = full PR, delta base = N/A.
- **Delta round**: reviews changes since the last reviewed commit, plus the surrounding code needed to judge them, and checks that earlier findings were resolved. Broaden the scope when changes cross module boundaries, change contracts, or invalidate earlier conclusions. A full re-review every round isn't required.
- **Inline (proportional)** only if *all* of these hold; otherwise use subagents:
  - not the initial round;
  - at most 30 added + deleted lines across at most 3 files, with relevant untracked files counting toward both limits;
  - no contract change (API/DTO, schema/migration, auth, CI/workflow, dependency manifest);
  - doesn't invalidate earlier conclusions beyond resolving recorded findings.

  The report records the mode and why. Inline rounds keep separate `## Standards` sections (CODING_STANDARDS.md + the plugin's smell baseline) and `## Spec` sections (the issue), using the same sources as delegated rounds. Each section lists findings or says explicitly that none were found in the reviewed scope.
- **Working-tree round**: recorded as `<HEAD SHA> + working tree`, covering tracked changes and relevant untracked files. Save the full reviewed state as `review-round-<nn>.patch`, including untracked files, binary changes and file modes, and generate both patches with consistent options. Such a round never moves the last reviewed commit forward and is never the merge gate. After committing, compare the saved state with the new commit:
  - **Identical**: append a complete *committed* row for the new SHA that references the working-tree report and patch. Carry its findings forward; matching content doesn't resolve them.
  - **Different**: review the difference between the saved state and the new commit, including anything removed or reverted. The report names the saved state as the comparison base, not as the last reviewed commit. The last reviewed commit moves forward only after that review completes.
  - Leave the original working-tree row unchanged.
- **Pre-merge round**: may start only when HEAD == last reviewed commit. If not, first complete a committed review: a delta review if the baseline is still valid, or a full review after a scope reset.
  - Spec: a whole-PR pass over `<PR baseline>...<head>`, using inline mode only when the entire PR meets every inline criterion (including the line and file limits), otherwise using subagents. Record the final committed SHA assessed.
  - Standards: "No delta since round <nn>", unless the delta-round broadening rule applies.
  - Evidence check: say which claims were verified against the final SHA and record every gap explicitly. A gap doesn't waive a required check or make the PR merge-ready.
  - Doesn't move the last reviewed commit forward. Must be redone if HEAD moves.
- **Verification**: each round re-runs the checks its changes warrant; there's no blanket re-run of every recorded command. Required checks are always mandatory. Until #1725 lands, reproduce checks that depend on a clean checkout or reproducibility from a clean checkout by hand, or record them as verification gaps. Use the clean-checkout runner from #1725 when available.

## State and reports

- **Scratch root**: one shared root resolved from the absolute git common dir, so all worktrees share it. A standard checkout uses `<parent of git-common-dir>/.scratch/`; bare repos and separate git dirs use `<git-common-dir>/review-scratch/`. Record the resolved path. See the resolution command below.
- **Key directory**, in order: `<scratch-root>/<issue-number>/`, then `<scratch-root>/pr-<pr-number>/`, then `<scratch-root>/branch-<sanitized-branch>/`. Keep the chosen directory for the whole sequence even if an issue or PR appears later, and record those identifiers in the ledger.
- **Ledger**: reviews.md, an append-only Markdown table. Each row is immutable and is appended when the round completes or is declared partial/aborted, not when it starts. Columns:
  `round | kind (committed / working-tree / pre-merge / scope-reset) | started (ISO 8601) | PR baseline | delta base | reviewed head | mode | outcome | blocking findings | report`. Use N/A where a field doesn't apply.
- **Reusing state**: before reusing it, check that the report exists, the PR baseline matches, and the last reviewed commit is an ancestor of HEAD. If any check fails (for example after a rebase), append a *scope-reset* row, put the reason in its linked report, and treat earlier baseline state as invalid. Recover the last reviewed commit only from rows after the latest reset. Neither scope-reset nor pre-merge rows move the last reviewed commit forward.
- **Round numbers**: one increasing sequence per key across all kinds. Reserve a number at start with an atomically created marker `round-<nn>.started` holding the session identity, start time and head. Next number = 1 + the highest number found in ledger rows, markers and report metadata. Create the marker with exclusive creation (for example Python `open(path, "x")`); retry with the next number if it exists. Copy its start time and full HEAD SHA verbatim into the report and ledger. Numbers are never reused, and markers are kept permanently.
  - **Recovery**: a marker with no row may belong to a review still running. Append an *aborted* row only once the owning session is known to have ended; if that's uncertain, leave the reservation alone and take a new number.
  - **Session identity**: record `CLAUDE_CODE_SESSION_ID`, `CODEX_SESSION_ID` or `CODEX_THREAD_ID` when exposed, otherwise a generated UUID plus hostname and process ID. A missing process alone does not prove a session ended (hosts and process IDs can be reused); without reliable harness status or an explicit session-end record, leave its reservation alone and take a new number.
- **Completion**: complete = the review finished and its report was written, whatever it found. Partial or aborted rounds never move the last reviewed commit forward. Completion and merge readiness are separate: a complete round may still have unresolved blocking findings.
- **Report files**: `review-<sha>.md` for committed rounds; `review-round-<nn>.md` + `review-round-<nn>.patch` for working-tree rounds. If the committed filename already exists, use `review-<sha>-round-<nn>.md`; preserve the existing report. Pre-merge and scope-reset reports use `review-round-<nn>.md`. The ledger defines their order. Header fields:
  - issue / PR / key, round number, kind;
  - PR baseline, delta base (N/A on the initial round; the saved state for a post-commit difference review), reviewed head;
  - working tree included yes/no, plus the untracked files list and a patch link;
  - scope (full PR, delta, or broadened + reason) and mode (inline or subagents + reason);
  - verification re-run (commands + results) and verification gaps.

  Then `## Standards`, `## Spec`, and an outcome (complete / partial / aborted), recorded separately from unresolved blocking findings.

## Citations

- Commit and PR bodies cite the ledger key and round numbers instead of reconstructing review evidence. A commit body can cite only rounds that already exist. Record post-commit verification in the ledger and cite it in the PR body; don't amend a commit just to add a citation, because that changes the reviewed SHA.

See #1728 for rules governing claims in commit and PR bodies.

## Resolving shared scratch storage

Run from the checkout; record the printed absolute path in the ledger:

```bash
common=$(git rev-parse --path-format=absolute --git-common-dir)
owner=$(git --git-dir="$common" config --get core.worktree || true)
if [ "$(git --git-dir="$common" rev-parse --is-bare-repository)" = false ] &&
   [ "$(basename "$common")" = .git ] && [ -z "$owner" ] &&
   [ "$(git -C "$(dirname "$common")" rev-parse --show-toplevel 2>/dev/null)" = "$(dirname "$common")" ]; then
  scratch="$(dirname "$common")/.scratch"
else
  scratch="$common/review-scratch"
fi
printf '%s\n' "$scratch"
```

## Capturing working-tree state

Capture the complete reviewed state relative to the recorded PR baseline, including relevant untracked files, binary content and file modes. Generate the saved and committed patches using the same baseline and Git diff options: `--binary --full-index --no-ext-diff --no-textconv`. Record the exact capture commands, baseline and included paths in the report. Compare the patches after committing; if they differ, review the saved-to-committed difference, including removals and reversions. Keep scratch artifacts outside the captured state.
