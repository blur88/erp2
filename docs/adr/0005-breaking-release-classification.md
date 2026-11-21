# Check the release classification of every PR to main

Every PR to `main` declares whether it introduces a breaking change relative to the immediately preceding Release. CI checks that declaration against the configured semantic-release analyzer on the PR's own commits and reports a Release preview for the whole merge result. Breaking changes ship with upgrade documentation. A Maintainer exception grants permission to cross a Release boundary while keeping the classification, upgrade documentation and required checks in force.

We keep the Angular preset and use its `BREAKING CHANGE:` footer as the sole marker. An explicit major rule comes first so a footer selects a major release on every commit type. The previous custom rules selected a patch for a breaking refactor in [v1.171.4](https://github.com/blur88/erp2/releases/tag/v1.171.4). CI rejects `type!:` and `type(scope)!:` headers because the Angular preset drops them.

## Considered options

- Reviewer-only enforcement leaves the relationship between the declaration and commit metadata unchecked.
- Switching to the Conventional Commits preset would change established parsing and release-note behavior.
- Checking only Maintainer exceptions would miss ordinary PRs that introduce breaking changes.
- Banning footers on selected commit types would make release classification depend on the type of work that introduced the break.

## Merge invariant

Land PRs as merge commits so the commits CI classifies are the commits that reach `main`. The repository's merge settings use merge commits. The ruleset still permits squash and rebase, so maintainers must preserve this invariant when merging.
