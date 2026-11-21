## Summary

<!-- What changed and which modules are affected? Include UI screenshots for frontend changes. -->

## Related issue

Closes #

## Breaking release

- Breaking change: <!-- yes or no -->
- Upgrade documentation: <!-- repo-relative path, or N/A: <reason> when Breaking change is no -->

## Release boundary

<!-- Record any constraints the related ticket sets on what can merge or ship independently. Use "None stated" for constraints the ticket does not specify. -->

- Mergeable independently: <!-- Whether the ticket permits merging this PR on its own. -->
- Must ship together: <!-- Related tickets or PRs that must ship with this change. -->
- Maintainer decision: <!-- None, or the recorded exception decision -->
- Applicable ADR: <!-- Only for a maintainer exception -->
- Release-impact decision: <!-- Permalink, only for a maintainer exception -->

## Verification

<!-- Select applicable commands from AGENTS.md's Change-Scoped Verification section.
For an integration PR, link the ticket evidence comments per CODING_STANDARDS.md § Integration ticket evidence.
For CI evidence:
1. Identify the current PR head: gh pr view --json headRefOid
2. Retrieve results: gh pr checks --json name,state,bucket,link,workflow
3. Confirm each linked run tested that head SHA and the applicable command completed successfully.
   Recheck the head after collecting evidence; discard evidence invalidated by new commits.
Record the actual CI commands, conclusions and links below, following AGENTS.md's evidence
rules. Include test counts only when explicitly available in reliable CI output or artifacts;
never estimate counts or claim a pass without completed evidence. -->

PR head SHA (when citing CI):

| Command (with working directory) | Actual result | CI evidence link (if used) |
|---|---|---|
| | | |

### Checks not run, and why

<!-- List applicable checks not run and explain why, or state none. -->

## Known limitations or outstanding risks

<!-- Include migration or environment changes when applicable, or state none. -->

Before marking a draft PR ready for review, follow the [release checks](https://github.com/blur88/erp2/blob/main/docs/agents/merge-and-branch-cleanup.md#before-marking-ready-or-merging).

A PR with required checks still running stays in draft until results are in. A PR marked ready for review must not describe required verification as "in progress".
