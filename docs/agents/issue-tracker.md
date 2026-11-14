# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.

  GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`
- **GitHub Actions check evidence:** when combined commit status is empty or incomplete, use `gh pr checks <PR> --json name,state,bucket,link` and preserve pending states in the handoff.
- **Retro scope**: before folding retro scope into an existing issue, check its state (`gh issue view <n> --json state`); put unfinished work in a suitable open issue, or create a linked follow-up if the original is closed and none exists (the #1809 regression-check addendum landed after closure and was resolved in [#1824](https://github.com/blur88/erp2/issues/1824)).
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
