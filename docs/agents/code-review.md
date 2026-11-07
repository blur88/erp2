# Code review convention

Use this convention when invoking `/code-review`. It overrides the `mattpocock-skills:code-review` skill's unconditional subagents and its baseline question when review state is already known. Use the `mattpocock-skills:code-review` skill's Standards smell baseline and originating issue for both delegated and inline reviews.

For external review subjects, follow the [external-file workflow](external-files.md). Review the repository completion record against its Git PR baseline as usual.

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

  The report records the mode and why. Inline rounds keep separate `## Standards` sections (CODING_STANDARDS.md + the `mattpocock-skills:code-review` skill's smell baseline) and `## Spec` sections (the issue), using the same sources as delegated rounds. Each section lists findings or says explicitly that none were found in the reviewed scope.
- **Working-tree round**: recorded as `<HEAD SHA> + working tree`, covering tracked changes and relevant untracked files. Save the full reviewed state as `review-round-<nn>.patch`, including untracked files, binary changes and file modes, and generate both patches with consistent options. Such a round never moves the last reviewed commit forward and is never the merge gate. After committing, compare the saved state with the new commit:
  - **Identical**: append a complete *committed* row for the new SHA that references the working-tree report and patch. Carry its findings forward; matching content doesn't resolve them.
  - **Different**: review the difference between the saved state and the new commit, including anything removed or reverted. The report names the saved state as the comparison base, not as the last reviewed commit. The last reviewed commit moves forward only after that review completes.
  - Leave the original working-tree row unchanged.
- **Pre-merge round**: may start only when HEAD == last reviewed commit. If not, first complete a committed review: a delta review if the baseline is still valid, or a full review after a scope reset.
  - Spec: a whole-PR pass over `<PR baseline>...<head>`, using inline mode only when the entire PR meets every inline criterion (including the line and file limits), otherwise using subagents. Record the final committed SHA assessed.
  - Standards: "No delta since round <nn>", unless the delta-round broadening rule applies.
  - Evidence check: say which claims were verified against the final SHA and record every gap explicitly. A gap doesn't waive a required check or make the PR merge-ready.
  - Doesn't move the last reviewed commit forward. Must be redone if HEAD moves.
- **Verification**: rounds stay incremental; the pre-merge round follows the final-head rule in [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-merge). Reproduce checks that depend on a clean checkout in a clean checkout, using a runner or by hand, or record them as verification gaps.

## State and reports

- **Scratch root**: one shared root for all worktrees. Resolve it using the absolute Git common directory and the shared local `review.scratchRoot` configuration described below. A standard checkout selects `<parent of git-common-dir>/.scratch/`; bare repositories and separate Git directories select `<git-common-dir>/review-scratch/`. Record the resolved absolute path.
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
  - verification re-run (commands + results using the [AGENTS.md report statuses](../../AGENTS.md#change-scoped-verification-required-before-merge)) and verification gaps.

  Then `## Standards`, `## Spec`, and an outcome (complete / partial / aborted), recorded separately from unresolved blocking findings.

## Citations

- Commit and PR bodies cite the ledger key and round numbers instead of reconstructing review evidence. A commit body can cite only rounds that already exist. Record post-commit verification in the ledger and cite it in the PR body; don't amend a commit just to add a citation, because that changes the reviewed SHA.

See #1728 for rules governing claims in commit and PR bodies.

## Merge gate

Merge with `gh pr merge <n> --match-head-commit <reviewed head>`, using the reviewed head recorded by the completed pre-merge round. Merge only when blocking findings are resolved and required verification has passed. If HEAD changes after that round, complete the pre-merge gate again for the new HEAD.

## Resolving shared scratch storage

Initialize from the primary checkout, or from the Git directory for a bare repository, before using linked worktrees. The command below reads shared local `review.scratchRoot` first. When absent, it selects the layout from the current primary checkout or bare repository and writes that setting. An unconfigured linked worktree fails with an instruction to initialize from the primary location; its metadata alone cannot distinguish a primary checkout from separate storage named .git. This is a local configuration write, shared by worktrees, not a read-only lookup.

Store only "../.scratch" or "review-scratch", relative to the common directory, so moving or copying the repository preserves the layout. Absolute settings from earlier versions are rejected. To change the layout or replace an old setting, run `git config --local --unset review.scratchRoot` from a repository location, initialize again from the primary location, and move existing review state to the resulting root before reusing it. Moving an individual linked worktree does not change the common root.

Run this subshell command and record its output. Errors return nonzero without exiting the calling shell; outside a repository it fails before reading or writing configuration.

```bash
(
  common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
  layout=$(git config --local --get review.scratchRoot || true)
  if [ -z "$layout" ]; then
    top=$(git rev-parse --show-toplevel 2>/dev/null || true)
    if [ -n "$top" ] && [ "$common" = "$top/.git" ] && [ -d "$top/.git" ]; then
      layout=../.scratch
    elif [ "$(git rev-parse --path-format=absolute --git-dir)" != "$common" ]; then
      echo 'Initialize review.scratchRoot from the primary checkout or bare repository first.' >&2
      exit 1
    else
      layout=review-scratch
    fi
    git config --local review.scratchRoot "$layout" || exit 1
  fi
  case "$layout" in
    ../.scratch) scratch="$(dirname "$common")/.scratch" ;;
    review-scratch) scratch="$common/review-scratch" ;;
    *) echo 'Unsupported review.scratchRoot; reset it from the primary location.' >&2; exit 1 ;;
  esac
  printf '%s\n' "$scratch"
)
```

## Capturing working-tree state

Use a temporary Git index outside the worktree, with `GIT_INDEX_FILE` scoped to each temporary-index command. Seed it with `git read-tree HEAD`, then use `git add -u -- .` from the repository root to capture the final tracked working-tree state, including deletions and modes. Explicitly add the selected relevant new paths (both staged additions and untracked files) to that index. Record that list in the report; exclude scratch artifacts. This captures final on-disk content, so resolve any partially staged state before saving if the intended review concerns different content.

Generate the saved patch with `git diff --cached --binary --full-index --no-ext-diff --no-textconv <PR-baseline> --` against that temporary index, writing it to the round's patch file. Remove the temporary index after saving. After committing, generate a second patch with `git diff --binary --full-index --no-ext-diff --no-textconv <same-PR-baseline> <new-commit> --`. Compare the two files byte for byte. Record the exact commands, full baseline and committed SHA, paths and comparison result. If different, reconstruct the saved state from its patch in a temporary checkout of the baseline and review the saved-to-committed difference, including removals and reversions.
