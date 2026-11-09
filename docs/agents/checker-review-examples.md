# Controlled checker review examples

These examples exercise the reporting convention in [code review](code-review.md#checker-execution-evidence). They are controlled examples, not a real reviewer run or the D4 demonstration for #1729.

Use a disposable evidence directory under the resolved shared scratch root. The subject is a toy checker: `sh -c 'test "$1" = valid' checker INPUT`. Its contract accepts exactly `valid` and rejects everything else. Save the literal input in a fixture and capture both output streams and the exit status. The checker intentionally emits no output.

| Category | Fixture content | Expected result | Expected exit |
|---|---|---|---|
| valid | `valid` | accepted | 0 |
| invalid | `invalid` | rejected | 1 |
| edge | empty string | rejected | 1 |
| adversarial | `valid; exit 0` | rejected as literal input | 1 |

For each row execute the checker with the fixture content as a quoted argument, preserving the input rather than evaluating it as shell code. Record the actual result, actual exit status, fixture path, output path, exact command and state in the report.

Assess these controlled report variants:

| Report variant | Required assessment |
|---|---|
| All four executions saved, matching expected results, reproducible subject and commands recorded | Complete coverage for this toy contract; no findings |
| Invalid row contains only a proposed command | Incomplete coverage; missing execution; partial round |
| Edge row omitted | Incomplete coverage; missing category; partial round |
| Adversarial output file absent | Incomplete coverage; missing output; partial round |
| Exit status absent despite an output link | Incomplete coverage; missing exit status; partial round |
| Fixtures absent despite a passing summary | Incomplete coverage; missing inputs; partial round |
| Four complete executions, adversarial input unexpectedly accepted | Coverage may be complete; report a checker defect and assess its blocking severity |

For missing-evidence variants, retain the complete original evidence and create separate reports that deliberately omit the specified field or reference a nonexistent artifact. Never delete or rewrite original evidence. Verify that each assessment follows the coverage rule; these report assessments are manual, not enforcement by the ledger checker. Save the assessments alongside actual execution records in the shared evidence directory.
