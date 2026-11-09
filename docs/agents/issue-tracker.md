# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Owner decisions**: a choice an issue reserves for the owner is decided in an issue comment before implementation. An issue with an open owner decision is `ready-for-human`, not `ready-for-agent`; adding such a question to a `ready-for-agent` issue moves it back. When a `/grill-with-docs` or `/grilling` session settles decisions for an issue, post them as one issue comment, one line per decision, before implementation starts. Incident: #1710, PR #1733.
- **Adding scope**: edit the issue body's acceptance criteria when a follow-up adds scope; the comment explains why. The body stays the spec.

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: never with `gh issue close` directly unless the owner explicitly requests it. Issues close through the PR that resolves them.
  - External-only work uses a completion-record PR with `Closes #<n>`; follow the [external-file workflow](external-files.md). Close by hand with an evidence comment only on the owner’s explicit request.
- **Referencing issues from a PR**:
  - `Closes #<n>`: only when the PR fully resolves the issue. GitHub closes it on merge.
  - `Refs #<n>`: when the PR covers part of the issue. The issue stays open.
  - `/pr` guidance: use only `Refs #<n>` for issues this PR must not close. Never put a closing keyword next to an issue number this PR must not close, including URL and Markdown reference forms. Never write a sentence about not closing, because GitHub ignores negation. Intentional closing references must occupy an entire line exactly as `Closes #<n>`, `Fixes #<n>`, or `Resolves #<n>`. The independent PR body workflow rejects other lines containing a closing keyword adjacent to a local issue number, an `owner/repo#<n>` reference, or an `https://github.com/<owner>/<repo>/issues/<n>` URL, including optional colons and omitted spaces. It runs on body edits as well as new commits.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

Dependabot alert numbers use a separate namespace from issue and PR numbers. For a security alert URL or alert ID, fetch the alert with `gh api repos/<owner>/<repo>/dependabot/alerts/<alert-number>`; do not treat the alert number as an issue or PR number or apply issue labels to it. The alert ID can match an unrelated issue or PR number.

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
