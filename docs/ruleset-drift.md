# Ruleset drift detection

Refs #1898. `.github/ruleset-15609777.snapshot.json` is the reviewed baseline
for repository ruleset 15609777. The daily workflow compares target, enforcement,
conditions and all rules, including their parameters and required checks. Object
keys and array ordering are normalized; metadata is ignored. A configuration
change fails the run and prints a unified diff. API errors and missing fields
also fail the run. The schedule becomes active after merging to the default branch.

The workflow uses only the existing `GITHUB_TOKEN` with `contents: read`.
A workflow-token probe with these permissions succeeded in
[run 43743444140](https://github.com/blur88/erp2/actions/runs/43743444140),
step “Probe observable ruleset access (#1898)”. The probe was then removed.
Local `gh` credentials were not used as evidence of workflow-token access.

`bypass_actors` is deliberately excluded because reading it requires elevated
ruleset access. The 2026-11-07 bypass-mode change would **not** have been detected;
the addition of the `pull_request` rule that day would have been detected.

This detects drift; it does not prevent changes. Neither the workflow nor the
comparison script writes ruleset settings or updates the snapshot. To accept an
intentional change, inspect the live configuration, update the four baseline
fields, and submit the baseline update for review. Do not include bypass actors
or introduce privileged credentials. If token access fails, report the limitation
on #1898 rather than seeking additional credentials.

Workflow linting runs actionlint 1.7.12 with ShellCheck in the existing backend CI
job. It checks workflow syntax, expressions and shell quality; it does not prove
release logic is correct. The tags-only release architecture remains in place.
