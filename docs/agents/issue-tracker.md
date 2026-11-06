# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Use `Closes #N` only when the PR finishes every open item in #N. Otherwise use `Refs #N` and keep #N open, or move the remaining items to a new linked issue first.

- **Guard or analyser issues**: include an acceptance criterion that every exclusion introduced by the implementation is named in a comment and pinned by a test case, following the test-coverage rule in [Tracked guard cases](../../CODING_STANDARDS.md#tracked-guard-cases).

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Cross-link overlapping issues**: when a new issue edits a file that another open issue targets, link both ways: add `Related: #<n>` with one line on the overlap to the new issue's body, and comment the same on the other issue. Name the conflicting requirement when you know it. A shared file means the two need comparing, not that they conflict.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

### Agent-authored text and owner decisions

Only the owner's own words, or a verbatim quote of those words that keeps their scope and qualifications and is labelled `relayed verbatim with the owner's permission`, record an owner decision. An agent posts such a quote only when the owner explicitly said in the session to post it; otherwise ask first. No separate quote of the permission is needed. A paraphrase, inference or phrase such as "accepted in review" records no decision. Posted text alone does not establish whether the owner or an agent wrote it; use the owner's words in the session to establish that distinction.

Existing PR footers may stay. Leave existing issues, PRs and comments unchanged.

These rules follow [issue #1693, Owner decision](https://github.com/blur88/erp2/issues/1693), where the owner chose no attribution for new text and kept existing text unchanged, and [issue #1693, Problem](https://github.com/blur88/erp2/issues/1693), where the owner accepted that posted text alone cannot identify its author. [Its triage decisions](https://github.com/blur88/erp2/issues/1693#issuecomment-6676702873) set the PR-footer sentence.

## Writing an agent brief

The next two paragraphs apply to every acceptance criterion an agent writes, in an issue body or brief comment, whatever the tool (`/retro`, `/to-tickets`, `/triage` or plain `gh issue create`).

Each criterion states something checkable on the merged diff or its recorded output, never an order in time. Where a standard requires an order, state its final state: "Change the owner first" becomes "The rule's authoritative source and every copy agree in the merged diff."

Each claim a criterion makes about existing code, tests or fixtures cites recorded evidence supporting that exact claim: a `file:line`, or a command and its output. "Passes unmodified" needs the relevant test run unchanged; a fixture search alone does not show it. One piece of evidence may support several criteria without repetition. [Issue #1688, Problem 3](https://github.com/blur88/erp2/issues/1688) records the uncheckable criteria; [brief D](https://github.com/blur88/erp2/issues/1688#issuecomment-6665850290) defines these requirements.

Creating a new issue needs no pointer sweep. Before posting a brief for issue #N, substitute its number and run:

```bash
git grep -nE '#N\b|issues/N\b' -- ':!docs/archive'
```

Every hit that hands unfinished work to the issue becomes an acceptance criterion that applies whichever way the work goes: either do the work, or reword the line to describe the resulting decision. Do not make pointer cleanup optional when the implementation is optional.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a planning session hands off a ticket

Before handing off, post the complete handoff to the ticket: every settled decision, each labelled **requirement** or **implementation choice**. Each decision carries the chosen option's concrete values (paths, names, commands) as the answer stated them: "back up to `~/.agents/skills-replaced/`", not "a collision-safe backup path". Where a decision replaces one recorded earlier on the ticket, name the one it supersedes. Unrecorded decisions cannot be relied on during implementation or review.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above, adding `createdAt` to the `--json` fields. Then run a **scope checkpoint** before editing:

1. List candidate commits: `git log --oneline --since=<createdAt> -- <files the ticket names>`. This only finds candidates.
2. Read each candidate's diff (`git show <sha> -- <file>`) against the ticket's targets and criteria. A conflict is a line-level fact: a target already changed, or a merged change a criterion would undo.
3. Post a comment on the ticket, before the first edit, recording:
   - the affected criteria and how each is now read;
   - work later commits already completed;
   - your proposed scope;
   - every scope interpretation raised while planning (sections in or out, how a rule's term is read), even when no later commit prompted it.

   Skip the comment only when step 2 found nothing and planning raised no interpretation.
4. If the work would reverse a merged decision, ask the ticket's owner and wait on that part. Proceed with the rest.

Implementers read only the ticket's body and comments, so a decision settled anywhere else is lost unless it lands here.

## When a ticket asks for red-first evidence

Before planting a fault, name the test case or assertion expected to fail; record that it failed there, then remove the fault and confirm the full suite passes.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
