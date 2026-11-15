# Ruleset drift detection

Issue #1898 adds a daily read-only comparison of ruleset `15609777` against
`.github/ruleset-15609777.snapshot.json`. It also supports manual dispatch.
The baseline was captured from the public GitHub REST endpoint on 2026-11-16.
That unauthenticated response contained target, enforcement, conditions and rules;
the workflow uses only the built-in `GITHUB_TOKEN` with `contents: read` (and
GitHub's implicit metadata read access). No admin credential is needed.

Historical token-access evidence: the [probe in run 43743444140](https://github.com/blur88/erp2/actions/runs/43743444140)
from closed PR #1901 successfully returned all four required fields on 2026-11-15
using `GH_TOKEN: ${{ github.token }}` with `Contents: read` and `Metadata: read`.
The overall run was cancelled. This proves that probe's access, not current-head
CI success or execution of this new scheduled workflow; its first run after merge
still needs inspection.

The comparison sorts object keys and all arrays (treated as unordered configuration sets), ignores response metadata,
and retains rule parameters, including required check contexts and integration IDs.
Missing required fields fail validation rather than silently producing a baseline.
A changed configuration fails the run and prints a unified diff. An API access
failure also fails the run: report that limitation on #1898 and stop this part;
do not introduce a PAT, admin token or privileged integration.

`bypass_actors` is deliberately excluded: reading it requires elevated ruleset
access. The exact bypass-mode change on 2026-11-07 would **not** have been
detected. Adding the `pull_request` rule that same day would have been detected.
This workflow detects drift; it neither prevents nor modifies ruleset changes,
and never updates the snapshot automatically.

For an intentional change, inspect the live configuration, fetch the JSON using
`gh api repos/blur88/erp2/rulesets/15609777 > /tmp/ruleset-live.json`, then generate
a proposed baseline with `node scripts/compare-ruleset.cjs --normalize
/tmp/ruleset-live.json > /tmp/ruleset-proposed.json`. Review the diff before copying
it over the committed snapshot and submitting a PR. Never accept a baseline
solely to turn a failing run green.

The existing backend CI job runs `bash scripts/lint-workflows.sh`, installing
checksum-verified actionlint v1.7.12 and explicitly enabling the runner's
ShellCheck. It checks workflow syntax, expressions and shell quality; it does
not detect release logic defects. No required job names or release behavior change.
