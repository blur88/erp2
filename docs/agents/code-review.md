# Code review convention

Use this convention when invoking `/code-review`. It overrides the `mattpocock-skills:code-review` skill's unconditional subagents and its baseline question when review state is already known. Use the `mattpocock-skills:code-review` skill's Standards smell baseline and originating issue for both delegated and inline reviews.

For external review subjects, follow the [external-file workflow](external-files.md). Review the repository completion record against its Git PR baseline as usual.

## Terms

- **PR baseline**: merge-base of HEAD with the PR's actual base branch (`main` by default; the real base for a stacked PR). Ask only when repository and PR metadata can't settle it unambiguously; a detached HEAD or unpushed base alone doesn't require a question. It stays fixed across normal rounds; a scope reset may set and record a new baseline.
- **Last reviewed commit**: the reviewed head of the latest valid, independent, complete round of kind *committed* with all required scope evidence after the latest scope reset. It's unset if there is none. It moves forward only when a round completes, never when one starts.

## Rounds

- **Initial round**: subagents (always), scope = full PR, delta base = N/A.
- **Delta round**: reviews changes since the last reviewed commit, plus the surrounding code needed to judge them, and checks that earlier findings were resolved. Broaden the scope when changes cross module boundaries, change contracts, or invalidate earlier conclusions. A full re-review every round isn't required.
- **Inline (proportional)** only if *all* of these hold; otherwise use subagents:
  - not the initial round;
  - at most 30 added + deleted lines across at most 3 files, with relevant untracked files counting toward both limits;
  - no contract change (API/DTO, schema/migration, auth, CI/workflow, dependency manifest);
  - doesn't invalidate earlier conclusions beyond resolving recorded findings.

  The reviewer runs in a different execution session from the implementer, with both identities recorded and independently verifiable. The report records the mode and why. Inline rounds keep separate `## Standards` sections (CODING_STANDARDS.md + the `mattpocock-skills:code-review` skill's smell baseline) and `## Spec` sections (the issue), using the same sources as delegated rounds. Each section lists findings or says explicitly that none were found in the reviewed scope.
- **Owner-requested re-review**: at an already-reviewed head, run the requested full-PR or named-delta scope even when the delta is empty. Cite the previous progression round and saved owner request in `rereview`. Preserve the last reviewed commit and its progression round.
- **Working-tree round**: recorded as `<HEAD SHA> + working tree`, covering tracked changes and relevant untracked files. Save the full reviewed state as `review-round-<nn>.patch`, including untracked files, binary changes and file modes, and generate both patches with consistent options. Such a round never moves the last reviewed commit forward and is never the merge gate. After committing, compare the saved state with the new commit:
  - **Identical**: append a complete *committed* row for the new SHA that references the working-tree report and patch. Carry its findings forward; matching content doesn't resolve them.
  - **Different**: review the difference between the saved state and the new commit, including anything removed or reverted. The report names the saved state as the comparison base, not as the last reviewed commit. The last reviewed commit moves forward only after that review completes.
  - Leave the original working-tree row unchanged.
- **Pre-merge round**: may start only when the PR is open and HEAD == last reviewed commit. If not, first complete a committed review: a delta review if the baseline is still valid, or a full review after a scope reset.
  - Spec: a whole-PR pass over `<PR baseline>...<head>`, using inline mode only when the entire PR meets every inline criterion (including the line and file limits), otherwise using subagents. Record the final committed SHA assessed.
  - Standards: "No delta since round <nn>", unless the delta-round broadening rule applies.
  - Evidence check: verify every PR-body claim (verification rows, demo output and review citations) against the ledger and saved evidence for the reviewed head. The PR body's verification table must cite the passing run/job for each CI command on the reviewed head, replacing each `pending` CI row with qualifying evidence under the [AGENTS.md evidence rules](../../AGENTS.md#change-scoped-verification-required-before-merge). Say which claims were verified against the final SHA and record every gap explicitly. A gap doesn't waive a required check or make the PR merge-ready. Incidents: #1719, PR #1752; #1725, PR #1757.
  - Doesn't move the last reviewed commit forward. Must be redone if HEAD moves.
- **Verification**: rounds stay incremental; the pre-merge round follows the final-head rule in [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-merge). Reproduce checks that depend on a clean checkout with `scripts/verify-in-clean-clone.sh` ([agent document pointer checks](../backend/testing.md#agent-document-pointer-checks)), or record them as verification gaps.

## Subagent briefs

Each subagent brief requires the reviewer to save its probe fixtures and output in the [evidence directory](#state-and-reports), using its resolved absolute path. The pre-merge Spec brief names the ledger as a source for review-citation claims in the PR body, alongside the saved evidence for the reviewed head. Incidents: #1724, PR #1756; #1725, PR #1757.

## Checker execution evidence

When the reviewed scope changes a checker, validator, hook, lint rule, CI gate, or executable review tooling, each reviewer executes documented probes against the reviewed state. Include valid inputs, invalid inputs, edge cases, and adversarial bypass attempts. Commands these review conventions tell agents to run, such as the [scratch-root command](#resolving-shared-scratch-storage), count as executable review tooling; prose-only edits to review conventions are reviewed as documentation. Choose cases from the changed behavior and its surrounding safeguards; explain what each case tests. Existing test results can support a probe only when its exact input and execution records are available.

Save each input or fixture and the actual combined stdout/stderr in the shared evidence directory above. Each reviewer report names its saved report path and includes a table with one row per execution:

`category | behavior / command | fixture path | expected result and exit status | actual result | actual exit status | output path`

Record the reviewed SHA or working-tree snapshot and execution environment needed to reproduce the commands. Preserve failing executions as well as successful ones; an empty output file is valid evidence of silence. Expected rejection with a nonzero exit can be a passing probe when it matches the expectation. A narrative claim, a proposed command, or an implementer-only run does not replace reviewer execution.

Before reporting coverage complete, verify that all four categories have executed rows, every fixture and output exists and matches the report, and expected versus actual behavior is assessed. Missing execution, category, fixture, output, exit status, or reproducible state is an explicit **coverage gap**. Record coverage as incomplete and the round as partial until the required probes are executed and saved; it cannot advance the last reviewed commit or satisfy the merge gate. An executed probe exposing a bug is a finding, not missing coverage; completion remains separate from merge readiness.

Delegated briefs must include these requirements and the resolved absolute evidence directory. Inline reviewers follow the same requirements. Pre-merge reports verify required probe evidence for the reviewed state and explicitly report any gaps. Controlled convention examples are documented in [checker review examples](checker-review-examples.md); they validate reporting behavior only and do not establish parent #1729's real-PR D4 demonstration.

## State and reports

- **Scratch root**: one shared root for all worktrees. Resolve it using the absolute Git common directory and the shared local `review.scratchRoot` configuration described below. A standard checkout selects `<parent of git-common-dir>/.scratch/`; bare repositories and separate Git directories select `<git-common-dir>/review-scratch/`. Record the resolved absolute path.
- **Key directory**, in order: `<scratch-root>/<issue-number>/`, then `<scratch-root>/pr-<pr-number>/`, then `<scratch-root>/branch-<sanitized-branch>/`. Keep the chosen directory for the whole sequence even if an issue or PR appears later, and record those identifiers in the ledger.
- **Evidence directory**: `<scratch-root>/<key>/evidence/` holds every probe fixture, probe output and test output, whether a reviewer or the implementer produced it. Capture test output with [`scripts/run-gate.mjs`](../../scripts/run-gate.mjs) (`node <repo>/scripts/run-gate.mjs <log> -- <command>`, from the command's directory); its log records the head SHA, tree state, argv, TAP counts and `EXIT=` status. Cite the footer after the last `--- end output ---`, where `EXIT=` is the final line; the command's own output can contain any text. The log is evidence against the command's output, not against a command that writes to the log file itself. Cleanup leaves it in place.
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

## Structured review evidence and four states

Every reviewer report names its saved path. Full-PR Spec reports enumerate every issue-body acceptance criterion, with a stable ID and verified file:line plus quoted evidence, or an explicit unmet reason. Delta reports retain touched criteria and every earlier unmet criterion. Every later report carries every earlier finding, including severity and disposition: open; resolved with file:line and saved evidence; or declined with saved owner authorization, decision-maker and justification. “No remaining findings” requires zero open rows.

Each report includes one fenced `review-state` JSON block. It belongs to the immutable report indexed by the ledger, not a competing ledger. Required fields:

- `scope`: `full PR`, `delta`, or `inherited`; `implementer`: execution session ID; `reviewers`: nonempty array of `{session, report}` with independent session IDs and saved report paths relative to the key directory.
- `requiredCriteria`: complete ordered array of stable issue-body criterion IDs, retained until a scope reset; `touchedCriteria`: IDs assessed by a delta; `criteria`: array of `{id, status: "met", file, line, quote}` or `{id, status: "unmet", reason}`. Committed quotes are checked against Git at the exact reviewed SHA; working-tree quotes use the captured tree in the saved snapshot manifest. The reviewer verifies the inventory against the issue and the meaning of the evidence; the checker cannot establish semantic completeness from self-reported IDs.
- `findings`: array of `{id, severity, blocking, status}`. Resolved rows add `location` (`file:line`) and `evidence` (saved artifact path). Declined rows add `authorization` (saved owner request), `decisionMaker`, and `justification`. Keep IDs, severity and blocking classification across rounds.
- `evidenceComplete`: boolean covering all required scope evidence, including executed checker probes where applicable. Missing required evidence makes a round partial. `checks`: array of `{command, status, evidence}` using AGENTS.md statuses and saved log paths. A reviewer verifies applicability, provenance, exact state and log contents; the checker rejects missing artifacts and failed exit evidence.
- For requested same-head reviews, `rereview: {round, authorization}` names the progression round and saved owner request.

`node scripts/check-review-ledger.mjs state <key-dir>` exposes four distinct states for each round and `lastReviewedCommit`:

1. `completion`: complete, partial or aborted for the declared scope; validation errors separately make the record invalid. Only valid independent complete committed records advance progression, even with findings.
2. `coverage: {scope, complete}`: complete delta coverage does not assert full-PR coverage. Byte-identical working-tree reconciliation is inherited coverage. For a committed difference review, add `inheritance: {round, comparison}` naming the valid full-PR working-tree round and saved binary/full-index diff from its captured tree to the committed head. The checker verifies the original patch against that tree and the comparison byte for byte; the independent reviewer assesses every difference and its effect on prior conclusions. Inherited working-tree-plus-difference coverage never becomes a reusable committed full-PR Spec result.
3. `reuseEligible`: a candidate full-PR committed result with complete criterion evidence, no blockers or unmet criteria, and passing saved checks. This does not authorize reuse: the fresh independent third-context check of unchanged SHA, baseline, criteria, conventions, evidence and current CI remains required by parent #1729 Q2/Q6. Until that check is implemented and evidenced, use a fresh independent whole-PR pre-merge Spec pass.
4. `mergeEligible`: a valid complete full-PR pre-merge record with no blockers, unmet criteria, missing evidence or failed/pending checks. The guarded merge still watches live required and advisory checks and matches the exact head.

Legacy reports without structured evidence remain preserved but fail validation and cannot advance progression or satisfy gates. The writer validates the entire ledger, so it cannot append a qualifying row to a legacy ledger. Preserve that sequence as historical evidence. Automatic migration and selection of an alternate sequence through the guarded PR commands are not supported; do not rewrite old reports to fabricate evidence. Existing legacy keys require a separately designed migration before those commands can use them. Scope resets invalidate earlier baseline coverage while retaining prior finding dispositions in subsequent reports.

## Writer commands

Use `node scripts/check-review-ledger.mjs` with these arguments:

- `<key-dir>` checks the ledger; reservations without rows are informational and fast subagent rounds produce warnings.
- `reserve <key-dir>` atomically reserves the next number, recording harness identity, native session/thread ID when exposed, hostname, PID, start time and full HEAD.
- `snapshot <key-dir> <round> <baseline> [selected-new-path ...]` saves the working-tree state and selected-file manifest before reviewers start; see [capturing working-tree state](#capturing-working-tree-state).
- `status <key-dir>` lists reservations without rows. It does not determine whether an owning session has ended.
- `report <key-dir> <round> <input.json>` assembles a report for a reserved round and prints the JSON accepted by `record`. It does not append a ledger row. See [assembling reports](#assembling-reports).
- `record <key-dir> <round> '<JSON>'` validates and appends a row. JSON keys are the ledger column names, excluding round, started and reviewed head, which come from the reservation. Working-tree rows add ` + working tree` to the reserved head. Writers serialize with <key-dir>/.record.lock; after a crashed writer, confirm it ended before removing that lock.
- `compare <saved-patch> <baseline> <commit>` compares bytes using the patch options below.
- `note <key-dir> <text>` appends a timestamped entry with full HEAD to <key-dir>/notes.md.

The Claude Code Bash PreToolUse hook conservatively checks commands mentioning `gh`, `pr` and `create`, including compound commands and quoted words. It blocks unless the checker passes and a complete committed row reviews HEAD. It resolves the configured shared scratch root, then the issue number in the branch name, otherwise `branch-<sanitized-branch>`. Other harnesses must run the checker themselves; this hook does not intercept their tools. The merge command checks the latest row and the live PR head, watches required checks and all checks, then passes the exact `--match-head-commit` to GitHub. Shell aliases or dynamically constructed commands are outside the create hook's command matching.

## Assembling reports

Use `report` after saving the independent reviewers' assessments and probe evidence. Supply a JSON file with `issue`, `pr` (use `N/A` when absent), `kind`, `mode`, and `state` using the [structured evidence format](#structured-review-evidence-and-four-states). Supply `PR baseline` for the first round; later rounds inherit it from the latest ledger row unless explicitly supplied. `delta base` defaults to the last reviewed commit for a delta, otherwise `N/A`.

The writer copies the reservation's round, start time, head, session and harness into the header, chooses a convention-compliant unused filename, and derives the working-tree file list from the saved snapshot. It carries every earlier finding; `state.findings` supplies additions or updates by ID, so an empty array removes nothing. Finding severity and blocking classification remain protected by the existing checker. It inherits the criterion inventory except after a scope reset. Full reports start every required criterion as unmet; delta reports retain touched and earlier-unmet IDs as unmet. Supply fresh `state.criteria` assessments and evidence to mark them met. The writer never upgrades copied evidence into a fresh assessment.

`outcome` defaults to `partial`; `state.evidenceComplete` defaults to false and `state.checks` to an empty array. Completion requires explicit `outcome: "complete"`, evidence completeness, and `standards` and `spec` assessment text, plus the existing checker's scope, evidence and independence validation. Supply implementing and reviewer execution identities and saved reviewer-report paths explicitly; the reservation identity identifies the reserving session, which may differ from either reviewer. The writer does not execute reviews or infer independence from the reservation.

Reports are created exclusively; existing files remain unchanged. The writer validates the assembled report as a candidate ledger row, rejects invalid existing ledgers and invalid candidate evidence, and removes only its newly generated file on validation failure. Successful output is the row JSON; append it using the existing `record` command once the report is ready to enter the immutable ledger. Verification output still comes from `run-gate`, and neither command changes the merge gate or reuse rules.

## Citations

- Commit and PR bodies cite the ledger key and round numbers instead of reconstructing review evidence. A commit body can cite only rounds that already exist. Record implementation responses and post-commit verification only in <key-dir>/notes.md in the key directory and cite it in the PR body; don't amend a commit just to add a citation, because that changes the reviewed SHA.

Run `node scripts/check-review-ledger.mjs <key-dir>` before citing rounds in a commit or PR body.

For claims in commit and PR bodies, follow the traceable-evidence rule in [coding standards](../../CODING_STANDARDS.md).

## Merge gate

The only merge path is `node scripts/check-review-ledger.mjs merge <n> --match-head-commit <reviewed head>`, using the reviewed head recorded by the completed pre-merge round. The head-match flag refuses a push that lands between review and merge. Merge only when blocking findings are resolved and required verification has passed. Immediately before merging, run `gh pr checks <n> --watch` and confirm it exits 0. Watch all checks: the PR body check is advisory, so `--required` skips it. Editing the PR body re-runs that check, so record that check's `startedAt` from `gh pr checks <n> --json name,startedAt` before the edit, and after it wait until a later run appears. If HEAD changes after that round, complete the pre-merge gate again for the new HEAD.

## Resolving shared scratch storage

Initialize from the primary checkout, or from the Git directory for a bare repository, before using linked worktrees. The script reads shared local `review.scratchRoot` first. When absent, it selects the layout from the current primary checkout or bare repository and writes that setting. An unconfigured linked worktree fails with an instruction to initialize from the primary location; its metadata alone cannot distinguish a primary checkout from separate storage named .git. This is a local configuration write, shared by worktrees, not a read-only lookup.

Store only "../.scratch" or "review-scratch", relative to the common directory, so moving or copying the repository preserves the layout. Absolute settings from earlier versions are rejected. To change the layout or replace an old setting, run `git config --local --unset review.scratchRoot` from a repository location, initialize again from the primary location, and move existing review state to the resulting root before reusing it. Moving an individual linked worktree does not change the common root.

Run the script and record its output. Errors return nonzero without exiting the calling shell; outside a repository it fails before reading or writing configuration.

Run [`scripts/review-scratch-root.sh`](../../scripts/review-scratch-root.sh).


## Capturing working-tree state

Before dispatching reviewers, reserve a round and run `node scripts/check-review-ledger.mjs snapshot <key-dir> <round> <PR-baseline> [selected-new-path ...]`. Paths are literal and relative to the repository root, even when invoked from a subdirectory; the key directory is relative to the calling directory. Select each relevant staged addition or untracked path explicitly. All tracked changes are captured automatically. Exclude scratch artifacts. Keep the working tree stable while capturing it.

The command checks the reservation's full HEAD, uses a temporary index seeded from HEAD and captures final on-disk content, including deletions, binary changes and modes. It leaves the real staging index unchanged, so resolve any partially staged state first if the intended review concerns different content. Paths outside the worktree, Git storage and paths containing the key directory are rejected. Git's normal ignored-file rules apply to selected additions.

Outputs are `review-round-<nn>.patch` and `review-round-<nn>.snapshot.json`, both created exclusively. Existing artifacts require a new reservation. The manifest records the full baseline, HEAD, captured tree, selected root-relative paths, new files, changed files and patch SHA-256. Copy the new-file list and patch link into the report. A failure cleans up the temporary index; a crash can leave a partial artifact, which must be preserved and followed by a new reservation.

The patch uses `git diff --cached --binary --full-index --no-ext-diff --no-textconv <PR-baseline> --` against that temporary index. After committing, run `node scripts/check-review-ledger.mjs compare <saved-patch> <same-PR-baseline> <new-commit>`, which generates the committed patch with the matching options and compares bytes. Record the full SHAs, paths and result. If different, reconstruct the saved state from its patch in a temporary checkout of the baseline and review the saved-to-committed difference, including removals and reversions.
