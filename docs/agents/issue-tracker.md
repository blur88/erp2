# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.

  GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.
- **Read once, extract narrowly**: fetch each issue or PR once with `gh`, selecting the needed JSON fields and extracting with `--jq`. For large responses, write the JSON to a local file and use `jq` to read only the fields needed for the current step. Reuse that copy instead of fetching the same item through another channel (such as a GitHub connector); use the documented CLI directly without searching the tool catalog for a GitHub tool. A fresh Spec reviewer still retrieves the original issue, comments and referenced Agent Brief directly as required by [Review guidance](review.md), once per source in that review. Fetch again only when checking for changed state or content.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **GitHub Actions check evidence:** when combined commit status is empty or incomplete, use `gh pr checks <PR> --json name,state,bucket,link` and preserve pending states in the handoff.
- **Blocking waits**: wait for the relevant CI result required by [Review guidance](review.md) using one blocking command under an explicit timeout: `timeout 30m gh pr checks <PR> --watch` for PR checks, or `timeout 30m gh run watch <run-id> --exit-status` for a workflow run. Choose a timeout appropriate to the job. Let the command watch until completion instead of issuing repeated sleep-and-check turns. On timeout, preserve pending states in the handoff; a timeout does not establish success. For long-running local commands, likewise use one invocation with a sufficient execution timeout. If the tool yields a running command, use its completion notification or a blocking wait with the longest supported wait interval instead of repeated empty status reads; keep required progress updates brief.

  **Codex example (check the current session's tool limits):** prefer completion notifications only when the harness can resume the session on completion. In the `functions.exec` path below, `notify()` only injects output into the current execution; it does not resume a later model turn. With a progress update required at least every 60 seconds and blocking waits capped at 60 seconds, use these calls (replace PR `123` and session ID `12345` with the actual values):

  ```js
  // @exec: {"yield_time_ms": 35000}
  // functions.exec: launch the watcher exactly once.
  text(await tools.exec_command({
    cmd: "timeout 30m gh pr checks 123 --watch --interval 15",
    yield_time_ms: 30000,
    max_output_tokens: 1200,
  }));
  ```

  Keep the `// @exec:` pragma on the **first line** of the actual tool input. Here `exec_command` supports at most 30000 ms, so the initial terminal wait is 30 seconds; the outer yield allows 5 seconds of scheduling overhead. If the result contains `session_id`, send a brief progress update and wait on that same session:

  ```js
  // @exec: {"yield_time_ms": 58000}
  text(await tools.write_stdin({
    session_id: 12345,
    chars: "",
    yield_time_ms: 55000,
    max_output_tokens: 1200,
  }));
  ```

  Repeat only the second call while the terminal session is running, with brief progress updates between calls. The 55-second terminal wait and 58-second outer yield share one progress interval, with 3 seconds for overhead; leaving the outer yield at its 30-second default would add an outer wait each cycle. Do not request status solely to compose progress text. If `functions.exec` itself returns `Script running with cell ID ...`, resume that cell with `functions.wait` before issuing another terminal call; bound its wait by the time remaining until the next progress update. Repeated outer yields indicate the settings need adjusting within the supported limits. Never start another watcher to compensate for a yield.

  Preserve the terminal's actual `exit_code`: `0` means success, `1` check failure, `8` pending checks where returned by `gh pr checks`, and `124` means the overall `timeout` expired (other nonzero codes remain errors). Do not swallow the result with `|| true` or a trailing successful shell command. Capture `gh pr view 123 --json headRefOid` before watching and again with final evidence, `gh pr checks 123 --json name,state,bucket,link`; confirm the head is unchanged and record each relevant run's `headSha`, `url` and `conclusion` using `gh run view <run-id> --json headSha,url,conclusion`. If the head changed, the watch does not verify the new head. Report pending checks as pending on timeout, alongside the actual exit result.

  For a measured demonstration, count from the model response launching the watcher through the response observing its completion, including terminal waits, outer execution waits and any intervening tool calls. Record tool-call turns and model responses separately, elapsed time and each count per minute, commands, timing settings, PR head SHA/run links and final result. Final evidence capture and a later attribution recheck after a PR-description edit are outside this boundary. Explain tool-limit effects and claim token or meter savings only with measurements.
- **Retro scope**: before folding retro scope into an existing issue, check its state (`gh issue view <n> --json state`); put unfinished work in a suitable open issue, or create a linked follow-up if the original is closed and none exists (the #1809 regression-check addendum landed after closure and was resolved in [#1824](https://github.com/blur88/erp2/issues/1824)).

  A post-merge retro may run in a fresh or compacted session against the original session's log. Codex rollout files live under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Find the original thread by id, title or time window in the `threads` table of `~/.codex/state_5.sqlite`, then use its `rollout_path`. Sub-agent threads are linked by `parent_thread_id` and `child_thread_id` in `thread_spawn_edges`; join the child id to `threads.id` to locate their logs too. Open the index in read-only mode and read logs locally; publish findings rather than uploading raw logs to the tracker.

- **Follow-up dependencies**: when work depends on an artifact, name the observable result and link the issue that tracks it; #1817's manifest-metadata check depended on the licence regression Bats spec tracked in [#1824](https://github.com/blur88/erp2/issues/1824), with that spec running in `npm run test:scripts` as the observable result.
- **Owner decisions**: record decisions affecting follow-up work as a comment on the relevant issue, with local notes linking to that comment; the e2e worker-recycling deferral is recorded in [#1820's closing comment](https://github.com/blur88/erp2/issues/1820#issuecomment-6858832080) and audit decision D6 in [MAIN_ANCESTRY_AUDIT_1820.md](../deployment/MAIN_ANCESTRY_AUDIT_1820.md).

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Verifying provenance claims

When you write a ticket that cites a commit or says what a branch contains, check the claim against `origin/main` before relying on it:

- `git fetch -q --prune origin && git merge-base --is-ancestor <sha> origin/main`: exit 0 means the commit reaches `main`; exit 1 means it does not; exit 128 means no fetched branch holds the SHA, so check it for a typo.
- `git branch -r --contains <sha>` (lists the remote branches that hold it)

If the commit is not on `origin/main`, name the branch that `--contains` lists. If it lists none, say the commit is on no remote branch and do not cite it as provenance. This applies only to provenance claims, not to every SHA in a ticket.

Before a brief asserts file presence or absence, refresh and check the cited ref and name that ref in the claim. Paths are relative to the repository root, regardless of the working directory. Report presence or absence only when both the fetch and tree lookup succeed. For example, check whether `package-lock.json` is tracked on `origin/main`:

```sh
# ls-tree prints the path only if the file is tracked on origin/main.
# Its exit status is 0 whether or not the file exists, so test the output.
git fetch -q --prune origin &&
tracked_path=$(git ls-tree --full-tree --name-only origin/main -- package-lock.json) &&
{ [ -n "$tracked_path" ] && echo present || echo absent; }
```

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
