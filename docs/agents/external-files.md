# External-file workflow

An **external file** lives outside the repository's versioned tree. A
**baseline snapshot** is a preserved copy taken before changing those files.
A **current-state-against-spec review** assesses explicitly listed current files
against requirements when no snapshot exists. A **completion-record PR** commits
scope, review limits and reproducible local evidence; merging it does not install
or distribute the external implementation.

## Implement and verify

1. Identify the external files and originating issue. Before changes, copy the
   containing directory with `cp -a` to a new, git-ignored scratch directory.
   Verify the ignore rule, record the absolute snapshot path and timestamp with
   timezone, and preserve that snapshot across review rounds.
2. Implement and run isolated regression tests. Keep fixture execution separate
   from live validation, and record exact commands, exit codes and counts.
3. Review both Standards (repository rules and the review skill's smell baseline)
   and Spec (originating requirements). With a snapshot, the subject is
   `diff -ru <snapshot> <live-directory>`. Without one, explicitly list every
   current file reviewed. A review without a baseline cannot establish what changed.
4. Use the review convention's scratch ledger and round/report lifecycle. For the
   external subject set `PR baseline: N/A — external snapshot <path>`, or
   `PR baseline: N/A — no baseline`. Record the method, scope and limits. Review
   the repository-side completion record against its usual Git baseline separately.
5. Open a completion-record PR with `Closes #<n>` only when the issue is fully
   resolved. Include scope, snapshot path/time, review method/limits, exact local
   verification commands/results, environment requirements and installation limits.
   Run the repository's applicable checks for the record and guidance changes.

Repository CI cannot access or validate external files unavailable in a fresh
checkout. Evidence for those files comes from local checks; repository checks
validate only the committed material.

## Example: memory validator

For a memory validator change, snapshot the memory directory, run its persistent
fixture suite, validate the live notes separately, then review the external diff
and commit a verification record. The external project_memory_link_hygiene.md
note owns the validator location, suite command and local prerequisites; consult
it rather than duplicating those details in general workflow guidance.
