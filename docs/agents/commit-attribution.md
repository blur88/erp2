# Commit and PR attribution

Commit messages and PR bodies must not contain AI attribution. [#2017](https://github.com/blur88/erp2/issues/2017) turned the rule in [AGENTS.md](../../AGENTS.md#commit--pull-request-guidelines) into a check.

## What is rejected

The detector is [`scripts/ai-attribution.cjs`](../../scripts/ai-attribution.cjs). It judges each line, including lines inside code fences, quotes and HTML comments.

- A credit trailer (the keys are `creditKey` in the detector) whose value names an AI tool or uses a tool-style mailbox (such as `noreply@`) on an AI vendor domain. A person with a vendor email address is not rejected. Key case, spacing around the colon, quotes and a missing email do not matter.
- A `Claude-Session:` line, whatever it contains.
- A line holding a recognized AI session URL (Claude Code, Claude, ChatGPT or Gemini conversation links).
- A line that is only an attribution, such as `Generated with Claude Code`, `Created by ChatGPT` or `Generated with AI assistance`, with or without emoji or Markdown around it.

## What is accepted

- Human `Co-Authored-By` trailers, including a person named Claude. A name made up only of tool and model words (`Claude`, `Claude Opus 4.1`, `claude[bot]`, `OpenAI Codex`) is treated as the tool; `Claude Dupont` or `Codex Jones` is a person.
- Prose, inline code and links that mention AI tools or this rule, such as ``The `Co-Authored-By: Claude` trailer is rejected``, `Built with OpenAI SDK support` or a link to a product page. To quote an example, keep it inside a sentence rather than at the start of a line.

The tool list is a denylist and cannot be complete: an unlisted assistant is not caught. Add it to the detector when one appears.

## Where it is enforced

- **CI (authoritative).** The required `Breaking Change Check` job runs [`scripts/breaking-change-check.cjs`](../../scripts/breaking-change-check.cjs), which checks the current PR body and every PR-owned commit message, including merge commits and non-final commits. It reads the body live through `gh api`, and its workflow also runs when the PR is edited, so editing the body revalidates it. A PR body or commit list it cannot read fails the check.
- **Local `commit-msg` hook (optional).** [`.githooks/commit-msg`](../../.githooks/commit-msg) runs the same detector before a commit is created. Enable it once per clone:

  ```bash
  git config core.hooksPath .githooks
  ```

  Git runs hooks from the working tree root, so this works in every worktree of the clone. Local hooks can be skipped (`git commit --no-verify`) or never installed, which is why the CI check decides.

## Fixing a failure

Edit the PR body, or remove the line from the commit message (`git commit --amend` for the latest commit, an interactive rebase for an earlier one) and push again. The failure lists each offending commit (first 12 hash characters) or the PR body, the line number and the matched text.
