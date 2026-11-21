## Summary

<!-- What changed and which modules are affected? Include UI screenshots for frontend changes. -->

## Related issue

Closes #

## Verification

[Integration PR evidence instructions](../CODING_STANDARDS.md#integration-ticket-evidence)

<!-- Select applicable commands from AGENTS.md's Change-Scoped Verification section.
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

A PR with required checks still running stays in draft until results are in. A PR marked ready for review must not describe required verification as "in progress".
