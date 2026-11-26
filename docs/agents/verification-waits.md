# Verification waits

## Before waiting

1. Select applicable verification from changed files using
   [AGENTS.md](../../AGENTS.md#change-scoped-verification-required-before-pr).
   Identify which commands already have qualifying completed evidence and which
   remain before starting another run.
2. For an existing PR, perform the initial head and check inspection in the
   [PR template's verification instructions](../../.github/pull_request_template.md)
   once. If no PR exists, use local process results. An empty check list is not
   successful verification: if CI is expected, inspect its dispatch/queued state
   once before choosing a wait.
3. Choose local or CI execution for each required full suite before starting it.
   Before choosing local Docker verification from a worktree, read
   [Docker verification from Git worktrees](docker-from-worktrees.md).
   When CI covers the full suite on the current head, use targeted local checks
   as needed and follow the single-watcher guidance under [Wait for a result](#wait-for-a-result).
   For example, while implementing or fixing review findings, run the affected
   test files and any mutation probe (a temporary code break that a test must
   catch) locally. Once the maintainer authorizes a PR, take the applicable
   full suites from CI on the reviewed candidate. If full suites must run
   locally and would overload the host together, such as backend E2E and
   frontend coverage, run them one after the other. Reuse each completed qualifying run
   instead of repeating it, and keep every required check.
4. Choose a wait for the remaining work and state any useful expectation once.

## Wait for a result

Prefer one existing CLI watcher:

```sh
gh pr checks <pr> --watch --interval 60
# Or, when waiting for one identified Actions run:
gh run watch <run-id> --exit-status --compact --interval 60
```

Watch the checks that cover the applicable commands. `--required` alone may omit
applicable checks that branch protection does not require. A PR watcher covers
checks currently associated with the PR; an expected missing check still needs
investigation. Use `--fail-fast` only when an early failure is actionable, then
account for checks still running.

For local verification or a CLI watcher, use the host's supported process wait
or background completion notification. Keep the original process handle and
capture its exit code and final output. If the host returns before completion,
use its supported wait or notification mechanism for that same process.
Respect the host's actual blocking-call limits. Redirect repetitive watcher
display output to a temporary file when needed and inspect it at completion.
A watcher error, authentication failure, timeout, or interruption does not prove
the verification passed or failed.

When shortening test output, keep the full stdout and stderr in a log and
preserve the test process's exit status. For example, run this in Bash from
`frontend/` to display only the last 40 lines while retaining the full log:

```bash
(
  set -o pipefail
  mkdir -p test-results
  npm run test:coverage 2>&1 | tee test-results/coverage.log | tail -n 40
)
```

The frontend's `npm test` and `npm run test:coverage` also write JUnit reports
to the git-ignored paths specified in [frontend/package.json](../../frontend/package.json).
Each command replaces its previous report, so inspect and retain failure
evidence before rerunning.

If blocking or completion notifications are unavailable, poll summary status at
longer intervals, starting around 30 seconds and backing off to 60 seconds or the
host's allowed limit. Batch relevant checks in one status read per interval.
Read detailed logs only for a failure, a meaningful change needing investigation,
or evidence extraction.

## Report and collect evidence

Send progress updates for meaningful results, changed conditions, failures, or
necessary expectations. Follow higher-priority communication requirements; when
an update is required during a wait, explain what evidence remains or what the
next result will resolve without repeating unchanged pending status.

At completion, follow the PR template's final head check and evidence collection
instructions. For Actions, inspect a linked run's metadata with:

```sh
gh run view <run-id> --json headSha,status,conclusion,jobs,url
```

For failure investigation use `gh run view <run-id> --log-failed` (optionally
scoped with `--job <job-id>`). Read successful logs only when needed to extract
command evidence or reliable counts. Record actual results and links in the
PR template, including remaining verification, and follow its draft/ready rule.
