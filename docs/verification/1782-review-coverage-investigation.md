# Local pre-merge review versus GitHub review coverage — issue #1782

Investigated on 2026-11-10 for [issue #1782](https://github.com/blur88/erp2/issues/1782).
Example: [PR #1781](https://github.com/blur88/erp2/pull/1781), reviewed head
`9bd7bf3216753c14f226f89fe99d7405cc187c85`, PR baseline
`75e7aea945c3c4ce9e70dffb6db78ae8e6938373`, merged as
`b48f0134ccf791197ccb0d6c028c67ae29b4c746` (an ancestor of `origin/main`, checked with
`git merge-base --is-ancestor 9bd7bf32… origin/main`).

## Scope

This is a read-only investigation. Nothing in this record changes, removes or bypasses
a review or merge safeguard. Every GitHub fact below comes from a `gh api` call run
on 2026-11-10; raw responses were not saved to the review evidence directory, so
re-run the listed commands to reproduce them. Local ledger facts come from the
gitignored key directory `.scratch/branch-chore-retro-1780-tooling/`, which exists
only on this machine. Overhead figures come from local harness session logs outside
Git (see [Overhead measurement](#6-overhead-measurement)).

## 1. Summary and answer

**No GitHub semantic review ran on PR #1781, so the local pre-merge Spec review did
not duplicate GitHub review.** The PR has zero review submissions, zero review
comments, no requested reviewers and a `null` review decision. The only GitHub apps
that ran checks were `github-actions` and `github-advanced-security` (CodeQL, 0
results). The only issue comment is the post-merge semantic-release notice. None of
these assesses the change against its originating requirements. Those requirements
were the owner's retro request recorded in the gitignored
`.scratch/branch-chore-retro-1780-tooling/scope.md` (AC1–AC3, plus external AC4).
No GitHub issue body held them, so no GitHub mechanism could have judged them.

There was duplicated review, but it was **local-versus-local**. Pre-merge round 03
repeated round 01's full Spec pass and four-category probes on a byte-identical tree.
The round 01 snapshot tree and the committed tree are both
`1a43acd37f7c746af192faba4920ab488927e00a`. The current convention required that
repeat. Strict reuse is not implemented ([#1766](https://github.com/blur88/erp2/issues/1766)).
Even when it is, round 01 is a working-tree round and round 02 is inherited coverage,
and the owner's Q8 decision excludes both from reuse. The rest of the overhead was
agent execution inefficiency, not policy:

- all three reviewers were full-history forks of the implementer session;
- 12 of the 27 model calls in the merge turn were sleep or wait polls, about 2.17M
  input tokens;
- `gh pr checks --watch` ran three times by hand before the guarded merge ran it again;
- the first guarded merge failed because the key directory was inferred incorrectly.

## 2. Mechanism inventory

All rows are for PR #1781 at `9bd7bf3216753c14f226f89fe99d7405cc187c85` unless stated.

| Mechanism | What it checks | Evidence for PR #1781 at the SHA |
|---|---|---|
| GitHub PR review submissions | Human or app reviews (APPROVE / COMMENT / REQUEST_CHANGES) | `gh api repos/blur88/erp2/pulls/1781/reviews` → `[]`. GraphQL `pullRequest(number:1781){reviewDecision reviews{totalCount} reviewRequests{totalCount}}` → `reviewDecision: null`, `reviews.totalCount: 0`, `reviewRequests.totalCount: 0`. `pulls/1781` → `requested_reviewers: []`, `requested_teams: []`. |
| GitHub PR review comments | Inline diff comments, including bot alert comments | `gh api repos/blur88/erp2/pulls/1781/comments` → `[]`. |
| Issue comments on the PR | Conversation comments | `gh api repos/blur88/erp2/issues/1781/comments` → 1 comment, `user.login: blur88`, `created_at: 2026-11-10T01:29:48Z`, after `merged_at: 2026-11-10T01:29:12Z`. Its text is the semantic-release "included in version 3.24.2" notice, not a review. |
| Copilot or other review apps | Automated semantic code review | None observed. The check suites list only the apps `github-actions` and `github-advanced-security` (row below). No reviews from any Copilot account on PR #1781. Across the 30 most recent merged PRs (`gh pr list --state merged --limit 30` plus `pulls/<n>/reviews` for each), the only reviewer is `github-advanced-security[bot]`, on #1780, #1776, #1775 and #1723. Those reviews are `COMMENTED` with empty bodies, which is how CodeQL posts alert comments. The ruleset has no Copilot review rule (row below). The repository has no `.github/copilot-instructions.md`, `CODEOWNERS`, `.coderabbit*` or `dependabot.yml`. |
| Check suites (all apps) | Which apps ran checks on the SHA | `gh api repos/blur88/erp2/commits/9bd7…/check-suites` → `total_count: 5`: four `github-actions` suites and one `github-advanced-security` suite (115728829070), all `completed/success`. |
| Commit statuses (legacy status API) | Third-party status contexts | `gh api repos/blur88/erp2/commits/9bd7…/status` → `total_count: 0`, `statuses: []`. GitHub reports `state: pending` when no statuses exist. |
| CI workflow `.github/workflows/ci.yml`, run [42729579275](https://github.com/blur88/erp2/actions/runs/42729579275) | Event `pull_request`, attempt 1, `success`. Six jobs, all `success`, `head_sha` = reviewed head: Root script tests (main-protection contract check plus `npm test`); Git hook integration tests (`sh scripts/tests/git-hooks.sh`); Backend (eslint, type-check, `type-check:spec`, unit, e2e, `test:redis`, `test:scripts`, `verify:baseline`, `verify:seeds`); Frontend (lint, type-check, `test:coverage`); Production Image – Fresh Database Migrations; Production Image – TLS Database Connection. | `gh api repos/blur88/erp2/actions/runs/42729579275/jobs`. Job IDs: [129543889893](https://github.com/blur88/erp2/actions/runs/42729579275/job/129543889893), [129543889565](https://github.com/blur88/erp2/actions/runs/42729579275/job/129543889565), [129543889599](https://github.com/blur88/erp2/actions/runs/42729579275/job/129543889599), [129543889496](https://github.com/blur88/erp2/actions/runs/42729579275/job/129543889496), [129543889262](https://github.com/blur88/erp2/actions/runs/42729579275/job/129543889262), [129543889541](https://github.com/blur88/erp2/actions/runs/42729579275/job/129543889541). Artifacts (`…/runs/42729579275/artifacts`): one, `frontend-coverage`. |
| PR body workflow `.github/workflows/pr-body.yml` | Only closing-reference syntax (`scripts/check-pr-body.cjs`, `invalidClosingLineNumbers`). The job is commented "Advisory until deliberately added to the repository ruleset". | Two runs at the SHA: [42729579601](https://github.com/blur88/erp2/actions/runs/42729579601) (00:36:23Z, PR opened) and [42735639369](https://github.com/blur88/erp2/actions/runs/42735639369) (01:25:06Z, after the body edit at 01:25:03Z). Both `success`, no artifacts. The edit time comes from GraphQL `userContentEdits`. |
| CodeQL default setup (`github-advanced-security`) | Security queries for actions, javascript-typescript and python | `gh api repos/blur88/erp2/code-scanning/default-setup` → `state: configured`, `query_suite: default`. Workflow run [42729574756](https://github.com/blur88/erp2/actions/runs/42729574756) (`dynamic/github-code-scanning/codeql`, three Analyze jobs `success`). Check run `CodeQL` [129544132914](https://github.com/blur88/erp2/runs/129544132914) `success`. `code-scanning/analyses?sha=9bd7…` filtered to `commit_sha` = reviewed head: three analyses on `refs/pull/1781/head`, each `results_count: 0`. Open alerts on `refs/pull/1781/head`: 0. |
| Secret scanning and push protection | Credential patterns on push | `gh api repos/blur88/erp2` → `secret_scanning: enabled`, `secret_scanning_push_protection: enabled`, `dependabot_security_updates: disabled`. No per-PR check run or review is exposed. |
| Repository ruleset "main protection" (15609777) | Merge protection on `refs/heads/main` | `gh api repos/blur88/erp2/rulesets/15609777` → `enforcement: active`. Rules: `required_status_checks` (strict) with Frontend, Backend, Production Image – Fresh Database Migrations, Git hook integration tests and Root script tests; `deletion`; `non_fast_forward`; `pull_request` with `required_approving_review_count: 0`, `require_code_owner_review: false`, `required_reviewers: []`. Bypass: `RepositoryRole` 5, `bypass_mode: pull_request`. CodeQL, PR body and the TLS job are **not** required. `gh api repos/blur88/erp2/rules/branches/main` returns the same four rules. Matches `.github/rulesets/main-protection.json`. |
| Classic branch protection | Legacy protection | `gh api repos/blur88/erp2/branches/main/protection` → HTTP 404 "Branch not protected". The ruleset is the only protection. |
| Webhooks | External services notified per event | `gh api repos/blur88/erp2/hooks` → `[]`. |
| App installations | Installed GitHub Apps | `gh api repos/blur88/erp2/installation` → HTTP 401 (needs an app JWT). `gh api /user/installations` → HTTP 403 (needs a GitHub App user token). This endpoint could not enumerate installations; the check-suite, review and comment endpoints above are the evidence. |
| Release workflow `.github/workflows/release.yml` | Runs on push to main after the merge; posts the release comment | No pre-merge coverage. |
| E2E leak check `.github/workflows/e2e-leakcheck.yml` | `schedule` / `workflow_dispatch` only | No run at this SHA (`actions/runs?head_sha=9bd7…` → 4 runs: CI, PR body ×2, CodeQL). |
| Local round 01 (working-tree) | Independent Standards and Spec, full-PR scope, probes | `.scratch/branch-chore-retro-1780-tooling/reviews.md` row 01; `review-round-01.md`, `standards01.md`, `spec01.md`, `review-round-01.patch`, `review-round-01.snapshot.json` (`tree: 1a43acd3…`). |
| Local round 02 (committed reconciliation) | Byte-identical snapshot-to-commit comparison; inherits round 01 | `reviews.md` row 02 references `review-round-01.md`. `node scripts/check-review-ledger.mjs state .scratch/branch-chore-retro-1780-tooling` → round 02 `coverage.scope: "inherited"`, `reuseEligible: false`. |
| Local round 03 (pre-merge) | Fresh whole-PR Spec, probes, PR-body and CI evidence audit | `reviews.md` row 03; `review-round-03.md`, `premerge03.md`, `evidence/premerge03/` (`audit.py`, `audit.log`, `ci-full.log`, probe logs). The same `state` command → round 03 `mergeEligible: true`. |
| Guarded merge `scripts/check-review-ledger.mjs merge` | Refuses unless the latest row is a complete, merge-eligible pre-merge row for the live PR head. Then watches required checks and all checks, then calls `gh pr merge` with the exact `--match-head-commit`. | `scripts/check-review-ledger.mjs` lines 290–302. The successful call is recorded in `notes.md` at 2026-11-10T01:29:19Z. |
| PR-create hook `scripts/review-pr-hook.mjs` | Claude Code `PreToolUse` gate requiring a complete committed row for HEAD | `.claude/settings.json`. Not applicable here: PR #1781 was opened from Codex (reservation `harness: codex`), and the hook does not intercept other harnesses (`docs/agents/code-review.md`, Writer commands). The implementer ran the checker manually before opening the PR. |

**No semantic review ran on GitHub.** The reviews and comments endpoints are empty,
the review decision is `null`, the ruleset requires 0 approvals, and every check
suite belongs to `github-actions` or `github-advanced-security`. None of the
workflows above reads the originating requirements.

## 3. Coverage comparison matrix

The obligations come from `docs/agents/code-review.md` (Rounds, Checker execution
evidence, Structured review evidence, Merge gate), `AGENTS.md` (Change-Scoped
Verification) and `CODING_STANDARDS.md`.

| Obligation | CI (`ci.yml`) | PR body workflow | CodeQL | Ruleset | GitHub reviews | Round 01 (WT) | Round 02 (inherited) | Round 03 (pre-merge) | Ledger checker + guarded merge |
|---|---|---|---|---|---|---|---|---|---|
| Standards review (`CODING_STANDARDS.md` + smell baseline) | gap: ESLint covers only backend/frontend app code; no prose-standard judgement | gap | gap: security queries only | gap | gap: none ran | covered (`standards01.md`) | partial: carries round 01's findings forward (inherited) | covered by reference: "No delta since round 02", as the convention allows | partial: checks report structure and finding carry-forward only (`scripts/review-state.mjs`) |
| Originating-spec / acceptance-criterion review | gap | gap | gap | gap | gap: none ran, and the AC lived only in local `scope.md` | covered: AC1–AC3 met with file:line and quotes, against the working tree | partial: inherited | covered; **duplicate** of round 01 on the identical tree `1a43acd3…` | partial: verifies that quotes exist at the SHA, not their meaning (`review-state.mjs` lines 23–31; the convention says "the checker cannot establish semantic completeness") |
| Required executable-tooling probes (4 categories) | partial: runs implementer-authored suites (`npm test` includes `git-fixture.test.js` etc.), not reviewer-designed adversarial probes | gap | gap | gap | gap | covered twice (`evidence/standards01/`, `evidence/spec01/`) | partial: inherited | covered; **duplicate** of round 01's categories on the identical tree (`evidence/premerge03/`) | partial: rejects missing or failed logs; `evidenceComplete` is self-reported |
| Exact-head verification (AGENTS.md gates) | covered: `npm test`, `git-hooks.sh` and `test:scripts` passed on the exact SHA; **duplicate** of the implementer's local final-head runs of the same commands (`root-final.log`, `hooks-final.log`, `backend-final.log`) | n/a | n/a | partial: requires 5 contexts, strict up-to-date; does not map AGENTS.md rows | gap | partial: the local check list recorded passes | partial | covered: audited CI jobs and saved logs; did not re-run full suites | partial: `--match-head-commit` plus live watches; does not determine applicable rows |
| PR-body evidence audit | gap | partial: closing-reference syntax only | gap | gap | gap | gap: the PR did not exist yet | gap | covered (`evidence/premerge03/audit.py`, `audit.log` exit 0) | gap: the merge script does not parse the PR body |
| Reviewer independence | n/a | n/a | n/a | gap: 0 approvals required | gap | partial: distinct thread IDs, but both reviewers are full-history forks of the implementer | n/a | partial: distinct thread ID, full-history fork | partial: only `reviewer.session !== implementer` string inequality (`review-state.mjs` line 16) |
| Merge protection | covered: required contexts | gap: advisory, not required | gap: not required | covered: PR required, required checks strict, no force-push or deletion | n/a | n/a | n/a | n/a | covered: exact-head match, pre-merge eligibility, watches all checks. Convention only: GitHub does not enforce it, and a direct `gh pr merge` would pass the ruleset. |

Duplicate work therefore sits in two places. Locally, round 03 repeated round 01's
Spec pass and probes. Between local and CI, both the implementer and CI executed the
same CI-eligible full suites. No GitHub mechanism duplicated a local Spec or Standards
obligation.

## 4. Why the existing reviews did or did not qualify for reuse

Read-only state check:
`node scripts/check-review-ledger.mjs state .scratch/branch-chore-retro-1780-tooling`
→ `errors: []`. Round 01: `coverage {scope: "full PR", complete: true}`,
`reuseEligible: false`. Round 02: `coverage {scope: "inherited", complete: true}`,
`reuseEligible: false`. Round 03: `mergeEligible: true`.
`lastReviewedCommit: 9bd7bf32…`. It also printed one warning: "round 02: subagent
report written within 60 s of marker".

- **Round 01 — working-tree snapshot (`75e7aea9… + working tree`).** It was a complete
  independent full-PR Standards and Spec review with probes. Both reviewers were
  spawned at 17:31:00Z and 17:31:09Z. The commit `9bd7bf32` was created at 17:31:40Z
  (`git log`, committer date `01:31:40+08:00`). It was therefore a working-tree round
  by construction. Under the convention, a working-tree round "never moves the last
  reviewed commit forward and is never the merge gate". `reuseEligible` requires
  `row.kind === 'committed'` (`scripts/review-state.mjs` line 60).
- **Round 02 — committed reconciliation.** `compare` confirmed the committed patch is
  byte-identical to the saved snapshot (the commit tree equals the snapshot tree
  `1a43acd3…`). The convention then appends a committed row that references the
  working-tree report, and the checker marks it `inherited`. The owner's Q8 decision
  ([#1729 comment](https://github.com/blur88/erp2/issues/1729#issuecomment-6732701963))
  and parent criterion R14 state that inherited coverage "never substitutes for an
  actual independent full-PR committed Spec pass at exact HEAD". Changing that needs
  "a separate explicit owner decision". It advanced the last reviewed commit, which
  is correct under Q7, but it cannot be reused.
- **No independent committed full-PR Spec review existed at the head.** So even a
  fully implemented #1766 would have rejected reuse for PR #1781. Separately, the
  convention says that until the third-context check (#1729 Q2/Q6) "is implemented
  and evidenced, use a fresh independent whole-PR pre-merge Spec pass"
  (`docs/agents/code-review.md`, Structured review evidence, state 3). The PR also
  failed the inline criteria: 9 files, +173/−36 (`git diff --stat 75e7aea9 9bd7bf32`),
  and it changes executable review tooling. Round 03 therefore had to be a subagent
  pass with probes.
- **Round 03 — fresh whole-PR pre-merge.** It completed with AC1–AC3 met, 0 findings
  and the PR-body/CI audit passing. It is the only round that satisfies the merge gate.
- **Ordering.** Had the commit preceded the round 01 dispatch, round 01 would have been
  a committed full-PR round, and therefore a reuse candidate once #1766 lands. It
  could not have been reused under the convention as it stands today.

## 5. Overlap with #1729, #1766 and #1772

- **[#1729](https://github.com/blur88/erp2/issues/1729) (parent).** Q2 and R15–R18
  already define the only approved relief: reuse of a complete independent committed
  full-PR Spec result, plus a fresh evidence check in a third execution context. Q8 and
  R14 forbid upgrading inherited coverage. The [#1736 retro comment](https://github.com/blur88/erp2/issues/1729)
  (item 2) first raised this pre-merge cost. R8 and Q6 require a "separate execution
  context" and independent identities. They do not say whether a reviewer forked
  with the implementer's full history counts as one. That is a gap this
  investigation found (see section 7).
- **[#1766](https://github.com/blur88/erp2/issues/1766)** implements reuse
  eligibility, the third-context evidence check (including "current exact-head CI"
  and "preserve PR-body evidence checks"), identity recording and rejection tests.
  This is where the PR #1781 pattern would be absorbed: a committed full-PR round
  followed by a lighter pre-merge evidence check. Its own comment records the same
  cost on #1773 (four rounds on one head). Two gaps found here belong in it as
  acceptance-criteria additions rather than a competing gate:
  - a rejection condition or recorded field for reviewers spawned with implementer
    history (subject to the owner decision);
  - validating PR-body CI rows from the check-runs API at the exact head.
- **[#1772](https://github.com/blur88/erp2/issues/1772)** is the D6 demonstration.
  PR #1781 **does not qualify**: it has no committed full-PR Spec round, only
  working-tree plus inherited coverage, which #1772 explicitly rejects. A qualifying
  PR has to commit before dispatching the full-PR reviewers.
- **Not covered by any of the three:**
  - the guarded merge's key-directory inference;
  - the documented manual `gh pr checks --watch` that duplicates the merge script;
  - agent polling and wait patterns;
  - double execution of CI-eligible suites (implementer locally and CI);
  - originating specs that exist only in local files.

## 6. Overhead measurement

**Source.** No Claude Code transcript covers PR #1781. Under
`~/.claude/projects/-home-blur-erp2/`, the only JSONL containing `9bd7bf32` is this
investigation's own session. The other files matching `1781` predate the PR and
contain no `pull/1781` reference. The reservation markers record `harness: codex`.
The implementer session is the Codex rollout
`~/.codex/sessions/2026/11/10/rollout-2026-11-10T00-40-06-01a1c12e-693a-74a0-b4ff-39e881f2e19c.jsonl`
(`originator: codex-tui`, 14 turns). Its `token_usage_record` and `token_count` events
supply the figures below. PR #1781's lifecycle is turns 8–11:

- turn 8: implementation, round 01 dispatch and commit;
- turn 9: rounds 01–02 recorded;
- turn 10: PR opened;
- turn 11: pre-merge and merge.

Turns 2–7 belong to earlier PR #1780 work and are excluded. Reviewer rollouts:
`…01a1c15d-024e…` (round 01 Standards), `…01a1c15d-25fd…` (round 01 Spec) and
`…01a1c30f-276d…` (round 03). Only tool names, commands and counts are reported here.

### Token usage (`usage.input_tokens`, `cached_input_tokens`)

| Context | Model calls | Input tokens | Cached input | 5-hour `used_percent` (start → end) |
|---|---|---|---|---|
| Turn 8 (implementation, round 01 dispatch) | 26 | 3,986,214 | 3,963,392 | 86 → 99 (earlier window) |
| Turn 9 (record rounds 01–02) | 6 | 998,114 | 841,856 | 0 → 1 |
| Turn 10 (open PR) | 8 | 1,392,187 | 1,386,240 | 2 → 4 |
| Turn 11 (pre-merge + merge) | 27 | 4,894,823 | 4,882,560 | 4 → 15 |
| Round 01 Standards reviewer | 8 | 1,389,651 | 1,366,016 | — |
| Round 01 Spec reviewer | 8 | 1,403,848 | 1,379,328 | — |
| Round 03 pre-merge reviewer | 12 | 2,423,700 | 2,396,160 | — |
| **Lifecycle total** | 95 | **16,488,537** | 16,215,552 | — |

Turn 11 plus the round 03 reviewer is 7,318,523 input tokens, which matches the
issue's "about 7.32 million". The 1% / 4% / 15% observations match the `rate_limits.primary`
(`window_minutes: 300`) values at the ends of turns 9, 10 and 11.

### Counts (turns 8–11 unless stated)

- **Subagent spawns: 3.** Turn 8: `retro_standards`, `retro_spec`. Turn 11:
  `retro_premerge`. Every `spawn_agent` call omitted `fork_turns`. The tool schema in
  the rollout says "Defaults to `all`", so each reviewer inherited the implementer's
  full history. Each reviewer rollout records `forked_from_id` = the implementer
  thread. The copied history comes before `subagent_history_start_ordinal` (422 for
  round 03). Every reviewer model call therefore carried about 160–211K input tokens:
  round 03 per-call input ranged 186,326–211,351. A reviewer's own work was small:
  round 03 made 8 `exec` and 2 `send_message` calls; round 01 made 6 + 1 and 7 + 0.
- **Mid-review coordination:** 6 `send_message` calls to reviewers in turns 8 and 11.
- **Polling in turn 11:** 5 `sleep` (10–20 s), 4 `wait_agent` (10 s timeout) and 3
  `ls .scratch/…premerge03*` checks. These are 12 of the 27 model calls and
  2,173,944 input tokens: 905,677 after `sleep`, 724,646 after `wait_agent`, 543,621
  after `ls` (each usage record attributed to the preceding tool call). Turn 8
  added 2 `sleep` and 1 `wait_agent` (478K).
- **`gh pr checks`:**
  - turn 10: 1 plain;
  - turn 11: 1 plain, 2 `--json name,startedAt[…]` (before and after the body edit,
    both required by the merge-gate `startedAt` rule), 3 manual `--watch` (01:25:21
    via `run-gate`, 01:28:36, 01:29:03), then 2 more inside the successful guarded
    merge (`--required --watch` and `--watch`).

  The first guarded merge attempt (01:28:36) was refused before its watches.
  `gh run view` ran once (01:24:48).
- **Repeated evidence assembly:**
  - The PR body was written in turn 10 with pending CI rows, then edited in turn 11 to
    cite CI jobs. The edit re-ran the PR body workflow (run 42735639369), which then
    had to be awaited.
  - CI evidence was fetched by the implementer (`evidence/ci-final.json`, checks
    JSON) and again by the reviewer (`evidence/ci-live-premerge.json`,
    `evidence/premerge03/ci-full.log`).
  - Round 01's report assembly failed once and was redone (`notes.md`,
    2026-11-10T00:34:31Z correction).
- **Duplicated review and probe runs:** 3 independent probe sets (standards01,
  spec01, premerge03) and 2 Spec passes, all on the same tree `1a43acd3…`. The full
  suites ran locally by the implementer and in CI, on the same SHA.
- **Failed merge retry:** the guarded merge inferred the key `1780` from the branch
  `chore/retro-1780-tooling` (`keyDirectory()`, `scripts/check-review-ledger.mjs`
  lines 278–284), not the existing `branch-chore-retro-1780-tooling`. The workaround
  was the `.scratch/1780` symlink (`notes.md`, 01:29:03Z).

### Policy-required versus execution inefficiency

| Item | Classification | Basis |
|---|---|---|
| Round 03 fresh whole-PR Spec plus probes | Policy-required | No reusable committed round existed (section 4); reuse is not implemented; probes are required for executable review tooling. |
| Two round 01 reviewers (Standards, Spec) | Policy-required | "Initial round: subagents (always)". |
| PR-body CI row edit, and waiting for the re-run body check | Policy-required as written | Merge gate: replace `pending` CI rows; record `startedAt` and wait for a later run. |
| Full-history forks (about 160–211K tokens per reviewer call) | Inefficiency, and an independence concern | `fork_turns` defaulted to `all`; the convention requires only a separate execution context. |
| Sleep, wait and `ls` polling loops (12 calls, about 2.17M tokens) | Inefficiency | One blocking wait with a timeout sized to the review would replace them. |
| 3 manual `gh pr checks --watch` | Partly policy text, partly inefficiency | The convention says to run `--watch` immediately before merging; the merge script already runs it. The extra runs at 01:25:21 and 01:28:36 were not required. |
| Dispatching round 01 40 s before committing | Inefficiency under a future #1766; neutral today | It turned a would-be committed round into working-tree plus inherited coverage. |
| Implementer local runs of CI-eligible suites, plus CI | Unclear: owner decision | AGENTS.md lets CI supply these commands; the one-executor rule ("Verification ownership") suggests one executor per candidate state. |
| Key-inference merge failure | Tooling defect | `keyDirectory()` prefers any branch number over an existing key directory. |

**Not determinable:**

- the quota formula linking tokens to `used_percent` (only `plan_type`, the percent
  and the window are logged);
- other account-wide usage during the window;
- what a fresh-context reviewer would actually cost, since none was run. The
  implementer's first call in turn 2 used 20,548 input tokens, which suggests a fresh
  start is roughly one tenth of the inherited 186K, but that is an inference, not a
  measurement.

### Narrow improvement proposals

1. Spawn reviewers without parent history (`fork_turns: "none"` in Codex; a non-fork
   subagent in Claude Code) with a self-contained brief naming the key directory,
   baseline, head, criteria source and evidence directory.
2. Wait for a reviewer with one blocking wait sized to the expected duration, not
   sleep, wait or `ls` loops.
3. Commit before dispatching full-PR reviewers when the content is ready, so the round
   is committed.
4. Let the guarded merge's own watches satisfy the "watch immediately before merging"
   step.
5. Resolve the merge key directory from an explicit argument or the existing key
   directory.

## 7. Recommendations

### Evidence that should satisfy each obligation

| Obligation | Should be satisfied by | Fresh work required when |
|---|---|---|
| Standards review | Local independent Standards report (committed or reconciled), carried by "No delta since round nn" at pre-merge | HEAD moves with a non-empty delta, or the delta-round broadening rule applies |
| Originating-spec / AC review | Local independent full-PR Spec report with a verified criterion table. No GitHub mechanism currently supplies this, and none can while the AC live only in local files. | Always fresh at pre-merge until #1766. After #1766, fresh unless a committed full-PR round meets R15–R18 at the exact head, baseline, criteria and conventions. |
| Executable-tooling probes | Reviewer-executed four-category probes saved in the evidence directory. CI suites support but do not replace them (convention: "Existing test results can support a probe only when its exact input and execution records are available"). | The reviewed tree changes. Byte-identical trees (e.g. `1a43acd3…`) are a candidate for reuse under #1766 only if the owner widens Q8. |
| Exact-head verification | GitHub check runs on the exact SHA for CI-eligible commands (`commits/<sha>/check-runs`, `conclusion: success`, `head_sha` match); local `run-gate` logs only for local-only commands and clean-clone checks | Any new commit |
| PR-body evidence audit | The independent pre-merge evidence check (round 03 today; the third-context check under #1766), compared against check-runs API data | Any body edit or new commit |
| Reviewer independence | Distinct execution context recorded with session IDs, plus how it was spawned (fresh versus forked) — see owner decision 1 | Always recorded per round |
| Merge protection | Ruleset (required contexts, strict) plus `check-review-ledger.mjs merge` with `--match-head-commit` | Always |

The guarded merge should validate that evidence as follows. Keep today's checks:
latest pre-merge row `mergeEligible`, head match, watches of required and all checks.
Add only mechanical checks that do not weaken anything:

1. Resolve the key directory unambiguously (explicit argument, or refuse when several
   candidate directories exist).
2. Confirm that every PR-body CI row cites a check run whose `head_sha` equals the
   merged head and whose conclusion is `success`.
3. After #1766, accept a reuse record only with its three distinct identities and the
   third-context evidence check, as #1766 already specifies.

### Owner policy decisions

**Resolved on 2026-11-10.** The owner settled these in the [#1782 owner decisions
1782-Q1 to 1782-Q12](https://github.com/blur88/erp2/issues/1729#issuecomment-6758647887)
on #1729. #1729's body is the authoritative specification: it amends R5, R8, R10,
R15 and R17–R19 and adds R20–R23. The questions below are kept as originally posed.
The table that follows them records each outcome and where it differs from this
record's proposal.

1. Whether a reviewer spawned with the implementer's full history counts as an
   independent "separate execution context" (Q6, R8, R18). If not, require and record
   fresh-context spawns and have #1766 reject forked reviewers.
2. Whether a working-tree round whose snapshot tree is byte-identical to the committed
   tree may count as a committed full-PR Spec result for Q2 reuse. Q8 currently
   forbids this and reserves it for an explicit owner decision.
3. Whether CI may be the sole executor of CI-eligible full suites. The PR body would
   carry `pending` rows until CI completes, and the implementer would skip duplicate
   local runs.
4. Whether the guarded merge may verify CI evidence directly from the check-runs API
   instead of requiring a hand edit of the PR body, which re-triggers the PR body
   check and its wait.
5. Whether an originating spec must be GitHub-visible (an issue body or PR body) when
   no issue exists. PR #1781's AC existed only in gitignored `scope.md`.
6. Whether a GitHub-side review mechanism (e.g. Copilot code review, required
   approvals) is wanted at all. None is configured. Even if adopted, it could at most
   add Standards-style findings. It could not satisfy Spec review without
   GitHub-visible AC, independence evidence or probe execution. It should not replace
   any local obligation.
7. Whether the advisory PR body and CodeQL checks should become required contexts in
   the ruleset (today they rely on the all-checks watch in the merge script).

| Question | Decision | Difference from this record's proposal |
|---|---|---|
| 1. Forked reviewer independence | 1782-Q1: only a fresh reviewer context counts. Rounds record context ID, launch method and fresh/forked status, and missing evidence fails closed. | Stricter than proposed: it applies to inline, committed and pre-merge reuse alike, not only to #1766's reuse check. |
| 2. Byte-identical working-tree round as committed | 1782-Q2: Q8 unchanged. A review meant for reuse starts after the commit (R20); opening the PR need not precede it. | The record left both options open. The owner chose ordering over widening Q8. |
| 3. CI as sole executor | 1782-Q7: CI is the default full-suite executor. Local full runs are recorded exceptions. | Accepted with explicit exceptions: diagnosis, environment problems, missing coverage. |
| 4. CI evidence from the API | 1782-Q3, Q9, Q10: the merge gate verifies live from GitHub. Required checks come from the ruleset API, the latest run per SHA, name and app is authoritative, and results are saved as merge evidence. CI rows may stay `pending` in the PR body. | Broader than proposed: dynamic ruleset discovery, latest-run selection and step-level evidence were added. PR-body CI rows are not edited at all, rather than validated. |
| 5. GitHub-visible spec | 1782-Q4, Q11: the issue body or, with no issue, a draft PR body is the authoritative criteria source. PR-creation validation is separated from merge validation. | Adds the draft-PR path and the change to the #1731 creation gate. |
| 6. GitHub-side review | 1782-Q5: none adopted. | As proposed. |
| 7. Required PR-body and CodeQL checks | 1782-Q6, Q12: both become required. The PR-body failure is demonstrated with a malformed closing reference. CodeQL blocking stays **partially verified** until a genuine CodeQL-blocked state is observed. | The CodeQL demonstration is partial by decision, with no deliberately vulnerable code. It is tracked in #1784 and is not a #1729 demonstration (#1729 keeps D1–D6). |

The key-directory fix (implementation-ready change 1 below) was also settled as
1782-Q8. Selection is deterministic, and the PR #1781 two-directory case must refuse
without an explicit `--key-dir`. That replaces "prefer an existing directory".

### Implementation-ready changes

These preserve every existing safeguard.

1. Fix the merge key resolution in `scripts/check-review-ledger.mjs` (`keyDirectory()`):
   accept an explicit key directory, or prefer an existing directory and refuse when
   more than one candidate exists. Add a regression for branch names like
   `chore/retro-1780-tooling`.
2. Reviewer-brief guidance in `docs/agents/code-review.md` (Subagent briefs): spawn
   with no parent history and a self-contained brief. This strengthens independence
   and does not relax anything.
3. Agent guidance: wait for reviewers with a single blocking wait. Do not sleep or
   poll the filesystem.
4. Agent guidance: commit before dispatching full-PR reviewers when the content is
   final. Use a working-tree round only for genuinely uncommitted fixes.
5. Clarify the merge-gate text: the guarded merge's own `gh pr checks <n> --watch`
   satisfies "immediately before merging". Keep the `startedAt` rule after body edits.
6. A small evidence-capture helper that saves `check-runs`, `check-suites`, `reviews`
   and PR JSON for the exact head into the evidence directory once. Implementer and
   reviewer would cite the same files instead of re-fetching.

## 8. Follow-ups

Created or updated on 2026-11-10 after the owner decisions. Implementation is pending
in every item, and none is closed by the #1782 documentation PR.

| Item | Scope | Dependencies |
|---|---|---|
| [#1729](https://github.com/blur88/erp2/issues/1729) (body updated, [decision comment](https://github.com/blur88/erp2/issues/1729#issuecomment-6758647887)) | Parent specification: R5, R8, R10, R15 and R17–R19 amended; R20–R23 added; D1–D6 unchanged | — |
| [#1766](https://github.com/blur88/erp2/issues/1766) (body amended) | Reuse eligibility: fresh reviewer contexts only, recorded launch method, fail closed, review started after the commit (R20) | Start-up guidance is owned by #1786 |
| [#1772](https://github.com/blur88/erp2/issues/1772) ([assessment comment](https://github.com/blur88/erp2/issues/1772#issuecomment-6758651466)) | Records that PR #1781 does not qualify for D6; D6 stays unchecked | — |
| [#1783](https://github.com/blur88/erp2/issues/1783) | Review-directory resolution bug (1782-Q8; implementation-ready change 1) | Integration order: merge before #1785 and #1787 (preference, not a blocker) |
| [#1784](https://github.com/blur88/erp2/issues/1784) | Required PR-body and CodeQL checks (1782-Q6, Q12); owner action on the ruleset | — |
| [#1785](https://github.com/blur88/erp2/issues/1785) | GitHub-visible criteria source and the draft-PR creation path (1782-Q4, Q11) | Uses #1783's resolver; owns the cross-ticket no-issue draft PR test |
| [#1786](https://github.com/blur88/erp2/issues/1786) | Fresh-context reviewer start-up and waiting guidance (implementation-ready changes 2–5) | Does not duplicate #1766 eligibility logic |
| [#1787](https://github.com/blur88/erp2/issues/1787) | Live GitHub CI merge gate (1782-Q3, Q7, Q9, Q10; absorbs implementation-ready change 6) | Final live seven-check verification is blocked by #1784; fixture work is not |

## 9. Open questions and unverifiable items

- Installed apps could not be listed: `repos/…/installation` returned 401 and
  `/user/installations` returned 403. Absence of review apps is inferred from the check
  suites, reviews, comments and ruleset, not from an installation list.
- No Copilot code-review configuration endpoint was confirmed. The Copilot
  conclusion rests on the absence of Copilot reviews and check suites on this PR and
  on the 30 recent merged PRs.
- Secret scanning push protection exposes no per-PR result.
- The quota formula, and account-wide usage from other sessions in the same window,
  cannot be determined from the logs.
- The fresh-context reviewer cost is an estimate (section 6), not a measurement.
- Whether the forked history influenced the reviewers' conclusions cannot be
  determined from counts.
- The notes record that round 01 reviewer responses "hit usage limit" after the
  reports were saved. The ledger validates, but the reviewers' final messages were not
  inspected.
- The local ledger, evidence and Codex rollouts are machine-local and gitignored or
  outside Git. GitHub API responses were not saved to the evidence directory during
  this read-only investigation.

## 10. Sources

- GitHub API (2026-11-10):
  - `gh api repos/blur88/erp2/pulls/1781`, `/pulls/1781/reviews`, `/pulls/1781/comments`;
  - `gh api repos/blur88/erp2/issues/1781/comments`, `/issues/1781/timeline`;
  - GraphQL `pullRequest(number:1781){reviewDecision reviews reviewRequests userContentEdits}`;
  - `gh api repos/blur88/erp2/commits/9bd7bf3216753c14f226f89fe99d7405cc187c85/check-runs`,
    `/check-suites`, `/status`;
  - `gh api "repos/blur88/erp2/actions/runs?head_sha=9bd7…"`, and `/actions/runs/<id>/jobs`
    and `/artifacts` for 42729579275, 42729579601, 42735639369 and 42729574756;
  - `gh api repos/blur88/erp2/code-scanning/default-setup`,
    `/code-scanning/analyses?sha=9bd7…`, `/code-scanning/alerts?ref=refs/pull/1781/head`;
  - `gh api repos/blur88/erp2/rulesets`, `/rulesets/15609777`, `/rules/branches/main`,
    `/branches/main/protection`, `/hooks`, `repos/blur88/erp2`;
  - `gh api repos/blur88/erp2/installation`, `gh api /user/installations`.
- Issues: [#1782](https://github.com/blur88/erp2/issues/1782),
  [#1729](https://github.com/blur88/erp2/issues/1729) (body, comments, and the
  [Q1–Q8 decision](https://github.com/blur88/erp2/issues/1729#issuecomment-6732701963)),
  [#1766](https://github.com/blur88/erp2/issues/1766), [#1772](https://github.com/blur88/erp2/issues/1772).
- Repository: `.github/workflows/ci.yml`, `pr-body.yml`, `release.yml`,
  `e2e-leakcheck.yml`; `.github/rulesets/main-protection.json`; `.claude/settings.json`;
  `scripts/check-review-ledger.mjs`, `scripts/review-state.mjs`,
  `scripts/review-pr-hook.mjs`, `scripts/check-pr-body.cjs`;
  `docs/agents/code-review.md`, `AGENTS.md`, `CODING_STANDARDS.md`,
  `docs/agents/development-reference.md` (Pull requests).
- Local ledger (gitignored), under `.scratch/branch-chore-retro-1780-tooling/`:
  - `reviews.md`, `round-0{1,2,3}.started`;
  - `review-round-01.md`, `.patch`, `.snapshot.json`;
  - `review-round-03.md`, `standards01.md`, `spec01.md`, `premerge03.md`, `scope.md`,
    `notes.md`, `pr-body.md`;
  - `evidence/`;
  - `node scripts/check-review-ledger.mjs state .scratch/branch-chore-retro-1780-tooling`.
- Harness logs (outside Git): Codex rollouts under `~/.codex/sessions/2026/11/10/` for
  threads `01a1c12e-693a-74a0-b4ff-39e881f2e19c` (implementer),
  `01a1c15d-024e-7f61-9838-2266c627ba4d`, `01a1c15d-25fd-7c91-8318-d78a35418c31` and
  `01a1c30f-276d-7db0-9e31-136ec2acbb3e` (reviewers). The Claude Code project directory
  `~/.claude/projects/-home-blur-erp2/` was searched; no transcript there covers PR #1781.

## 11. #1782 acceptance-criteria check

Each criterion of [#1782](https://github.com/blur88/erp2/issues/1782) is assessed
against this record. A follow-up issue existing doesn't count as evidence; the
findings below are the evidence.

| # | Criterion | Satisfied by | Status |
|---|---|---|---|
| 1 | Inventory every GitHub review and check mechanism; link evidence for PR #1781 at the exact SHA; state explicitly if no semantic review ran | Sections 1 and 2, with the commands in section 10. "No semantic GitHub review ran" is stated with the API evidence. The installation listing could not be read (section 9), and that limitation is disclosed. | Met, with the disclosed limitation |
| 2 | Coverage comparison across the seven obligations | Section 3 matrix | Met |
| 3 | Why the existing reviews did or did not qualify for reuse; working-tree and inherited coverage versus a committed full-PR review | Section 4 | Met |
| 4 | Overlap with #1766 and #1772 under #1729; reuse the planned mechanisms | Section 5; the outcomes are in section 8, where #1766 is amended rather than a competing gate being created | Met |
| 5 | Measure avoidable overhead; separate policy-required work from inefficiency; narrow improvements | Section 6. Measured from Codex logs, because no Claude Code transcript covers PR #1781. The quota formula is not determinable (section 9). | Met, with the disclosed limitation |
| 6 | Which evidence satisfies each obligation, when a fresh review is required, how the guarded merge validates; owner decisions kept separate | Section 7: evidence table, guarded-merge validation, owner decisions (now resolved) and implementation-ready changes | Met |
| 7 | A durable record and issue update; follow-ups created and linked only after the comparison | This record (tracked). Follow-ups were created after the comparison and owner decisions (section 8). | Met when this record merges |
