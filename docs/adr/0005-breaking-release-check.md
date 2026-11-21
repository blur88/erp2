# Check every PR to main for breaking changes

Every PR to `main` declares whether it introduces a breaking change relative to the immediately preceding Release. CI checks that declaration against the configured semantic-release analyzer on the PR's own commits and reports a Release preview for the whole merge result. Breaking changes ship with upgrade documentation. Under a Maintainer exception, the Release must still carry the correct version, and the PR must still include any required upgrade documentation and pass all required checks. [Decision record](https://github.com/blur88/erp2/issues/1994)

We keep the Angular preset and use its `BREAKING CHANGE:` footer as the sole marker. An explicit major rule comes first so a footer selects a major release on every commit type. The previous custom rules selected a patch for a breaking refactor in [v1.171.4](https://github.com/blur88/erp2/releases/tag/v1.171.4). CI rejects `type!:` and `type(scope)!:` headers because the Angular preset drops them.

## Considered Options

- Reviewer-only enforcement leaves the relationship between the declaration and commit metadata unchecked.
- Switching to the Conventional Commits preset would change established parsing and release-note behavior.
- Checking only Maintainer exceptions would miss ordinary PRs that introduce breaking changes.
- Banning footers on selected commit types would make the Release type depend on the type of work that introduced the break.

## Consequences

Land PRs as merge commits so the commits CI classifies are the commits that reach `main`. The repository's merge settings use merge commits. The ruleset still permits squash and rebase, so maintainers must preserve this invariant when merging.
